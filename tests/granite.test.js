import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GRANITE, breaksFor, buildRock, inside, measure, shapeGranite } from '../src/granite.js';

// The granite rock (src/granite.js): whole and convex, never thin or
// knife-edged, the same for the same seed, and only ever worn by age.

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const AGES = [0, 0.1, 0.25, 0.5, 0.75, 1];
const SIZES = [0.3, 1.5, 6];
const THICKS = [GRANITE.thickRange[0], GRANITE.thick, GRANITE.thickRange[1]];

const each = (run) => {
  for (const seed of SEEDS) for (const size of SIZES) for (const age of AGES) run({ seed, size, age });
};

test('every rock is whole: a closed convex solid holding all its corners', () => {
  each((spec) => {
    const shape = shapeGranite(spec);
    const rock = buildRock(shape.points);
    assert.ok(rock.planes.length >= 6, `${JSON.stringify(spec)} has ${rock.planes.length} faces`);
    for (const p of shape.points) assert.ok(inside(rock, p.x, p.y, p.z, 1e-4 * spec.size), `${JSON.stringify(spec)}: a corner is outside its own hull`);
    for (const v of rock.positions) assert.ok(Number.isFinite(v));
  });
});

test('no rock is thin: at least a quarter as thick as long, at every thickness asked', () => {
  for (const thick of THICKS) {
    each((spec) => {
      const shape = shapeGranite({ ...spec, thick });
      const m = measure(buildRock(shape.points));
      const least = (m.thinnest * m.longest) / shape.length;
      assert.ok(least >= 0.25, `${JSON.stringify({ ...spec, thick })}: ${least.toFixed(3)} of its length thick`);
    });
  }
});

test('no rock has a knife edge: none sharper than 45°', () => {
  for (const thick of THICKS) {
    each((spec) => {
      const m = measure(buildRock(shapeGranite({ ...spec, thick }).points));
      assert.ok(m.sharpest >= 45, `${JSON.stringify({ ...spec, thick })}: an edge of ${m.sharpest.toFixed(1)}°`);
    });
  }
});

test('the same seed and settings give the same rock, and another seed another', () => {
  for (const spec of [{ seed: 3, size: 1.5, age: 0 }, { seed: 3, size: 6, age: 0.6 }, { seed: 11, size: 0.3, age: 1 }]) {
    const a = buildRock(shapeGranite(spec).points).positions;
    const b = buildRock(shapeGranite(spec).points).positions;
    assert.deepEqual(a, b);
    const other = buildRock(shapeGranite({ ...spec, seed: spec.seed + 1 }).points).positions;
    assert.notDeepEqual(a, other);
  }
});

test('age only wears: an older rock lies inside the younger one', () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      for (let i = 1; i < AGES.length; i++) {
        const younger = buildRock(shapeGranite({ seed, size, age: AGES[i - 1] }).points);
        const older = shapeGranite({ seed, size, age: AGES[i] });
        for (const p of older.points) {
          assert.ok(inside(younger, p.x, p.y, p.z, 1e-4 * size), `seed ${seed}, ${size} m: at age ${AGES[i]} a corner stands out of the rock at age ${AGES[i - 1]}`);
        }
      }
    }
  }
});

test('age wears a rock without shrinking it much: it keeps three quarters of its reach each way', () => {
  const span = (points, axis) => Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
  for (const seed of SEEDS) {
    const young = shapeGranite({ seed, size: 1.5, age: 0 }).points;
    const old = shapeGranite({ seed, size: 1.5, age: 1 }).points;
    for (const axis of ['x', 'y', 'z']) {
      const share = span(old, axis) / span(young, axis);
      assert.ok(share > 0.75 && share <= 1 + 1e-9, `seed ${seed}: along ${axis} the old rock is ${share.toFixed(2)} of the young one`);
    }
  }
});

test('a young rock is a rough box, and it gains faces as it ages', () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      const faces = AGES.map((age) => measure(buildRock(shapeGranite({ seed, size, age }).points)));
      assert.ok(faces[0].faces >= 6 && faces[0].faces <= 6 + GRANITE.breaks, `seed ${seed}, ${size} m: ${faces[0].faces} faces when young`);
      assert.ok(faces[0].corners >= 8, `seed ${seed}, ${size} m: ${faces[0].corners} corners when young`);
      assert.ok(faces.at(-1).faces > 2 * faces[0].faces, `seed ${seed}, ${size} m: ${faces.at(-1).faces} faces when old`);
      for (let i = 1; i < faces.length; i++) assert.ok(faces[i].faces >= faces[i - 1].faces - 2, `seed ${seed}, ${size} m: faces fall from age ${AGES[i - 1]} to ${AGES[i]}`);
    }
  }
});

test('a bigger rock has more breaks of its own', () => {
  assert.equal(breaksFor(GRANITE.size[0]), 2);
  assert.equal(breaksFor(GRANITE.size[1]), GRANITE.breaks);
  let last = 0;
  for (let size = GRANITE.size[0]; size <= GRANITE.size[1]; size += 0.1) {
    assert.ok(breaksFor(size) >= last);
    last = breaksFor(size);
  }
});

test('nothing in src draws from Math.random: every rock is seeded', () => {
  for (const name of readdirSync(new URL('../src/', import.meta.url))) {
    if (!name.endsWith('.js')) continue;
    assert.doesNotMatch(readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'), /Math\.random/, name);
  }
});
