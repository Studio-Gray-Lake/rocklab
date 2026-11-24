import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, fallOf, spotsOn } from '../src/spots.js';
import { feetOf } from '../src/feet.js';
import { EDGE } from '../src/edge.js';
import { LAND_IN, landIn } from '../src/landIn.js';
import { HILLS, createHills } from '../src/hills.js';
import { createLand } from '../src/land.js';

// The spots along the feet, drawn by place (src/spots.js): the same spots
// whichever rectangle asks, as many to the metre as along an edge, the
// rock falling away where the rise does, and each of the kind where it is.

const half = HILLS.size / 2;
const whole = { x0: -half, x1: half, z0: -half, z1: half };

test('a land asked for in four squares has the same spots as asked for whole', () => {
  const land = landIn(createHills({ seed: 5 }));
  const once = spotsOn(land, whole, { seed: 3 });
  const quarters = [[0, half, 0, half], [-half, 0, 0, half], [0, half, -half, 0], [-half, 0, -half, 0]]
    .flatMap(([x0, x1, z0, z1]) => spotsOn(land, { x0, x1, z0, z1 }, { seed: 3 }));
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  assert.ok(once.length > 100, `${once.length} spots`);
  assert.deepEqual(quarters.sort(byId), once.slice().sort(byId));
  // An odd rectangle, off every grid, agrees where it overlaps.
  const odd = { x0: -17.4, x1: 9.1, z0: -3.3, z1: 33.8 };
  const inOdd = ({ at }) => at.x >= odd.x0 && at.x < odd.x1 && at.z >= odd.z0 && at.z < odd.z1;
  assert.deepEqual(spotsOn(land, odd, { seed: 3 }), once.filter(inOdd));
  // Each spot lies in the rectangle asked, and belongs to the square of land it is in.
  for (const spot of once) {
    assert.ok(spot.at.x >= -half && spot.at.x < half && spot.at.z >= -half && spot.at.z < half);
    assert.deepEqual(spot.square, [Math.floor(spot.at.x / SPOTS.square), Math.floor(spot.at.z / SPOTS.square)]);
    assert.ok(Math.hypot(spot.at.x - spot.foot[0], spot.at.z - spot.foot[1]) <= LAND_IN.widest);
  }
  // Another seed, other spots.
  assert.notDeepEqual(spotsOn(land, whole, { seed: 4 }).map((s) => s.id), once.map((s) => s.id));
});

test('as many spots to the metre of foot as along an edge', () => {
  const counts = { big: 0, mid: 0, small: 0 };
  let length = 0;
  for (const seed of [1, 2, 3]) {
    const land = landIn(createHills({ seed }));
    // (The spots of feet a little beyond the land's edge may lie on it: the
    // feet are counted a rise's width past it, the spots taken only on it.)
    for (const piece of feetOf(land, whole, { margin: 0 }).pieces) {
      if (fallOf(piece) > 0) length += Math.hypot(piece.to[0] - piece.from[0], piece.to[1] - piece.from[1]);
    }
    for (const spot of spotsOn(land, whole)) counts[spot.rank]++;
  }
  const big = (EDGE.spots * length) / (EDGE.to - EDGE.from);
  for (const [rank, share] of [['big', 1], ['mid', EDGE.mids], ['small', EDGE.smalls]]) {
    assert.ok(Math.abs(counts[rank] / (big * share) - 1) < 0.1, `${rank}: ${counts[rank]} spots, ${big * share} to be had`);
  }
  // More asked for, more there are.
  const land = landIn(createHills({ seed: 1 }));
  assert.ok(spotsOn(land, whole, { spots: 12 }).length > 1.3 * spotsOn(land, whole, { spots: 6 }).length);
});

test('the rock falls away where the band sinks into the meadow, not before', () => {
  const land = landIn(createLand({ steep: 60 }));
  const spots = spotsOn(land, { x0: -20, x1: 18, z0: -14, z1: 14 }, { spots: 30 });
  const middle = spots.filter((s) => s.foot[0] > -15 && s.foot[0] < 6 && Math.abs(s.foot[1]) < 14);
  const sinking = spots.filter((s) => s.foot[0] > 13 && s.foot[0] < 18 && Math.abs(s.foot[1]) < 14);
  assert.ok(middle.length > 20 && sinking.length > 3, `${middle.length} in the middle, ${sinking.length} where it sinks`);
  for (const spot of middle) {
    assert.equal(spot.fall, 1);
    assert.equal(spot.grade, 1);
    assert.equal(spot.pale, false);
  }
  const most = (list, key) => Math.max(...list.map((s) => s[key]));
  assert.ok(most(sinking, 'grade') < 0.9, `grade ${most(sinking, 'grade')}`);
  assert.ok(sinking.some((s) => s.fall < 1));
  // Where the rock is all under soil, or the land is flat, there are none.
  const soil = createLand({ steep: 60 });
  assert.deepEqual(spotsOn({ ...soil, rockAt: () => ({ bare: 0 }) }, { x0: -20, x1: 18, z0: -14, z1: 14 }), []);
  assert.deepEqual(spotsOn({ heightAt: () => 0, normalAt: () => [0, 1, 0] }, { x0: -20, x1: 20, z0: -20, z1: 20 }), []);
});

test('each spot takes the kind of rock where it is', () => {
  const hills = createHills({ seed: 2 });
  const named = { ...hills, rockAt: (x, z) => ({ bare: hills.rockAt(x, z).bare, kind: x < 0 ? 'granite' : 'basalt' }) };
  const spots = spotsOn(named, whole);
  assert.ok(spots.some((s) => s.at.x < 0) && spots.some((s) => s.at.x >= 0));
  for (const spot of spots) assert.equal(spot.kind, spot.at.x < 0 ? 'granite' : 'layered', `at ${spot.at.x}`);
  // A land that doesn't say takes the settings' kind.
  const plain = createLand({ steep: 60 });
  for (const spot of spotsOn(plain, { x0: -20, x1: 10, z0: -14, z1: 14 }, { kind: 'layered' })) assert.equal(spot.kind, 'layered');
});
