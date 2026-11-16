// Travel times and routes worked out in the browser, over the same streets
// the search animation floods (the map's own tiles: see roads.js), for
// walking, cycling and driving.
//
// Why: finding the meeting point compares travel times to hundreds of spots.
// The free routing service lets about one request every ten seconds through
// from each address on the internet and holds the rest back or refuses them,
// so asking it made searches slow, or left them with straight-line guesses.
// Times over the map's streets need no requests at all. Directions to the
// place chosen still come from the routing services.
//
// The speeds were fitted to the routing service's own times (FOSSGIS OSRM)
// on Sydney's streets: 64 trips from 1 to 80 km, inner city to motorways.
// Its walking times match within 5% on the median trip, cycling within
// 11%, driving within 7%. Driving in a city is slow because of junctions,
// so passing through one costs a few seconds.
import { prepareNetwork, nearestNode } from './flood.js';
import { dijkstra } from './graph.js';
import { haversine } from './geo.js';

const TUNNEL = 16; // a flag on a street's kind (0 motorway … 7 footpath; see roads.js)
const ACCESS = 1.3; // from a door to the nearest street corner: a straight line, made this much longer
const MAX_TREES = 24; // shortest-path trees kept (one per person and way of travelling)

/**
 * How each way of travelling goes: km/h on each kind of street (motorway,
 * trunk, primary, secondary, tertiary, minor, service, footpath), whether it
 * may use road tunnels, and seconds added for each trip and each junction.
 */
export const MODELS = {
  walk: { kmh: [4.86, 4.86, 4.86, 4.86, 4.86, 4.86, 4.86, 4.86], tunnels: false, perTrip: 0, perJunction: 0 },
  bike: { kmh: [14.1, 14.1, 14.1, 14.1, 14.1, 14.1, 14.1, 14.1], tunnels: false, perTrip: 220, perJunction: 0 },
  drive: { kmh: [79, 61, 53, 47, 43, 34, 26, 0], tunnels: true, perTrip: 60, perJunction: 3 },
};

const noRoute = () => Object.assign(new Error('No route found'), { status: 404 });

/**
 * A router over a street network ({ lat, lon, A, B, kinds }, as roads.js
 * makes it), or over one prepared already by flood.js (`prepared`).
 * → { ok, net, covers(place, mode), travelTimes(mode, sources, destinations), directions(mode, from, to) }
 * The last two answer in the same form as the routing service's (see directions.js).
 */
export function createLocalRouter(roads, prepared = null) {
  const net = prepared || (roads?.A?.length ? prepareNetwork(roads) : null);
  if (!net) return { ok: false, net: null, covers: () => false };

  const tables = {};
  /** Seconds per metre by street kind, seconds through each corner, and the speed off the street (m/s). */
  const tableFor = (mode) => {
    if (tables[mode]) return tables[mode];
    const m = MODELS[mode] || MODELS.walk;
    const cost = Float64Array.from({ length: 256 }, (_, k) => {
      const kmh = m.kmh[k & 7];
      return !(kmh > 0) || ((k & TUNNEL) && !m.tunnels) ? Infinity : 3.6 / kmh;
    });
    let nodeCost = null;
    if (m.perJunction) {
      nodeCost = new Float64Array(net.n);
      for (let v = 0; v < net.n; v++) if (net.g.adjStart[v + 1] - net.g.adjStart[v] >= 3) nodeCost[v] = m.perJunction;
    }
    return (tables[mode] = { cost, nodeCost, offStreet: m.kmh[5] / 3.6, perTrip: m.perTrip });
  };
  const trees = new Map(); // "mode|corner" → { dist: seconds to every corner, parent }
  const treeFrom = (mode, node) => {
    const key = `${mode}|${node}`;
    let tree = trees.get(key);
    if (!tree) {
      if (trees.size >= MAX_TREES) trees.delete(trees.keys().next().value);
      const t = tableFor(mode);
      tree = dijkstra(net.g, node, null, t.cost, t.nodeCost);
      trees.set(key, tree);
    }
    return tree;
  };

  /** The nearest corner a place can be reached from this way, and getting from the door to it: { node, m, s }, or null. */
  const access = (p, mode) => {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) return null;
    const t = tableFor(mode);
    const node = nearestNode(net, p.lat, p.lon, t.cost);
    if (node < 0) return null;
    const m = haversine(p.lat, p.lon, net.lat[node], net.lon[node]) * ACCESS;
    return { node, m, s: m / t.offStreet };
  };

  /** Metres along the quickest way to a corner. */
  const metresTo = (tree, node) => {
    let m = 0;
    for (let v = node; tree.parent[v] !== -1; v = tree.parent[v]) m += haversine(net.lat[v], net.lon[v], net.lat[tree.parent[v]], net.lon[tree.parent[v]]);
    return m;
  };
  const roadMode = (mode) => {
    if (!MODELS[mode]) throw Object.assign(new Error('Not available for public transport'), { status: 400 });
    return mode;
  };

  return {
    ok: true,
    net,
    /** Can someone be routed from here this way? (Public transport riders: on foot.) */
    covers: (p, mode) => !!access(p, MODELS[mode] ? mode : 'walk'),

    /**
     * Sources × destinations: { durations: [[s|null]], distances: [[m|null]],
     * destinations: [[lat, lon]|null] } (each destination moved onto its
     * nearest street corner, null where there is none within reach).
     */
    async travelTimes(mode, sources, destinations) {
      roadMode(mode);
      const t = tableFor(mode);
      const ends = destinations.map((d) => access(d, mode));
      const durations = [], distances = [];
      for (const src of sources) {
        const a = access(src, mode);
        const tree = a && treeFrom(mode, a.node);
        const reach = (e) => a && e && Number.isFinite(tree.dist[e.node]);
        durations.push(ends.map((e) => (reach(e) ? Math.round(tree.dist[e.node] + a.s + e.s + t.perTrip) : null)));
        distances.push(ends.map((e) => (reach(e) ? Math.round(metresTo(tree, e.node) + a.m + e.m) : null)));
      }
      return { durations, distances, destinations: ends.map((e) => (e ? [net.lat[e.node], net.lon[e.node]] : null)), provider: 'local' };
    },

    /** The quickest way from one place to another along the streets: { mode, provider: 'local', duration, distance, geometry, alternatives }. */
    async directions(mode, from, to) {
      roadMode(mode);
      const a = access(from, mode), b = access(to, mode);
      if (!a || !b) throw noRoute();
      const tree = treeFrom(mode, a.node);
      if (!Number.isFinite(tree.dist[b.node])) throw noRoute();
      const geometry = [];
      for (let v = b.node; v !== -1; v = tree.parent[v]) geometry.push([net.lat[v], net.lon[v]]);
      geometry.reverse();
      return {
        mode, provider: 'local',
        duration: Math.round(tree.dist[b.node] + a.s + b.s + tableFor(mode).perTrip),
        distance: Math.round(metresTo(tree, b.node) + a.m + b.m),
        geometry, alternatives: [],
      };
    },
  };
}
