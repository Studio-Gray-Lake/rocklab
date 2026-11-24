import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEET, feetOf } from '../src/feet.js';
import { LAND_IN, landIn } from '../src/landIn.js';
import { HILLS, bandsOf, createHills } from '../src/hills.js';
import { createLand } from '../src/land.js';

// The feet of the land's steep ground (src/feet.js), traced on a grid
// fixed to the world: the same pieces whichever rectangle asks, where the
// hills' own bands have their feet, and only where a cliff would stand.

const half = HILLS.size / 2;
const inside = ({ x0, x1, z0, z1 }) => (piece) => {
  const [x, z] = [piece.square[0] * FEET.step, piece.square[1] * FEET.step];
  return x >= x0 && x < x1 && z >= z0 && z < z1;
};
const distance = (p, pieces) => Math.min(...pieces.map(({ from: a, to: b }) => {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}));

test('a land traced in four squares has the same feet as traced whole, piece for piece', () => {
  const land = landIn(createHills({ seed: 3 }));
  const whole = { x0: -half, x1: half, z0: -half, z1: half };
  const once = feetOf(land, whole).pieces.filter(inside(whole));
  const quarters = [[-half, 0, -half, 0], [0, half, -half, 0], [-half, 0, 0, half], [0, half, 0, half]]
    .reverse() // (the last first: the order they're asked in doesn't matter)
    .flatMap(([x0, x1, z0, z1]) => feetOf(land, { x0, x1, z0, z1 }).pieces.filter(inside({ x0, x1, z0, z1 })));
  const order = (a, b) => a.square[1] - b.square[1] || a.square[0] - b.square[0] || a.from[0] - b.from[0] || a.from[1] - b.from[1];
  assert.ok(once.length > 100, `${once.length} pieces`);
  assert.deepEqual(quarters.sort(order), once.slice().sort(order));
  // An odd rectangle, off the grid, agrees too where it overlaps.
  const odd = { x0: -13.3, x1: 21.7, z0: -30.2, z1: 4.9 };
  const fromOdd = feetOf(land, odd).pieces.filter(inside(odd));
  const fromWhole = feetOf(land, whole).pieces.filter(inside(odd));
  assert.ok(fromOdd.length > 10);
  assert.deepEqual(fromOdd, fromWhole);
});

test('the test land has one foot, along its band, standing until the band sinks', () => {
  const land = landIn(createLand({ steep: 60 }));
  const { pieces, runs } = feetOf(land, { x0: -20, x1: 20, z0: -14, z1: 14 });
  const along = runs.filter((run) => run.points.length > 20);
  assert.equal(along.length, 1);
  for (const piece of pieces) {
    const [x, z] = piece.middle;
    if (x < -18 || x > 8 || Math.abs(z) > 14) continue;
    // Where the walk up the band from the meadow first gets as steep as a rise.
    let foot = 14;
    while (foot > -14 && land.at(x, foot).steep < LAND_IN.ease) foot -= 0.05;
    assert.ok(Math.abs(z - foot) < 0.15, `x ${x}: the foot at z ${z}, not ${foot}`);
    assert.ok(piece.stands, `x ${x}: no cliff stands`);
  }
  // Where the band has sunk below the lowest cliff, none stands.
  const sunk = pieces.filter((piece) => piece.reading.rise < FEET.lowest);
  assert.ok(sunk.length > 0 && sunk.every((piece) => !piece.stands));
});

test("the feet lie where the hills' own bands have theirs", () => {
  for (const seed of [1, 2, 3, 5, 6]) {
    const hills = createHills({ seed });
    const { pieces } = feetOf(hills, { x0: -half, x1: half, z0: -half, z1: half });
    const standing = pieces.filter((piece) => piece.stands);
    const bands = bandsOf(hills);
    const middles = (points) => points.slice(1).map((b, i) => [(points[i][0] + b[0]) / 2, (points[i][1] + b[1]) / 2]);
    // Most of where the hills would stand a cliff, a foot here stands.
    const theirs = bands.flatMap((band) => band.stretches.flatMap((stretch) => middles(stretch.points)));
    const found = theirs.filter((p) => distance(p, standing) < 1.5).length / theirs.length;
    // And most of where a foot here stands, the hills have a band's foot.
    const runs = bands.flatMap((band) => band.runs.flatMap((run) => run.points.slice(1).map((b, i) => ({ from: run.points[i], to: b }))));
    const ours = standing.filter(inside({ x0: -half, x1: half, z0: -half, z1: half }));
    const near = ours.filter((piece) => distance(piece.middle, runs) < 1.5).length / ours.length;
    // (Not all: where a band lies on a ledge just above another, the
    // ground between them never eases, so the two are one rise with one
    // foot, the lower one; and where the hill below a band is steep, the
    // rise begins lower than the band's own foot.)
    assert.ok(found > 0.85, `seed ${seed}: ${found} of the hills' cliffs found`);
    assert.ok(near > 0.85, `seed ${seed}: ${near} of the standing feet near a band's`);
  }
});

test('each piece runs with uphill on its left, crosses its own square, and is read on the foot', () => {
  const land = landIn(createHills({ seed: 2 }));
  const { pieces, runs } = feetOf(land, { x0: -20, x1: 20, z0: -20, z1: 20 });
  assert.ok(pieces.length > 20);
  for (const piece of pieces) {
    const [[ax, az], [bx, bz]] = [piece.from, piece.to];
    const [ux, uz] = piece.reading.up;
    assert.ok((bx - ax) * uz - (bz - az) * ux >= 0);
    for (const [x, z] of [piece.from, piece.to]) {
      assert.ok(x >= piece.square[0] * FEET.step - 1e-9 && x <= (piece.square[0] + 1) * FEET.step + 1e-9);
      assert.ok(z >= piece.square[1] * FEET.step - 1e-9 && z <= (piece.square[1] + 1) * FEET.step + 1e-9);
    }
    assert.deepEqual(piece.reading, land.at(...piece.middle));
    assert.ok(Math.abs(piece.reading.steep - LAND_IN.ease) < 3, `steep ${piece.reading.steep} at a foot`);
  }
  // Every piece is in one run, once.
  assert.equal(runs.reduce((sum, run) => sum + run.stands.length, 0), pieces.length);
});

test('a flat land has no feet', () => {
  const flat = { heightAt: () => 2, normalAt: () => [0, 1, 0] };
  assert.deepEqual(feetOf(flat, { x0: -10, x1: 10, z0: -10, z1: 10 }), { pieces: [], runs: [] });
});
