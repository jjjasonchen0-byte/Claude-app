// A minimal Mapbox Vector Tile reader: the lines of one layer of a tile,
// with their string properties. Enough to read the streets out of the
// base map's tiles without a library.
// Format: https://github.com/mapbox/vector-tile-spec (protocol buffers).

class Reader {
  constructor(buf, pos = 0, end = buf.length) { this.buf = buf; this.pos = pos; this.end = end; }
  varint() {
    let v = 0, mul = 1, b;
    do {
      b = this.buf[this.pos++];
      v += (b & 0x7f) * mul;
      mul *= 128;
    } while (b & 0x80);
    return v;
  }
  /** Skip a field's value, given its wire type. */
  skip(type) {
    if (type === 0) this.varint();
    else if (type === 1) this.pos += 8;
    else if (type === 2) this.pos += this.varint();
    else if (type === 5) this.pos += 4;
    else throw new Error(`Unsupported wire type ${type}`);
  }
  /** A length-delimited field as a sub-reader. */
  sub() { const len = this.varint(); const r = new Reader(this.buf, this.pos, this.pos + len); this.pos += len; return r; }
  string() { const r = this.sub(); return utf8.decode(this.buf.subarray(r.pos, r.end)); }
  /** Packed repeated varints. */
  packed() { const r = this.sub(); const out = []; while (r.pos < r.end) out.push(r.varint()); return out; }
}
const utf8 = new TextDecoder();

/** A layer's value (only strings are kept; numbers and booleans as text). */
function readValue(r) {
  let v = null;
  while (r.pos < r.end) {
    const tag = r.varint(), field = tag >> 3, type = tag & 7;
    if (field === 1 && type === 2) v = r.string();
    else if ((field === 4 || field === 5 || field === 7) && type === 0) v = String(r.varint());
    else r.skip(type);
  }
  return v;
}

const zigzag = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);

/** Decode a feature's geometry commands into lines of [x, y] tile coordinates. */
function readLines(cmds) {
  const lines = [];
  let x = 0, y = 0, line = null, i = 0;
  while (i < cmds.length) {
    const c = cmds[i++], id = c & 7, count = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k++) {
        x += zigzag(cmds[i++]); y += zigzag(cmds[i++]);
        if (id === 1) { line = [[x, y]]; lines.push(line); } else line?.push([x, y]);
      }
    } else if (id !== 7) break; // ClosePath has no parameters; anything else is malformed
  }
  return lines.filter((l) => l.length > 1);
}

/**
 * The line features of one layer: [{ props, lines: [[[x, y], …]] }] in tile
 * coordinates (0…extent), plus the layer's extent.
 */
export function readLayerLines(bytes, layerName) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tile = new Reader(buf);
  while (tile.pos < tile.end) {
    const tag = tile.varint();
    if (tag >> 3 !== 3 || (tag & 7) !== 2) { tile.skip(tag & 7); continue; }
    const layer = tile.sub();
    let name = null, extent = 4096;
    const keys = [], values = [], features = [];
    while (layer.pos < layer.end) {
      const t = layer.varint(), field = t >> 3, type = t & 7;
      if (field === 1 && type === 2) name = layer.string();
      else if (field === 2 && type === 2) features.push(layer.sub());
      else if (field === 3 && type === 2) keys.push(layer.string());
      else if (field === 4 && type === 2) values.push(readValue(layer.sub()));
      else if (field === 5 && type === 0) extent = layer.varint();
      else layer.skip(type);
    }
    if (name !== layerName) continue;
    const out = [];
    for (const f of features) {
      let tags = [], geomType = 0, geom = [];
      while (f.pos < f.end) {
        const t = f.varint(), field = t >> 3, type = t & 7;
        if (field === 2 && type === 2) tags = f.packed();
        else if (field === 3 && type === 0) geomType = f.varint();
        else if (field === 4 && type === 2) geom = f.packed();
        else f.skip(type);
      }
      if (geomType !== 2) continue; // lines only
      const props = {};
      for (let k = 0; k + 1 < tags.length; k += 2) props[keys[tags[k]]] = values[tags[k + 1]];
      const lines = readLines(geom);
      if (lines.length) out.push({ props, lines });
    }
    return { extent, features: out };
  }
  return { extent: 4096, features: [] };
}
