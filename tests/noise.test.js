import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { slowField } from '../src/field.js';
import { LAND_SIZE, createLand } from '../src/land.js';
import { EDGE, apronFor, makeEdge, showsAt } from '../src/edge.js';

// The noise along the edge (src/field.js, src/edge.js): one slow field
// that neighbours share. Patchiness gathers rock into groups and gaps;
// drift lets the rocks' tilt wander. With both at nothing the edge is rock
// for rock what it was.

const rad = (degrees) => (degrees * Math.PI) / 180;
const settings = { seed: 1, size: 4, age: 0.15, slant: rad(35), turn: rad(20), shows: 0.6 };
const plain = createLand({ steep: 60 });

test('the slow field is seeded, stays between -1 and 1, and changes gradually', () => {
  const field = slowField(1, 9, 1);
  let low = Infinity, high = -Infinity;
  for (let x = -40; x <= 40; x += 0.1) {
    const v = field(x);
    assert.ok(v >= -1 && v <= 1, `${v} at ${x}`);
    assert.ok(Math.abs(field(x + 0.1) - v) < 0.06, `it jumps by ${Math.abs(field(x + 0.1) - v).toFixed(3)} in 10 cm at ${x.toFixed(1)}`);
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  assert.ok(high - low > 0.8, `it only ranges over ${(high - low).toFixed(2)}`);
  assert.equal(slowField(1, 9, 1)(3.7), field(3.7));
  assert.notEqual(slowField(2, 9, 1)(3.7), field(3.7));
  assert.notEqual(slowField(1, 9, 2)(3.7), field(3.7));
});

test('a smaller patch size changes more often along the edge', () => {
  const turns = (length) => {
    const field = slowField(1, length, 1);
    let count = 0;
    for (let x = -40; x < 40; x += 0.25) if (Math.sign(field(x)) !== Math.sign(field(x + 0.25))) count++;
    return count;
  };
  assert.ok(turns(4) > turns(16), `${turns(4)} turns at 4 m, ${turns(16)} at 16 m`);
});

test('with patchiness and drift at nothing, the land and the edge are what they were', () => {
  const none = createLand({ steep: 60, apron: apronFor({ shows: 0.6, fallen: 0.6, seed: 1, patchy: 0, patch: 9 }) });
  const before = createLand({ steep: 60, apron: apronFor({ shows: 0.6, fallen: 0.6 }) });
  for (let x = LAND_SIZE.x0; x <= LAND_SIZE.x1; x += 2.3) {
    for (let z = LAND_SIZE.z0; z <= LAND_SIZE.z1; z += 1.9) assert.equal(none.heightAt(x, z), before.heightAt(x, z), `(${x}, ${z})`);
  }
  const was = makeEdge(before, { ...settings, fallen: 0.6, rim: 0.6 });
  const now = makeEdge(none, { ...settings, fallen: 0.6, rim: 0.6, patchy: 0, patch: 9, drift: 0 });
  assert.deepEqual(now.list, was.list);
  assert.equal(showsAt(plain, -5, 0.6, { seed: 1, patchy: 0 }), showsAt(plain, -5, 0.6));
});

// The longest stretch of the edge's middle (from -14 to 8 m along it) with
// no rock of the face over it, by the rocks' own reach (m).
function longestBare(made) {
  const covered = new Array(220).fill(false); // a tenth of a metre apart
  for (const r of made.rocks) {
    if (r.part) continue;
    for (let i = Math.max(0, Math.floor((r.min[0] + 14) * 10)); i <= Math.min(219, Math.floor((r.max[0] + 14) * 10)); i++) covered[i] = true;
  }
  let best = 0, run = 0;
  for (const c of covered) {
    run = c ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best / 10;
}

test('patchiness gathers rock into groups, with quiet stretches between', () => {
  for (const seed of [1, 2, 3, 4]) {
    const even = makeEdge(plain, { ...settings, seed });
    const patchy = makeEdge(plain, { ...settings, seed, patchy: 1, patch: 9 });
    assert.ok(longestBare(even) < 1.5, `seed ${seed}: a bare stretch of ${longestBare(even).toFixed(1)} m with no patchiness`);
    assert.ok(longestBare(patchy) > longestBare(even) + 2, `seed ${seed}: the longest bare stretch is ${longestBare(patchy).toFixed(1)} m with patches, ${longestBare(even).toFixed(1)} m without`);
    assert.ok(patchy.rocks.length > 20, `seed ${seed}: only ${patchy.rocks.length} rocks left`);
  }
});

test('the bank of fallen rock lies under the rock: next to none where a gap is', () => {
  const noise = { seed: 1, patchy: 1, patch: 9 };
  const land = createLand({ steep: 60, apron: apronFor({ shows: 0.6, fallen: 1, ...noise }) });
  let gap = -12, group = -12;
  for (let x = -12; x <= 6; x += 0.5) {
    if (showsAt(land, x, 0.6, noise) < showsAt(land, gap, 0.6, noise)) gap = x;
    if (showsAt(land, x, 0.6, noise) > showsAt(land, group, 0.6, noise)) group = x;
  }
  assert.ok(showsAt(land, gap, 0.6, noise) < 0.3 && showsAt(land, group, 0.6, noise) > 0.75, 'no gap or no group along the middle of the edge');
  assert.ok(land.apronAt(group) > 0.8 * EDGE.apron, `a ${land.apronAt(group).toFixed(2)} m bank under the group at ${group}`);
  assert.ok(land.apronAt(gap) < 0.25 * land.apronAt(group), `a ${land.apronAt(gap).toFixed(2)} m bank in the gap at ${gap}`);
});

test('with patches, more showing still only brings more spots in', () => {
  const low = makeEdge(plain, { ...settings, shows: 0.3, patchy: 0.8 });
  const high = makeEdge(plain, { ...settings, shows: 0.7, patchy: 0.8 });
  const now = new Set(high.spots.ids);
  for (const id of low.spots.ids) assert.ok(now.has(id), `spot "${id}" is in at 0.3 and gone at 0.7`);
  assert.ok(now.size > low.spots.ids.length);
});

// Which way up each cluster's big rock stands, from one end of the edge to
// the other.
function ups(made) {
  return made.rocks.filter((r) => r.role === 'big' && !r.part).sort((a, b) => a.x - b.x)
    .map((r) => new THREE.Vector3(0, 1, 0).applyQuaternion(r.q));
}

test('drift lets the tilt wander: neighbours agree more than rocks far apart', () => {
  const still = ups(makeEdge(plain, { ...settings, shows: 1, noise: 0 }));
  for (const up of still) assert.ok(up.angleTo(still[0]) < 1e-6, 'the tilt differs along an edge with no drift');
  const drifting = ups(makeEdge(plain, { ...settings, shows: 1, noise: 0, drift: 1 }));
  let near = 0, all = 0, pairs = 0;
  for (let i = 0; i < drifting.length; i++) {
    if (i > 0) near += drifting[i].angleTo(drifting[i - 1]);
    for (let j = i + 1; j < drifting.length; j++) {
      all += drifting[i].angleTo(drifting[j]);
      pairs++;
    }
  }
  near /= drifting.length - 1;
  all /= pairs;
  assert.ok(Math.max(...drifting.map((up) => up.angleTo(drifting[0]))) > rad(4), 'the tilt hardly wanders at full drift');
  assert.ok(near < all, `neighbours differ by ${(near * 180 / Math.PI).toFixed(1)}°, all pairs by ${(all * 180 / Math.PI).toFixed(1)}°`);
});
