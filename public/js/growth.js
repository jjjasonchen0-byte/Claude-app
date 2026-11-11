// Canvas overlay that races everyone's possible routes to the meeting point.
//
// Each person has several real routes ("branches"), all heading towards the
// meeting point. They grow together on one shared clock at that person's
// travel speed, so after "10 minutes" every branch has covered what that
// person travels in 10 minutes along it, and a dot marks each branch's tip.
// The first branch to reach the meeting point wins: it flashes bold, like a
// directions line, and the others stop and fade. Whoever has furthest to go
// is still moving when the others have arrived.
// Coordinates are pre-projected to Web Mercator at zoom 0, so each frame is a
// cheap scale + translate.

const RACE = { width: 2.2, alpha: 0.62 };   // every branch while racing
const LOST = { alpha: 0.1 };                  // branches that lost, once faded
const WIN = { width: 3.6, flash: 7, casing: 3.5 };
const FADE_MS = 650;
const FLASH_MS = 450;

/**
 * tracks: one per person,
 *   { color, branches: [{ pieces: [{ pts: [[lat, lon]], t0, t1, walk }], duration }], best }
 * `t0`/`t1` are seconds after setting off; `best` is the branch that arrives first.
 */
export class GrowthAnimation {
  constructor(map, tracks) {
    this.map = map;
    this.clock = 0;
    this.done = false;
    this.raf = 0;
    this.now = performance.now();
    const crs = L.CRS.EPSG3857;
    const proj = ([lat, lon]) => crs.latLngToPoint(L.latLng(lat, lon), 0);
    this.tracks = tracks.map((t) => {
      const best = t.best ?? 0;
      const branches = t.branches.map((b) => {
        const segs = [];
        for (const piece of b.pieces) addTimed(segs, piece.pts.map(proj), piece.t0, piece.t1, piece.walk);
        segs.sort((x, y) => x.s0 - y.s0);
        return { segs, duration: b.duration };
      });
      return { color: t.color, branches, best, arrive: t.branches[best].duration, arrivedAt: null };
    });
    this.total = Math.max(60, ...this.tracks.map((t) => t.arrive));
    this.branchCount = this.tracks.reduce((n, t) => n + t.branches.length, 0);

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

  /** Race until everyone's winning route has arrived. Resolves true if completed, false if cancelled. */
  play({ duration = 6000, onProgress } = {}) {
    cancelAnimationFrame(this.raf);
    this.done = false;
    this.skipRequested = false;
    for (const t of this.tracks) t.arrivedAt = null;
    return new Promise((resolve) => {
      this.resolve = resolve;
      const start = performance.now();
      let finishedAt = null;
      const step = (now) => {
        this.now = now;
        const t = Math.min(1, (now - start) / duration);
        // Steady clock; only the first 6% eases in.
        const eased = t < 0.06 ? (t * t) / 0.12 : t - 0.03;
        this.clock = this.skipRequested ? this.total : this.total * Math.min(1, eased / 0.97);
        for (const tr of this.tracks) {
          if (tr.arrivedAt == null && this.clock >= tr.arrive) tr.arrivedAt = this.skipRequested ? now - FADE_MS : now;
        }
        onProgress?.(this.clock, this.total);
        // Let the last winner's flash and the fading finish before handing over.
        if (this.clock >= this.total) finishedAt ??= now;
        if (finishedAt != null && now - finishedAt >= (this.skipRequested ? 0 : FADE_MS)) {
          this.done = true;
          this.draw();
          this.resolve = null;
          resolve(true);
          return;
        }
        this.draw();
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
    const X = (x) => x * scale - ox, Y = (y) => y * scale - oy;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size.x, this.size.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const trace = (segs, upTo) => {
      const ride = new Path2D(), walk = new Path2D();
      let tip = null;
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
        if (!tip || s.s0 >= tip.s) tip = { x: x1, y: y1, s: s.s0 };
      }
      return { ride, walk, tip };
    };
    const stroke = (p, { color, width, alpha, dotted = false }) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dotted ? [0.1, width * 2.6] : []);
      ctx.stroke(p);
    };

    const tips = [];
    const winners = [];
    for (const t of this.tracks) {
      const fade = this.done ? 1 : t.arrivedAt == null ? 0 : Math.min(1, (this.now - t.arrivedAt) / FADE_MS);
      // Branches stop growing once this person's winner arrives.
      const upTo = Math.min(this.clock, t.arrive);
      t.branches.forEach((b, i) => {
        if (i === t.best && t.arrivedAt != null) return; // drawn on top below
        const { ride, walk, tip } = trace(b.segs, upTo);
        const alpha = RACE.alpha * (1 - fade) + LOST.alpha * fade;
        // Racing branches are thin solid lines; only the chosen route shows walking as dots.
        stroke(ride, { color: t.color, width: RACE.width, alpha });
        stroke(walk, { color: t.color, width: RACE.width, alpha });
        if (t.arrivedAt == null && tip) tips.push({ ...tip, color: t.color, r: 3.4 });
      });
      if (t.arrivedAt != null) winners.push(t);
    }
    // The chosen routes: white casing, bold, with a short flash when they arrive.
    for (const t of winners) {
      const { ride, walk } = trace(t.branches[t.best].segs, t.arrive);
      const flash = this.done ? 0 : Math.max(0, 1 - (this.now - t.arrivedAt) / FLASH_MS);
      const width = WIN.width + (WIN.flash - WIN.width) * flash;
      stroke(ride, { color: 'rgba(255,255,255,0.95)', width: width + WIN.casing, alpha: 1 });
      stroke(ride, { color: t.color, width, alpha: 1 });
      stroke(walk, { color: t.color, width: width + 0.8, alpha: 1, dotted: true });
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const h of tips) {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fillStyle = h.color; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
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
