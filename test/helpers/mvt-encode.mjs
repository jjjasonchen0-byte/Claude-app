// Writes small Mapbox Vector Tiles with line features, for tests.
const varint = (out, v) => { while (v > 127) { out.push((v % 128) | 128); v = Math.floor(v / 128); } out.push(v); };
const zigzag = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const key = (out, field, type) => varint(out, field * 8 + type);
const bytes = (out, field, arr) => { key(out, field, 2); varint(out, arr.length); for (const b of arr) out.push(b); };
const str = (s) => [...new TextEncoder().encode(s)];

/** layers: { name: [{ props: { class: 'minor' }, lines: [[[x, y], …]] }] } → tile bytes */
export function encodeTile(layers, extent = 4096) {
  const tile = [];
  for (const [name, features] of Object.entries(layers)) {
    const layer = [];
    key(layer, 15, 0); varint(layer, 2);
    bytes(layer, 1, str(name));
    const keys = [], values = [];
    const index = (list, v) => { let i = list.indexOf(v); if (i < 0) { i = list.length; list.push(v); } return i; };
    for (const f of features) {
      const feat = [];
      const tags = [];
      for (const [k, v] of Object.entries(f.props || {})) { varint(tags, index(keys, k)); varint(tags, index(values, v)); }
      bytes(feat, 2, tags);
      key(feat, 3, 0); varint(feat, f.type ?? 2);
      const geom = [];
      let cx = 0, cy = 0;
      for (const line of f.lines) {
        varint(geom, 1 + (1 << 3));
        varint(geom, zigzag(line[0][0] - cx)); varint(geom, zigzag(line[0][1] - cy));
        [cx, cy] = line[0];
        varint(geom, 2 + ((line.length - 1) << 3));
        for (const [x, y] of line.slice(1)) { varint(geom, zigzag(x - cx)); varint(geom, zigzag(y - cy)); cx = x; cy = y; }
      }
      bytes(feat, 4, geom);
      bytes(layer, 2, feat);
    }
    for (const k of keys) bytes(layer, 3, str(k));
    for (const v of values) { const val = []; bytes(val, 1, str(String(v))); bytes(layer, 4, val); }
    key(layer, 5, 0); varint(layer, extent);
    bytes(tile, 3, layer);
  }
  return Uint8Array.from(tile);
}
