// Finding the meeting point.
//
// Instead of downloading every street in the area, Meet asks a routing
// service for real travel times from everyone to a grid of candidate spots
// (one small request per way of travelling), keeps the best spot and zooms
// in around it a few times. "Similar times" means everyone's trips take about
// as long (without making the longest much longer than it has to be); "least
// total" means everyone's trips add up to the least time.
// People on public transport are first estimated from walking distance, then
// the two best spots are checked against real timetables. With a second,
// more exact source of travel times (Google, when the server has a key), the
// three best spots are checked against it for everyone.
import { haversine, paddedBBox, centroid, smallestEnclosingCircle, span } from './geo.js';

// Spots are placed on the street network of the most walkable way of travelling
// asked about (walking paths, then cycle routes, then roads): somewhere people
// can stand, not a motorway or a railway line.
const SNAP_ORDER = { walk: 0, bike: 1, drive: 2 };

export const SPEEDS = { walk: 1.35, bike: 4.2, transit: 6.5, drive: 9.5 }; // m/s, urban averages
const DETOUR = 1.3; // roads are about this much longer than a straight line
const TRANSIT_OVERHEAD = 360; // walking to the stop and waiting, seconds

/** Public transport estimate from a walking distance: never slower than walking. */
export const transitFromWalk = (m) => Math.min(m / SPEEDS.walk, TRANSIT_OVERHEAD + m / SPEEDS.transit);

/** Rough door-to-door seconds for a straight-line distance. */
export function estimateSeconds(mode, straightM) {
  const road = straightM * DETOUR;
  return mode === 'transit' ? transitFromWalk(road) : road / (SPEEDS[mode] || SPEEDS.walk);
}

/** n × n points spread evenly over a bounding box. */
export function grid(bbox, n) {
  const out = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out.push({ lat: bbox.s + ((bbox.n - bbox.s) * r) / (n - 1), lon: bbox.w + ((bbox.e - bbox.w) * c) / (n - 1) });
    }
  }
  return out;
}

const stats = (times) => {
  let max = 0, min = Infinity, sum = 0;
  for (const t of times) {
    if (t == null || !Number.isFinite(t)) return null;
    max = Math.max(max, t); min = Math.min(min, t); sum += t;
  }
  return { max, min, sum };
};

// "Similar times" may make the longest trip a little longer than it has to
// be (up to 12%, or 4 minutes) if that brings everyone's times closer
// together; any more and everyone ends up travelling further (a far-off
// hub where all trips are equally long is not a fair place to meet).
const SIMILAR_SLACK = 1.12;
const SIMILAR_MIN_SLACK_S = 240;

/**
 * Scoring for a set of spots already measured (lower is better):
 *  • 'similar' (the default; 'fair' in older settings): the smallest gap between
 *    the longest and shortest trip, among spots whose longest trip is close to
 *    the shortest it could be, then the shorter trips.
 *  • 'total': everyone's trips add up to the least time.
 */
export function makeScore(rule, rows, { bestMax: known = Infinity } = {}) {
  if (rule === 'total') return (times) => { const s = stats(times); return s ? s.sum + s.max * 0.01 : Infinity; };
  let bestMax = known;
  for (const r of rows) { const s = stats(r.times); if (s) bestMax = Math.min(bestMax, s.max); }
  const cap = Math.max(bestMax * SIMILAR_SLACK, bestMax + SIMILAR_MIN_SLACK_S);
  return (times) => {
    const s = stats(times);
    if (!s) return Infinity;
    return (s.max - s.min) + 0.1 * s.max + 10 * Math.max(0, s.max - cap);
  };
}

const timeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * Travel times (seconds) and distances (metres) from every person to every
 * candidate: people × candidates. Falls back to straight-line estimates for a
 * way of travelling whose service does not answer.
 */
async function evaluate(people, cands, { travelTimes, signal }) {
  const times = people.map(() => cands.map(() => null));
  const dists = people.map(() => cands.map(() => null));
  let snapped = null, snappedBy = null;
  let approx = false;
  // Walkers and public transport riders share one walking request.
  const groups = { walk: [], bike: [], drive: [] };
  people.forEach((p, i) => (groups[p.mode === 'transit' ? 'walk' : p.mode] || groups.walk).push(i));
  await Promise.all(Object.entries(groups).map(async ([mode, idx]) => {
    if (!idx.length) return;
    try {
      const t = await timeout(travelTimes(mode, idx.map((i) => people[i]), cands, { signal }), 12000);
      if (t.destinations?.length === cands.length && (!snapped || SNAP_ORDER[mode] < SNAP_ORDER[snappedBy])) { snapped = t.destinations; snappedBy = mode; }
      idx.forEach((pi, k) => {
        cands.forEach((_, j) => {
          const d = t.distances?.[k]?.[j];
          const s = t.durations?.[k]?.[j];
          dists[pi][j] = d ?? null;
          times[pi][j] = people[pi].mode === 'transit'
            ? (d != null ? transitFromWalk(d) : s != null ? transitFromWalk(s * SPEEDS.walk) : null)
            : s;
        });
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      approx = true;
      for (const pi of idx) estimate(pi);
    }
  }));
  // Someone the routing service can't route from at all (their address isn't
  // joined to the others' streets for their way of travelling): estimate
  // their trips from distance rather than give up on the whole group.
  function estimate(pi) {
    cands.forEach((c, j) => {
      const m = haversine(people[pi].lat, people[pi].lon, c.lat, c.lon);
      dists[pi][j] = m * DETOUR;
      times[pi][j] = estimateSeconds(people[pi].mode, m);
    });
  }
  people.forEach((_, pi) => {
    if (times[pi].every((t) => t == null)) { estimate(pi); approx = true; }
  });
  // And if no spot is reachable by everyone (say, two people on streets that
  // don't join up), fill the gaps with estimates too.
  if (!cands.some((_, j) => times.every((row) => row[j] != null))) {
    people.forEach((p, pi) => cands.forEach((c, j) => {
      if (times[pi][j] != null) return;
      const m = haversine(p.lat, p.lon, c.lat, c.lon);
      dists[pi][j] = m * DETOUR;
      times[pi][j] = estimateSeconds(p.mode, m);
      approx = true;
    }));
  }
  // The spot as snapped onto a street, when the service gave a usable one.
  const okPt = (s) => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]);
  const points = cands.map((c, j) => (okPt(snapped?.[j]) ? { lat: snapped[j][0], lon: snapped[j][1] } : { lat: c.lat, lon: c.lon }));
  return points.map((pt, j) => ({ ...pt, times: times.map((row) => row[j]), dists: dists.map((row) => row[j]), approx, snappedBy }));
}

/** Move a spot onto the nearest street people can walk on (when no one walks, spots sit on roads). */
async function onFoot(spot, from, { travelTimes, signal }) {
  try {
    const t = await timeout(travelTimes('walk', [from], [spot], { signal }), 8000);
    const d = t.destinations?.[0];
    if (Array.isArray(d) && Number.isFinite(d[0]) && Number.isFinite(d[1]) && haversine(spot.lat, spot.lon, d[0], d[1]) < 300) return { lat: d[0], lon: d[1] };
  } catch (err) {
    if (signal?.aborted) throw err;
  }
  return spot;
}

/**
 * Public transport riders: real travel times from each rider to every stop in
 * the area (one request each, leaving at `time`), so the meeting point is
 * picked among stops everyone can reach, by real times. Others' times to the
 * most promising stops come from the routing service. Null if it can't be done.
 */
async function viaStops(people, { rule, transitReach, travelTimes, directions, time, box, signal, onStatus }) {
  const riders = people.map((p, i) => (p.mode === 'transit' ? i : -1)).filter((i) => i >= 0);
  // Look comfortably further than the longest trip is likely to be.
  const mid = centroid(people);
  const longest = Math.max(...riders.map((i) => estimateSeconds('transit', haversine(people[i].lat, people[i].lon, mid.lat, mid.lon))));
  const max = Math.max(40, Math.min(120, Math.ceil((longest * 2.2) / 60)));
  onStatus('Checking public transport…');
  const reach = await Promise.all(riders.map((i) => timeout(transitReach(people[i], { box, max, time, signal }), 15000)));
  const key = (lat, lon) => `${Math.round(lat * 1000)},${Math.round(lon * 1000)}`;
  const maps = reach.map((r) => new Map((r?.cells || []).map((c) => [key(c[0], c[1]), c])));
  const common = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k)));
  if (!common.length) return null;
  let rows = common.map((k) => {
    const [lat, lon] = maps[0].get(k);
    const times = people.map((p, i) => {
      const r = riders.indexOf(i);
      return r >= 0 ? maps[r].get(k)[2] * 60 : estimateSeconds(p.mode, haversine(p.lat, p.lon, lat, lon));
    });
    const imp = Math.max(...maps.map((m) => m.get(k)[3] || 0));
    return { lat, lon, times, imp, dists: people.map((p) => haversine(p.lat, p.lon, lat, lon) * DETOUR), approx: false };
  });
  const others = people.map((p, i) => (p.mode === 'transit' ? -1 : i)).filter((i) => i >= 0);
  if (others.length) {
    // Walkers, cyclists and drivers: real times to the 60 most promising stops.
    const pre = makeScore(rule, rows);
    rows = rows.map((r) => ({ ...r, score: pre(r.times) })).sort((a, b) => a.score - b.score).slice(0, 60);
    const measured = await evaluate(others.map((i) => people[i]), rows.map((r) => ({ lat: r.lat, lon: r.lon })), { travelTimes, signal });
    others.forEach((pi, k) => rows.forEach((r, j) => {
      r.times[pi] = measured[j].times[k];
      r.dists[pi] = measured[j].dists[k] ?? r.dists[pi];
      r.approx ||= measured[j].approx;
    }));
  }
  // Similar (or least total) times, and between spots about as good, the bigger station.
  const topImp = Math.max(1, ...rows.map((r) => r.imp));
  // The shortest longest trip anywhere: how long the longest trip has to be at least.
  const floor = Math.min(...rows.map((r) => (r.times.every(Number.isFinite) ? Math.max(...r.times) : Infinity)));
  const rank = (list) => {
    const score = makeScore(rule, list, { bestMax: floor });
    return list.map((r) => ({ r, sc: score(r.times) - 90 * (r.imp / topImp) })).sort((a, b) => a.sc - b.sc).map((x) => x.r);
  };
  const ranked = rank(rows.filter((r) => r.times.every(Number.isFinite)));
  if (!ranked.length) return null;
  let best = ranked[0];
  // Those times count from leaving, waiting for the first bus or train
  // included; the journeys people are shown start when they need to leave
  // home. So the best few stops are checked against real journeys, and the
  // choice is made on those.
  if (directions) {
    const top = [];
    for (const r of ranked) {
      if (top.every((t) => haversine(t.lat, t.lon, r.lat, r.lon) > 300)) top.push(r);
      if (top.length === (riders.length > 4 ? 2 : 3)) break;
    }
    const checked = await Promise.all(top.map(async (cand) => {
      const times = [...cand.times];
      await Promise.all(riders.map(async (i) => {
        try {
          const d = await timeout(directions('transit', people[i], cand, { signal }), 9000);
          if (Number.isFinite(d?.duration)) times[i] = d.duration;
        } catch (err) {
          if (signal?.aborted) throw err;
        }
      }));
      return { ...cand, times };
    }));
    best = rank(checked)[0] || best;
  }
  return {
    meet: { lat: best.lat, lon: best.lon },
    times: best.times.map((t) => Math.round(t)),
    dists: best.dists.map((d) => Math.round(d)),
    real: people.map(() => !best.approx),
    approx: !!best.approx,
    tried: rows.length,
  };
}

/**
 * @param people [{ lat, lon, mode }]
 * @param opts.rule 'similar' | 'total'
 * @param opts.travelTimes (mode, sources, destinations, {signal}) → { durations, distances, destinations? }
 * @param opts.directions optional (mode, from, to) → { duration }: used to check public transport
 * @param opts.checkTimes optional (people, spots) → { durations, distances } ([person][spot], null if unknown):
 *   exact travel times for the best few spots, used to make the final choice
 * @param opts.transitReach optional (person, { box, max, time }) → { cells: [[lat, lon, minutes, importance]] }:
 *   public transport times to every stop in an area, for groups with riders
 * @param opts.time when everyone leaves (ISO), for public transport
 * @returns { meet: {lat, lon}, times: [s], dists: [m], real: [bool], approx }
 */
export async function findMeetingPoint(people, { rule = 'similar', travelTimes, directions, checkTimes, transitReach, time, signal, onStatus = () => {} } = {}) {
  if (people.length < 2) throw new Error('Add at least two people');

  // With public transport riders: pick among stops, by real timetables, when possible.
  if (transitReach && people.some((p) => p.mode === 'transit')) {
    try {
      const box = paddedBBox(people, 0.2, Math.max(400, span(people) * 0.45));
      const r = await viaStops(people, { rule, transitReach, travelTimes, directions, time, box, signal, onStatus });
      if (r) return r;
    } catch (err) {
      if (signal?.aborted) throw err;
      // Not available: fall back to estimates and timetable checks below.
    }
  }
  const all = [];
  // Scores depend on everything measured so far ("close to the shortest
  // possible longest trip"), so they are worked out again after each round.
  const add = (rows) => {
    all.push(...rows);
    const score = makeScore(rule, all);
    for (const r of all) r.score = score(r.times);
  };
  const best = () => all.reduce((a, b) => (b.score < a.score ? b : a));

  // Round 1: a coarse grid over everyone, plus the middle and the geometric fairest spot.
  // The area around the group, about half the group's width beyond everyone:
  // the spot with the most similar times can lie a little outside the group.
  const box = paddedBBox(people, 0.2, Math.max(400, span(people) * 0.45));
  const sec = smallestEnclosingCircle(people);
  let cellLat = (box.n - box.s) / 6, cellLon = (box.e - box.w) / 6;
  onStatus('Finding the fairest spot…');
  add(await evaluate(people, [...grid(box, 7), centroid(people), { lat: sec.lat, lon: sec.lon }], { travelTimes, signal }));

  // Then zoom in around the best spot so far, until the grid is about 200 m apart.
  for (let round = 0; round < 3; round++) {
    const b = best();
    if (!Number.isFinite(b.score)) break;
    const cellM = Math.max(cellLat * 111320, cellLon * 111320 * Math.cos((b.lat * Math.PI) / 180));
    if (round > 0 && cellM < 200) break;
    const fine = { s: b.lat - cellLat, n: b.lat + cellLat, w: b.lon - cellLon, e: b.lon + cellLon };
    add(await evaluate(people, grid(fine, 5), { travelTimes, signal }));
    cellLat /= 2; cellLon /= 2;
  }
  if (!all.some((r) => Number.isFinite(r.score))) throw new Error('No spot can be reached by everyone');

  // The best few spots, at least 250 m apart.
  const ranked = all.filter((r) => Number.isFinite(r.score)).sort((a, b) => a.score - b.score);
  const topSpots = (n) => {
    const top = [];
    for (const r of ranked) {
      if (top.every((t) => haversine(t.lat, t.lon, r.lat, r.lon) > 250)) top.push(r);
      if (top.length === n) break;
    }
    return top;
  };

  // Exact travel times for everyone to the three best spots, when there is a source for them.
  if (checkTimes) {
    const top = topSpots(3);
    onStatus('Checking travel times…');
    try {
      const t = await timeout(checkTimes(people, top.map((r) => ({ lat: r.lat, lon: r.lon })), { signal }), 10000);
      const score = makeScore(rule, all);
      const checked = top.map((cand, j) => {
        const times = cand.times.map((s, i) => t.durations?.[i]?.[j] ?? s);
        const dists = cand.dists.map((d, i) => t.distances?.[i]?.[j] ?? d);
        return { ...cand, times, dists, score: score(times), known: people.map((_, i) => t.durations?.[i]?.[j] != null) };
      });
      const pick = checked.reduce((a, b) => (b.score < a.score ? b : a));
      if (pick.known.some(Boolean)) {
        if (pick.snappedBy && pick.snappedBy !== 'walk') Object.assign(pick, await onFoot(pick, people[0], { travelTimes, signal }));
        return {
          meet: { lat: pick.lat, lon: pick.lon },
          times: pick.times.map((s) => Math.round(s)),
          dists: pick.dists.map((d, i) => Math.round(d ?? haversine(people[i].lat, people[i].lon, pick.lat, pick.lon) * DETOUR)),
          real: pick.known,
          approx: !pick.known.every(Boolean),
          tried: all.length,
        };
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      // Not available or not answering: carry on with the free estimates.
    }
  }

  // Public transport: check the two best (distinct) spots against real timetables.
  const riders = people.map((p, i) => (p.mode === 'transit' ? i : -1)).filter((i) => i >= 0);
  const real = people.map((p) => p.mode !== 'transit');
  let chosen = best();
  if (riders.length && directions) {
    const top = topSpots(2);
    onStatus('Checking public transport…');
    const score = makeScore(rule, all);
    const checked = await Promise.all(top.map(async (cand) => {
      const times = [...cand.times];
      const ok = await Promise.all(riders.map(async (i) => {
        try {
          const d = await timeout(directions('transit', people[i], cand, { signal }), 9000);
          // Walking straight there can beat the timetable.
          times[i] = Math.min(d.duration, cand.dists[i] != null ? cand.dists[i] / SPEEDS.walk : Infinity);
          return true;
        } catch (err) {
          if (signal?.aborted) throw err;
          return false;
        }
      }));
      return { ...cand, times, score: score(times), checked: ok };
    }));
    chosen = checked.reduce((a, b) => (b.score < a.score ? b : a));
    riders.forEach((i, k) => { real[i] = chosen.checked[k]; });
  }
  if (chosen.approx) real.fill(false);
  // Nobody walks: the spot sits on the road network; move it onto a walkable street.
  if (chosen.snappedBy && chosen.snappedBy !== 'walk') Object.assign(chosen, await onFoot(chosen, people[0], { travelTimes, signal }));
  return {
    meet: { lat: chosen.lat, lon: chosen.lon },
    times: chosen.times.map((t) => Math.round(t)),
    dists: chosen.dists.map((d, i) => Math.round(d ?? haversine(people[i].lat, people[i].lon, chosen.lat, chosen.lon) * DETOUR)),
    real,
    approx: !!chosen.approx,
    tried: all.length,
  };
}
