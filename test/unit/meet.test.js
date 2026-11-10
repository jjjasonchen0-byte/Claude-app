import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMeeting, treeSegments, pathTo, SEG_STRIDE } from '../../public/js/meet.js';
import { buildGraph, syntheticGraph, fromEdgeList } from '../../public/js/network.js';
import { haversine, smallestEnclosingCircle } from '../../public/js/geo.js';

// A straight east-west street of 101 nodes ~10 m apart, plus a dead-end side street.
function lineGraph() {
  const els = [];
  for (let i = 0; i <= 100; i++) els.push({ type: 'node', id: i + 1, lat: 51.5, lon: -0.1 + i * 0.00015 });
  els.push({ type: 'way', id: 1000, nodes: Array.from({ length: 101 }, (_, i) => i + 1) });
  return buildGraph(els);
}

test('two friends on one street meet halfway along it', () => {
  const g = lineGraph();
  const a = { lat: 51.5, lon: -0.1 };
  const b = { lat: 51.5, lon: -0.1 + 100 * 0.00015 };
  const r = solveMeeting(g, [a, b]);
  const da = haversine(a.lat, a.lon, r.meet.lat, r.meet.lon);
  const db = haversine(b.lat, b.lon, r.meet.lat, r.meet.lon);
  assert.ok(Math.abs(da - db) < 15, `unequal: ${da} vs ${db}`);
  assert.ok(Math.abs(r.radius - Math.max(da, db)) < 1);
});

test('fair mode minimises the longest trip; total mode minimises the sum', () => {
  const g = lineGraph();
  const p = (i) => ({ lat: 51.5, lon: -0.1 + i * 0.00015 });
  const people = [p(0), p(2), p(4), p(100)];
  const fair = solveMeeting(g, people, { mode: 'fair' });
  const total = solveMeeting(g, people, { mode: 'total' });
  assert.ok(fair.radius < total.radius, 'fair should have smaller max trip');
  const sum = (r) => r.people.reduce((s, x) => s + x.reach, 0);
  assert.ok(sum(total) <= sum(fair) + 1e-6, 'total should have smaller sum');
});

test('three friends on a synthetic network all reach the meeting point', () => {
  const people = [
    { lat: 40.70, lon: -74.02 }, { lat: 40.76, lon: -73.97 }, { lat: 40.69, lon: -73.94 },
  ];
  const g = syntheticGraph(people);
  const r = solveMeeting(g, people);
  for (const person of r.people) {
    assert.ok(Number.isFinite(person.reach));
    const path = pathTo(person, r.meetNode);
    assert.equal(path[0], person.node);
    assert.equal(path.at(-1), r.meetNode);
    const segs = treeSegments(g, person, r.radius);
    assert.ok(segs.length >= SEG_STRIDE && segs.length % SEG_STRIDE === 0);
    let trunks = 0;
    for (let i = 0; i < segs.length; i += SEG_STRIDE) trunks += segs[i + 6];
    assert.ok(trunks > 0 && trunks < segs.length / SEG_STRIDE, 'some, but not all, branches are trunks');
  }
  // Meeting point should be near the geometric fair point.
  const sec = smallestEnclosingCircle(people);
  assert.ok(haversine(sec.lat, sec.lon, r.meet.lat, r.meet.lon) < sec.radius * 0.6);
});

test('branches only grow towards the other friend (corridor restriction)', () => {
  // Cross-shaped graph: a long east-west street plus long north & south arms at the left end.
  const lat = [], lon = [], A = [], B = [];
  const add = (la, lo) => { lat.push(la); lon.push(lo); return lat.length - 1; };
  let prev = add(0, 0);
  const origin = prev;
  for (let i = 1; i <= 50; i++) { const v = add(0, i * 0.0002); A.push(prev); B.push(v); prev = v; }
  for (const dir of [1, -1]) {
    let q = origin;
    for (let i = 1; i <= 50; i++) { const v = add(dir * i * 0.0002, 0); A.push(q); B.push(v); q = v; }
  }
  const g = fromEdgeList(Float64Array.from(lat), Float64Array.from(lon), A, B, true);
  const r = solveMeeting(g, [{ lat: 0, lon: 0 }, { lat: 0, lon: 50 * 0.0002 }]);
  const left = r.people[0];
  const farNorth = lat.findIndex((la) => la > 0.008);
  assert.equal(left.dist[farNorth], Infinity, 'should not explore far away from the other friend');
});

test('smallest enclosing circle centre of two points is their midpoint', () => {
  const c = smallestEnclosingCircle([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }]);
  assert.ok(Math.abs(c.lon - 0.5) < 1e-6 && Math.abs(c.lat) < 1e-6);
});
