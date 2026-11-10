// Canvas overlay that draws every friend's road tree growing outward at one
// shared rate (an invisible circle measured along the streets) until the
// frontiers meet. Coordinates are pre-projected to Web Mercator at zoom 0, so
// each frame is a cheap scale + translate.
import { treeSegments, pathTo } from './meet.js';

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
    this.layers = solution.people.map((person) => {
      const others = solution.people.filter((o) => o !== person);
      const segs = treeSegments(graph, person, this.limit, others, solution.meetNode);
      const count = segs.length / 6;
      const xy = new Float64Array(count * 4);
      const d = new Float64Array(count * 2);
      for (let i = 0; i < count; i++) {
        const a = proj(segs[i * 6], segs[i * 6 + 1]);
        const b = proj(segs[i * 6 + 2], segs[i * 6 + 3]);
        xy.set([a.x, a.y, b.x, b.y], i * 4);
        d[i * 2] = segs[i * 6 + 4];
        d[i * 2 + 1] = segs[i * 6 + 5];
      }
      // Highlighted route from this person to the meeting point.
      const route = [proj(person.lat, person.lon), ...pathTo(person, solution.meetNode).map((v) => proj(graph.lat[v], graph.lon[v]))];
      return { count, xy, d, route };
    });

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'growth-canvas';
    map.getContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this);
    this.redraw = () => this.draw();
    this.hide = () => { this.canvas.style.opacity = '0'; };
    this.show = () => { this.canvas.style.opacity = ''; this.draw(); };
    map.on('resize', this.resize);
    map.on('move', this.redraw);
    map.on('zoomstart', this.hide);
    map.on('zoomend', this.show);
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
    this.draw();
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
    const z = map.getZoom();
    const scale = 2 ** z;
    const origin = map.getPixelBounds().min;
    const ox = origin.x, oy = origin.y;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const r = this.r;
    const finished = this.done;

    this.layers.forEach((layer, li) => {
      const color = this.colors[li % this.colors.length];
      const { xy, d, count } = layer;
      const tips = [];
      ctx.beginPath();
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
          tips.push(x1, y1);
        }
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      // Soft glow pass, then a crisp core.
      ctx.globalAlpha = finished ? 0.12 : 0.22;
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = finished ? 0.45 : 0.95;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (!finished && tips.length) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (let i = 0; i < tips.length; i += 2) {
          ctx.moveTo(tips[i] + 2.2, tips[i + 1]);
          ctx.arc(tips[i], tips[i + 1], 2.2, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      if (finished) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        layer.route.forEach((p, i) => {
          const x = p.x * scale - ox, y = p.y * scale - oy;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resolve?.(false);
    this.map.off('resize', this.resize);
    this.map.off('move', this.redraw);
    this.map.off('zoomstart', this.hide);
    this.map.off('zoomend', this.show);
    this.canvas.remove();
  }
}
