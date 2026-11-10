// Canvas overlay that shows each person's routes to the meeting point
// growing at one shared rate (an invisible circle measured along the roads)
// until they meet. Each person gets a small bundle of routes; every step of
// every route moves closer to the meeting point, so nothing branches off the
// wrong way. Once everyone arrives the alternatives fade and each person's
// best route stays, like a directions line.
// Coordinates are pre-projected to Web Mercator at zoom 0, so each frame is a
// cheap scale + translate.
import { routeBundle, dijkstra } from './meet.js';

// While growing: each person's main route a little stronger, the other
// options lighter. Once everyone has met: options fade, main route goes bold.
const MAIN = { width: 2.4, alpha: 0.85 };
const ALT = { width: 1.6, alpha: 0.4 };
const ALT_DONE = { width: 1.5, alpha: 0.16 };

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
    const pt = (v) => proj(graph.lat[v], graph.lon[v]);
    this.limit = solution.radius;
    const toMeet = dijkstra(graph, solution.meetNode).dist;
    this.layers = solution.people.map((person) => {
      const routes = routeBundle(graph, person, solution.meetNode, toMeet);
      // Everyone's routes arrive together when the shared radius reaches this
      // person's distance, so the "same rate" circle still holds.
      const arrive = person.reach;
      const segs = [];
      const seen = new Set();
      const door = proj(person.lat, person.lon);
      const first = pt(routes[0].path[0]);
      segs.push({ a: door, b: first, d0: 0, d1: person.gap, best: true });
      routes.forEach((route, ri) => {
        const scale = route.length > 0 ? (arrive - person.gap) / route.length : 0;
        let along = 0;
        for (let i = 1; i < route.path.length; i++) {
          const u = route.path[i - 1], v = route.path[i];
          const len = edgeLength(graph, u, v);
          const key = Math.min(u, v) * 1048576 + Math.max(u, v);
          const d0 = person.gap + along * scale;
          along += len;
          if (seen.has(key)) continue; // shared with a route already drawn
          seen.add(key);
          segs.push({ a: pt(u), b: pt(v), d0, d1: person.gap + along * scale, best: ri === 0 });
        }
      });
      segs.sort((x, y) => x.d0 - y.d0);
      const best = [door, ...routes[0].path.map(pt)];
      return { segs, best, routes: routes.length };
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
    const scale = 2 ** map.getZoom();
    const origin = map.getPixelBounds().min;
    const ox = origin.x, oy = origin.y;
    const r = this.r;
    const finished = this.done;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size.x, this.size.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.layers.forEach((layer, li) => {
      const color = this.colors[li % this.colors.length];
      const main = new Path2D();
      const alt = new Path2D();
      for (const s of layer.segs) {
        if (s.d0 >= r) break; // sorted by d0
        const path = s.best ? main : alt;
        const x0 = s.a.x * scale - ox, y0 = s.a.y * scale - oy;
        let x1 = s.b.x * scale - ox, y1 = s.b.y * scale - oy;
        if (s.d1 > r) {
          const f = (r - s.d0) / Math.max(1e-9, s.d1 - s.d0);
          x1 = x0 + (x1 - x0) * f;
          y1 = y0 + (y1 - y0) * f;
        }
        path.moveTo(x0, y0);
        path.lineTo(x1, y1);
      }
      ctx.strokeStyle = color;
      const altStyle = finished ? ALT_DONE : ALT;
      ctx.globalAlpha = altStyle.alpha;
      ctx.lineWidth = altStyle.width;
      ctx.stroke(alt);
      if (!finished) {
        ctx.globalAlpha = MAIN.alpha;
        ctx.lineWidth = MAIN.width;
        ctx.stroke(main);
      }

      // Once everyone meets: each person's best route, like a directions line.
      if (finished) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        layer.best.forEach((p, i) => {
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
    });
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

function edgeLength(g, u, v) {
  for (let e = g.adjStart[u]; e < g.adjStart[u + 1]; e++) if (g.adjNode[e] === v) return g.adjLen[e];
  return 0;
}
