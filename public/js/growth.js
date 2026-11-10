// Canvas overlay that shows everyone's reach spreading along the streets at
// one shared rate (an invisible circle measured along the roads) until they
// meet. It is drawn softly:
//   • a pale wash of each person's colour over the streets reached so far,
//   • thin lines only along streets that lead somewhere (no dead-end twigs),
//     fading behind a slightly stronger leading edge.
// Coordinates are pre-projected to Web Mercator at zoom 0, so each frame is a
// cheap scale + translate.
import { treeSegments, pathTo, SEG_STRIDE } from './meet.js';

const WASH_M = 135;          // width of the wash along each street, in metres
const WASH_BLUR = 3;         // px, softens the wash's outline where supported
const WASH_ALPHA = 0.13;     // while spreading
const WASH_ALPHA_DONE = 0.08;
const LINE_ALPHA = 0.32;     // trails behind the edge
const EDGE_ALPHA = 0.75;     // the leading edge

export class GrowthAnimation {
  /**
   * @param map Leaflet map
   * @param graph road graph
   * @param solution result of solveMeeting()
   * @param colors one CSS colour per person
   */
  constructor(map, graph, solution, colors) {
    this.map = map;
    this.graph = graph;
    this.solution = solution;
    this.colors = colors;
    this.r = 0;
    this.done = false;
    this.raf = 0;

    const crs = L.CRS.EPSG3857;
    const proj = (lat, lon) => crs.latLngToPoint(L.latLng(lat, lon), 0);
    this.limit = solution.radius;
    this.band = Math.max(250, solution.radius * 0.14); // depth of the leading edge, metres
    this.layers = solution.people.map((person) => {
      const others = solution.people.filter((o) => o !== person);
      const segs = treeSegments(graph, person, this.limit, others, solution.meetNode);
      const count = segs.length / SEG_STRIDE;
      const xy = new Float64Array(count * 4);
      const d = new Float64Array(count * 2);
      const trunk = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        const o = i * SEG_STRIDE;
        const a = proj(segs[o], segs[o + 1]);
        const b = proj(segs[o + 2], segs[o + 3]);
        xy[i * 4] = a.x; xy[i * 4 + 1] = a.y; xy[i * 4 + 2] = b.x; xy[i * 4 + 3] = b.y;
        d[i * 2] = segs[o + 4];
        d[i * 2 + 1] = segs[o + 5];
        trunk[i] = segs[o + 6];
      }
      // Route from this person to the meeting point, shown once everyone meets.
      const route = [proj(person.lat, person.lon), ...pathTo(person, solution.meetNode).map((v) => proj(graph.lat[v], graph.lon[v]))];
      return { count, xy, d, trunk, route };
    });

    // One shared wash layer: where two people's areas touch, the later one
    // simply paints over the earlier, so overlaps never muddy into grey.
    this.wash = document.createElement('canvas');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'growth-canvas';
    map.getContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this);
    this.redraw = () => { this.clearTransform(); this.draw(); };
    this.onZoomAnim = (e) => this.followZoom(e.center, e.zoom);
    map.on('resize', this.resize);
    map.on('move zoom viewreset', this.redraw);
    map.on('zoomanim', this.onZoomAnim);
    this.resize();
  }

  resize() {
    const size = this.map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size.x * dpr);
    this.canvas.height = Math.round(size.y * dpr);
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    this.dpr = dpr;
    this.size = size;
    // The wash is soft, so it renders at 1× and is scaled up.
    this.wash.width = size.x;
    this.wash.height = size.y;
    this.draw();
  }

  /** During an animated zoom, transform the current picture to where the map is heading. */
  followZoom(center, zoom) {
    const map = this.map;
    const scale = map.getZoomScale(zoom, map.getZoom());
    const half = map.getSize().divideBy(2);
    const from = map.getPixelBounds().min;                     // current top-left, world px
    const to = map.project(center, zoom).subtract(half);         // final top-left, world px at new zoom
    // Same timing as Leaflet's own zoom animation, so it scales with the map
    // instead of blinking out while zooming.
    this.canvas.classList.add('zooming');
    L.DomUtil.setTransform(this.canvas, from.multiplyBy(scale).subtract(to), scale);
    this.zooming = true;
  }

  clearTransform() {
    if (!this.zooming) return;
    this.zooming = false;
    this.canvas.classList.remove('zooming');
    this.canvas.style.transform = '';
  }

  /** Animate until all frontiers meet. Resolves true if completed, false if cancelled. */
  play({ duration = 6000, onProgress } = {}) {
    cancelAnimationFrame(this.raf);
    this.done = false;
    return new Promise((resolve) => {
      this.resolve = resolve;
      const start = performance.now();
      const total = this.limit;
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        // Constant speed so every frontier advances at the same rate;
        // only the first 6% eases in.
        const eased = t < 0.06 ? (t * t) / 0.12 : t - 0.03;
        this.r = total * Math.min(1, eased / 0.97);
        this.draw();
        onProgress?.(this.r, total);
        if (t >= 1 || this.skipRequested) {
          this.r = total;
          this.done = true;
          this.draw();
          onProgress?.(total, total);
          this.resolve = null;
          resolve(true);
          return;
        }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  skip() { this.skipRequested = true; }

  draw() {
    const { ctx, map, dpr } = this;
    if (!this.size) return;
    const z = map.getZoom();
    const scale = 2 ** z;
    const origin = map.getPixelBounds().min;
    const ox = origin.x, oy = origin.y;
    const lat = map.getCenter().lat;
    const mpp = (156543.03 * Math.cos((lat * Math.PI) / 180)) / scale;
    const washW = Math.max(5, Math.min(90, WASH_M / mpp));
    const r = this.r;
    const finished = this.done;
    const edgeFrom = r - this.band;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size.x, this.size.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const wctx = this.wash.getContext('2d');
    wctx.clearRect(0, 0, this.wash.width, this.wash.height);
    wctx.lineCap = 'round';
    wctx.lineJoin = 'round';
    wctx.lineWidth = washW;
    const lines = this.layers.map((layer, li) => {
      const color = this.colors[li % this.colors.length];
      const { xy, d, trunk, count } = layer;
      const behind = new Path2D();
      const edge = new Path2D();
      wctx.beginPath();
      for (let i = 0; i < count; i++) {
        const d0 = d[i * 2];
        if (d0 >= r) break; // sorted by d0
        const d1 = d[i * 2 + 1];
        const x0 = xy[i * 4] * scale - ox, y0 = xy[i * 4 + 1] * scale - oy;
        let x1 = xy[i * 4 + 2] * scale - ox, y1 = xy[i * 4 + 3] * scale - oy;
        if (d1 > r) {
          const f = (r - d0) / Math.max(1e-9, d1 - d0);
          x1 = x0 + (x1 - x0) * f;
          y1 = y0 + (y1 - y0) * f;
        }
        wctx.moveTo(x0, y0);
        wctx.lineTo(x1, y1);
        if (!trunk[i] || finished) continue;
        const path = d1 >= edgeFrom ? edge : behind;
        path.moveTo(x0, y0);
        path.lineTo(x1, y1);
      }
      wctx.strokeStyle = color;
      wctx.stroke();
      return { color, behind, edge, route: layer.route };
    });

    // 1. The wash: the area each person can reach so far.
    ctx.globalAlpha = finished ? WASH_ALPHA_DONE : WASH_ALPHA;
    if ('filter' in ctx) ctx.filter = `blur(${WASH_BLUR}px)`;
    ctx.drawImage(this.wash, 0, 0, this.size.x, this.size.y);
    if ('filter' in ctx) ctx.filter = 'none';

    for (const { color, behind, edge, route } of lines) {
      // 2. Thin lines along streets that lead somewhere, stronger at the edge.
      if (!finished) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = LINE_ALPHA;
        ctx.lineWidth = 1.2;
        ctx.stroke(behind);
        ctx.globalAlpha = EDGE_ALPHA;
        ctx.lineWidth = 1.8;
        ctx.stroke(edge);
        continue;
      }
      // 3. Once everyone meets: each person's route, like a map directions line.
      ctx.globalAlpha = 1;
      ctx.beginPath();
      route.forEach((p, i) => {
        const x = p.x * scale - ox, y = p.y * scale - oy;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 6.5;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resolve?.(false);
    this.map.off('resize', this.resize);
    this.map.off('move zoom viewreset', this.redraw);
    this.map.off('zoomanim', this.onZoomAnim);
    this.canvas.remove();
  }
}
