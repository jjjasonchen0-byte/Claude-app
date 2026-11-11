// Canvas overlay that shows everyone's real routes to the meeting point
// growing on one shared clock: after "10 minutes" each line has covered what
// that person travels in 10 minutes, so whoever has further to go is still
// moving when the others have arrived. A dot marks where each person is.
// A person's other good routes grow lighter alongside; once everyone has
// arrived they fade and the main route stays, like a directions line.
// Coordinates are pre-projected to Web Mercator at zoom 0, so each frame is a
// cheap scale + translate.

const MAIN = { width: 3, alpha: 0.95 };
const ALT = { width: 2, alpha: 0.32 };
const ALT_DONE = { width: 1.8, alpha: 0.14 };

/**
 * One person's journey, for the animation:
 *   { color, pieces: [{ pts: [[lat, lon]], t0, t1, walk }], alts: [[[lat, lon]]], duration }
 * `t0`/`t1` are seconds after leaving; walking parts are drawn dotted.
 */
export class GrowthAnimation {
  constructor(map, tracks) {
    this.map = map;
    this.clock = 0;
    this.done = false;
    this.raf = 0;
    const crs = L.CRS.EPSG3857;
    const proj = ([lat, lon]) => crs.latLngToPoint(L.latLng(lat, lon), 0);
    this.total = Math.max(60, ...tracks.map((t) => t.duration || 0));
    this.tracks = tracks.map((t) => {
      const segs = [];
      for (const piece of t.pieces) addTimed(segs, piece.pts.map(proj), piece.t0, piece.t1, piece.walk);
      const alts = [];
      for (const line of t.alts || []) addTimed(alts, line.map(proj), 0, t.duration, false);
      segs.sort((a, b) => a.s0 - b.s0);
      alts.sort((a, b) => a.s0 - b.s0);
      return { color: t.color, segs, alts, duration: t.duration };
    });

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
    this.draw();
  }

  /** During an animated zoom, transform the current picture to where the map is heading. */
  followZoom(center, zoom) {
    const map = this.map;
    const scale = map.getZoomScale(zoom, map.getZoom());
    const half = map.getSize().divideBy(2);
    const from = map.getPixelBounds().min;
    const to = map.project(center, zoom).subtract(half);
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

  /** Animate until everyone has arrived. Resolves true if completed, false if cancelled. */
  play({ duration = 6000, onProgress } = {}) {
    cancelAnimationFrame(this.raf);
    this.done = false;
    this.skipRequested = false;
    return new Promise((resolve) => {
      this.resolve = resolve;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        // Steady clock; only the first 6% eases in.
        const eased = t < 0.06 ? (t * t) / 0.12 : t - 0.03;
        this.clock = this.total * Math.min(1, eased / 0.97);
        if (t >= 1 || this.skipRequested) {
          this.clock = this.total;
          this.done = true;
          this.draw();
          onProgress?.(this.total, this.total);
          this.resolve = null;
          resolve(true);
          return;
        }
        this.draw();
        onProgress?.(this.clock, this.total);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  skip() { this.skipRequested = true; }

  draw() {
    const { ctx, map, dpr } = this;
    if (!this.size) return;
    const scale = 2 ** map.getZoom();
    const origin = map.getPixelBounds().min;
    const ox = origin.x, oy = origin.y;
    const c = this.clock;
    const finished = this.done;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size.x, this.size.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const X = (x) => x * scale - ox, Y = (y) => y * scale - oy;

    const trace = (segs, upTo) => {
      const ride = new Path2D(), walk = new Path2D();
      let head = null;
      for (const s of segs) {
        if (s.s0 > upTo) break;
        const x0 = X(s.ax), y0 = Y(s.ay);
        let x1 = X(s.bx), y1 = Y(s.by);
        if (s.s1 > upTo) {
          const f = s.s1 > s.s0 ? (upTo - s.s0) / (s.s1 - s.s0) : 1;
          x1 = x0 + (x1 - x0) * f; y1 = y0 + (y1 - y0) * f;
        }
        const path = s.walk ? walk : ride;
        path.moveTo(x0, y0); path.lineTo(x1, y1);
        if (!head || s.s0 >= head.s) head = { x: x1, y: y1, s: s.s0 };
      }
      return { ride, walk, head };
    };

    // Lighter alternatives underneath.
    for (const t of this.tracks) {
      if (!t.alts.length) continue;
      const { ride } = trace(t.alts, finished ? Infinity : c);
      const st = finished ? ALT_DONE : ALT;
      ctx.globalAlpha = st.alpha; ctx.lineWidth = st.width; ctx.strokeStyle = t.color; ctx.setLineDash([]);
      ctx.stroke(ride);
    }
    // Main routes: white casing for rides, dotted walking parts, a dot for where each person is.
    const heads = [];
    for (const t of this.tracks) {
      const { ride, walk, head } = trace(t.segs, finished ? Infinity : c);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = MAIN.width + 3.5; ctx.stroke(ride);
      ctx.strokeStyle = t.color; ctx.lineWidth = MAIN.width; ctx.globalAlpha = MAIN.alpha; ctx.stroke(ride);
      ctx.globalAlpha = 1; ctx.setLineDash([0.1, 7]); ctx.lineWidth = 4; ctx.stroke(walk);
      if (!finished && head && c < t.duration) heads.push({ ...head, color: t.color });
    }
    ctx.setLineDash([]);
    for (const h of heads) {
      ctx.beginPath(); ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = h.color; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
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

/** Split a projected line into segments timed evenly by length between t0 and t1. */
function addTimed(out, pts, t0, t1, walk) {
  if (pts.length < 2) return;
  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); lens.push(l); total += l; }
  let along = 0;
  for (let i = 1; i < pts.length; i++) {
    const s0 = t0 + (total ? along / total : 0) * (t1 - t0);
    along += lens[i - 1];
    const s1 = t0 + (total ? along / total : 1) * (t1 - t0);
    out.push({ ax: pts[i - 1].x, ay: pts[i - 1].y, bx: pts[i].x, by: pts[i].y, s0, s1, walk });
  }
}
