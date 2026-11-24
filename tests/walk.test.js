import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WALK, groundOrWall, groupsOf, outlineOf, rockTop, rockWalk, sharpestTopOf, thinnestOf } from '../src/walk.js';
import { buildRock } from '../src/granite.js';
import { placeOn } from '../src/place.js';
import { createHills } from '../src/hills.js';

// What a rock says to the walk (src/walk.js), read from the rock alone:
// on shapes whose answers are known, and on the land's own rocks.

const v = (x, y, z) => new THREE.Vector3(x, y, z);
// A box 2 long, 1 wide, 0.5 tall, standing on y = 0.
const box = buildRock([v(0, 0, 0), v(2, 0, 0), v(2, 0, 1), v(0, 0, 1), v(0, 0.5, 0), v(2, 0.5, 0), v(2, 0.5, 1), v(0, 0.5, 1)]);
// A roof: a ridge 0.5 high along x over a base 1 wide, so its two top faces
// meet at 90 degrees; and a steep one, 2 high, a blade of about 28 degrees.
const roof = (high) => buildRock([v(0, 0, 0), v(2, 0, 0), v(2, 0, 1), v(0, 0, 1), v(0, high, 0.5), v(2, high, 0.5)]);
const flat = () => 0;
// One land laid once for the tests that read the land's own rocks: the
// land of hills, its south half, with everything laid (the slope's say too).
const hills = createHills({ seed: 1 });
const made = placeOn(hills, { x0: -40, x1: 40, z0: -40, z1: 0 }, { seed: 1, shows: 0.8, size: 3, fallen: 0.6, rim: 0.6, slope: 1 });
const groups = groupsOf(made.laid, hills.heightAt);

test('a rock seen from above: its top at a point, and nothing beyond its outline', () => {
  assert.ok(Math.abs(rockTop(box, 1, 0.5) - 0.5) < 1e-6);
  assert.ok(Math.abs(rockTop(roof(0.5), 1, 0.5) - 0.5) < 1e-6);
  assert.ok(Math.abs(rockTop(roof(0.5), 1, 0.25) - 0.25) < 1e-6);
  for (const [x, z] of [[-0.1, 0.5], [2.1, 0.5], [1, -0.1], [1, 1.1]]) assert.equal(rockTop(box, x, z), -Infinity);
  // On the land's own rocks: at the middle of every face that looks up,
  // the top seen from above is that face.
  let faces = 0;
  for (const r of made.rocks.slice(0, 150)) {
    const p = r.positions;
    for (let i = 0; i < r.facet.length; i++) {
      if (r.normals[i * 3 + 1] < 0.2) continue;
      const [x, y, z] = [0, 1, 2].map((k) => (p[i * 9 + k] + p[i * 9 + 3 + k] + p[i * 9 + 6 + k]) / 3);
      assert.ok(Math.abs(rockTop(r, x, z) - y) < 1e-4, `a top face at ${x}, ${z}`);
      faces++;
    }
  }
  assert.ok(faces > 100);
});

test('an outline from above goes round every corner, anticlockwise, and is convex', () => {
  const outline = outlineOf(box.corners);
  assert.equal(outline.length, 4);
  for (const r of made.rocks.slice(0, 40)) {
    const ring = outlineOf(r.corners);
    for (let i = 0; i < ring.length; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
      // Every corner on the left of every side, or on it.
      for (const c of r.corners) assert.ok((b[0] - a[0]) * (c.z - a[1]) - (b[1] - a[1]) * (c.x - a[0]) >= -1e-6);
    }
  }
});

test('how thin a rock is, and how sharp its top: known on a box and two roofs', () => {
  assert.ok(Math.abs(thinnestOf(box) - 0.5) < 1e-6);
  assert.equal(sharpestTopOf(box), 180);
  assert.ok(Math.abs(sharpestTopOf(roof(0.5)) - 90) < 1e-4);
  const blade = 2 * (Math.atan2(0.5, 2) * 180) / Math.PI;
  assert.ok(Math.abs(sharpestTopOf(roof(2)) - blade) < 1e-4);
  const box10 = rockWalk(box, () => -0.1);
  assert.ok(Math.abs(box10.proud - 0.6) < 1e-6);
  assert.equal(box10.step, false);
  assert.equal(rockWalk(box, () => 0.25).step, true);
  assert.equal(rockWalk(box, flat).step, false); // 50 cm: more than a step
});

test("the land's rocks, read for the walk: a reading for every rock, in range", () => {
  assert.ok(made.rocks.length > 100);
  for (const r of made.rocks) {
    const walk = rockWalk(r, hills.heightAt);
    // (A rock on a steep face may stand well out over the land below it.)
    assert.ok(walk.proud > 0 && walk.proud < r.size + 3, `proud ${walk.proud} for a rock ${r.size} m`);
    assert.ok(walk.thinnest > 0 && walk.thinnest <= r.size, `thinnest ${walk.thinnest}`);
    assert.ok(walk.sharpest > 0 && walk.sharpest <= 180);
    assert.ok(walk.outline.length >= 3);
    assert.equal(walk.step, walk.proud <= WALK.stepUp);
  }
});

test('each thing laid is one group, with one outline round all its rocks', () => {
  assert.equal(groups.length, made.laid.length);
  assert.ok(new Set(groups.map((g) => g.part)).size >= 3);
  assert.equal(new Set(groups.map((g) => g.id)).size, groups.length);
  // Every rock in one group, once, in the order of the list.
  assert.deepEqual(groups.flatMap((g) => g.rocks), made.rocks.map((_, i) => i));
  let many = 0;
  for (const g of groups) {
    const rocks = g.rocks.map((i) => made.rocks[i]);
    if (rocks.length > 1) many++;
    // One outline: every corner of every rock inside it or on it.
    for (let i = 0; i < g.outline.length; i++) {
      const [a, b] = [g.outline[i], g.outline[(i + 1) % g.outline.length]];
      for (const r of rocks) for (const c of r.corners) assert.ok((b[0] - a[0]) * (c.z - a[1]) - (b[1] - a[1]) * (c.x - a[0]) >= -1e-6, `${g.id}: a corner outside`);
    }
    assert.equal(g.proud, Math.max(...rocks.map((r) => rockWalk(r, hills.heightAt).proud)));
    // The square of land it belongs to: the one its place is in.
    const { at } = made.laid.find((thing) => thing.id === g.id);
    assert.deepEqual(g.square, [Math.floor(at.x / 80), Math.floor(at.z / 80)]);
  }
  assert.ok(many > 10, `${many} groups of more than one rock`);
});

// A box from (x0, z0) to (x1, z1), from y0 up to y1.
const block = (x0, z0, x1, z1, y0, y1) => buildRock([v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)]);

test("ground or wall, by the walk's own limits: a kerb, a ledge, two steps, a gentle pyramid, a steep one", () => {
  // A kerb of 25 cm the walk steps onto; a ledge of 50 cm it doesn't.
  assert.deepEqual(groundOrWall([block(0, 0, 2, 2, -0.1, 0.25)], flat), { ground: true, why: null });
  assert.deepEqual(groundOrWall([block(0, 0, 2, 2, -0.1, 0.5)], flat), { ground: false, why: 'step' });
  // Two steps of 25 cm: up one, up the next, and down again the same way.
  assert.equal(groundOrWall([block(0, 0, 3, 3, -0.1, 0.25), block(1, 1, 2, 2, 0, 0.5)], flat).ground, true);
  // A low pyramid 1 m high over 6 m (18 degrees on every side): far more
  // than a step proud, and the walk goes over it.
  const pyramid = (high, half) => buildRock([v(0, 0, 0), v(2 * half, 0, 0), v(2 * half, 0, 2 * half), v(0, 0, 2 * half), v(half, high, half)]);
  assert.deepEqual(groundOrWall([pyramid(1, 3)], flat), { ground: true, why: null });
  // The same height over 1 m: 63 degrees, a wall (40 cm up within 20 cm:
  // the walk meets it first as a step).
  assert.deepEqual(groundOrWall([pyramid(1, 0.5)], flat), { ground: false, why: 'step' });
  // Steeper than 55 degrees, yet no 20 cm of it more than a step: a slope.
  assert.deepEqual(groundOrWall([pyramid(1, 0.69)], flat), { ground: false, why: 'slope' });
  // A box on a slope the walk could take, a step onto it from above, its low side
  // a drop of more than 40 cm (from below, a step too high: either way, a wall).
  const hill = (x, z) => 0.3 * x;
  assert.equal(groundOrWall([block(0, 0, 1, 1, -0.3, 0.6)], hill).ground, false);
});

test('on the land: a group is ground only where the walk goes over it; any rock no more than a step proud may be stepped on', () => {
  const ground = groups.filter((g) => g.ground);
  const wall = groups.filter((g) => !g.ground);
  assert.ok(ground.length > 20 && wall.length > 20, `${ground.length} ground, ${wall.length} wall`);
  for (const g of groups) {
    assert.equal(g.why === null, g.ground);
    g.rocks.forEach((i, k) => assert.equal(g.stepping[k], g.ground || rockWalk(made.rocks[i], hills.heightAt).step));
  }
  // A cliff's big clusters are walls.
  assert.ok(groups.filter((g) => g.id.startsWith('big')).every((g) => !g.ground));
});

test('nothing thin underfoot: a sliver, a blade and a plate are no footing, and make their group a wall', () => {
  const sized = (rock, size) => Object.assign(rock, { size });
  const laid = (rock) => [{ id: 'one', part: 'fallen', at: { x: 0, z: 0 }, rocks: [rock] }];
  // A sliver 2 cm thick, lying flat.
  const sliver = sized(block(0, 0, 1, 1, 0, 0.02), 1);
  // A blade 25 cm high, 10 cm across at its foot: an edge of 23 degrees.
  const blade = sized(buildRock([v(0, 0, 0), v(1, 0, 0), v(1, 0, 0.1), v(0, 0, 0.1), v(0, 0.25, 0.05), v(1, 0.25, 0.05)]), 1);
  // A plate 15 cm thick and a metre long, on its edge.
  const plate = sized(block(0, 0, 1, 0.15, 0, 0.25), 1);
  // A kerb stone, 25 cm all round and a metre long: good footing.
  const kerb = sized(block(0, 0, 1, 0.25, 0, 0.25), 1);
  for (const [rock, footing] of [[sliver, false], [blade, false], [plate, false], [kerb, true]]) {
    const walk = rockWalk(rock, flat);
    assert.equal(walk.step, true);
    assert.equal(walk.footing, footing, `thinnest ${walk.thinnest}, sharpest ${walk.sharpest}`);
    const [group] = groupsOf(laid(rock), flat);
    assert.equal(group.ground, footing);
    assert.equal(group.why, footing ? null : 'thin');
    assert.deepEqual(group.stepping, [footing]);
  }
});

test("on the land as it stands, every rock the walk may step on is good footing", () => {
  assert.ok(groups.every((g) => g.why !== 'thin'), 'a group made a wall by a thin rock');
  for (const g of groups) g.rocks.forEach((i, k) => { if (g.stepping[k]) assert.ok(rockWalk(made.rocks[i], hills.heightAt).footing); });
});
