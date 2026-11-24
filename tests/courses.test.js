import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLand } from '../src/land.js';
import { BED, middleShowing, undersideHeld } from '../src/bed.js';
import { rockFrom } from '../src/cluster.js';
import { COURSES, makeCourses } from '../src/courses.js';

// Layered rock's cluster (src/courses.js): a stack of courses. Within a
// course the slabs' tops lie in one plane; the courses step up, each sunk
// a little into the one below; every slab rests on the land or the slabs
// under it; and the stack is a list of whole rocks that makes the same
// stack again.

const rad = (degrees) => (degrees * Math.PI) / 180;
const SEEDS = [1, 2, 3, 4, 5, 6];
const level = createLand({ steep: 0 });
const steep = createLand({ steep: 60 });
const meadow = level.placeOn(-8, -0.4);
const slope = steep.placeOn(-8, 0.45);
const base = { size: 1.6, courses: 4, slabs: 3, shows: 1 };
const onLevel = SEEDS.map((seed) => makeCourses(level, { ...base, x: meadow.x, z: meadow.z, seed }));
const onSlope = SEEDS.map((seed) => makeCourses(steep, { ...base, x: slope.x, z: slope.z, seed, slant: rad(12), turn: rad(20), shows: 0.8 }));

// How far a rock reaches along a direction: [least, most].
function span(rock, way) {
  let low = Infinity, high = -Infinity;
  for (const p of rock.corners) {
    const t = p.dot(way);
    low = Math.min(low, t);
    high = Math.max(high, t);
  }
  return [low, high];
}
const byCourse = (stack) => {
  const courses = new Map();
  for (const r of stack.rocks) courses.set(r.course, [...(courses.get(r.course) ?? []), r]);
  return [...courses.entries()].sort((a, b) => a[0] - b[0]);
};

test('a stack on level ground has slabs in two courses or more, the bottom one the fullest', () => {
  for (const [i, stack] of onLevel.entries()) {
    const courses = byCourse(stack);
    assert.ok(courses.length >= 2, `seed ${SEEDS[i]}: ${courses.length} courses`);
    assert.ok(courses[0][1].length >= courses.at(-1)[1].length, `seed ${SEEDS[i]}: the top course has more slabs than the bottom`);
    for (const r of stack.rocks) assert.equal(r.kind, 'layered');
  }
});

test('within a course the tops lie in one plane and the bottoms in another', () => {
  for (const [i, stack] of onLevel.entries()) {
    for (const [k, rocks] of byCourse(stack)) {
      const spans = rocks.map((r) => span(r, stack.up));
      for (const [low, high] of spans) {
        assert.ok(Math.abs(high - spans[0][1]) < 2e-3, `seed ${SEEDS[i]}, course ${k}: a top ${(1000 * (high - spans[0][1])).toFixed(1)} mm off the others`);
        assert.ok(Math.abs(low - spans[0][0]) < 2e-3, `seed ${SEEDS[i]}, course ${k}: a bottom ${(1000 * (low - spans[0][0])).toFixed(1)} mm off the others`);
      }
    }
  }
});

test('the courses step up, each sunk a little into the one below, and beds differ', () => {
  let differ = 0;
  for (const [i, stack] of onLevel.entries()) {
    const courses = byCourse(stack).map(([k, rocks]) => ({ k, ...Object.fromEntries(['low', 'high'].map((name, j) => [name, span(rocks[0], stack.up)[j]])) }));
    for (let c = 1; c < courses.length; c++) {
      if (courses[c].k !== courses[c - 1].k + 1) continue;
      assert.ok(courses[c].low > courses[c - 1].low, `seed ${SEEDS[i]}: course ${courses[c].k} isn't above the one below`);
      assert.ok(courses[c].low < courses[c - 1].high, `seed ${SEEDS[i]}: course ${courses[c].k} stands clear of the one below`);
    }
    const beds = courses.map((c) => c.high - c.low);
    if (Math.max(...beds) / Math.min(...beds) > 1.1) differ++;
  }
  assert.ok(differ >= SEEDS.length - 1, `beds differ in thickness in only ${differ} of ${SEEDS.length} stacks`);
});

test('every slab rests: most of its underside, and its middle, on the land or the slabs under it', () => {
  for (const [land, stacks, name] of [[level, onLevel, 'level'], [steep, onSlope, 'slope']]) {
    for (const [i, stack] of stacks.entries()) {
      stack.rocks.forEach((rock, at) => {
        const before = stack.rocks.slice(0, at);
        const rests = undersideHeld(rock, land, COURSES.under, before);
        assert.ok(rests >= COURSES.rests - 1e-9, `${name}, seed ${SEEDS[i]}: a slab of course ${rock.course} rests on ${(100 * rests).toFixed(0)}% of its underside`);
        assert.ok(middleShowing(rock, land, undefined, before) <= BED.slack + 1e-6, `${name}, seed ${SEEDS[i]}: a slab of course ${rock.course} hangs by its middle`);
        assert.ok(rock.exposed >= COURSES.clear, `${name}, seed ${SEEDS[i]}: a slab of course ${rock.course} doesn't show`);
      });
    }
  }
});

test('cracks do not line up from one course to the next', () => {
  for (const [i, stack] of onLevel.entries()) {
    const courses = byCourse(stack);
    for (let c = 1; c < courses.length; c++) {
      const below = courses[c - 1][1].filter((r) => r.row === 0).map((r) => r.along);
      const here = courses[c][1].filter((r) => r.row === 0).map((r) => r.along);
      const same = here.length > 0 && here.every((a) => below.some((b) => Math.abs(a - b) < 0.05));
      assert.ok(!same, `seed ${SEEDS[i]}: course ${courses[c][0]}'s slabs sit square on the ones below`);
    }
  }
});

test('on a steep slope the stack keeps its courses, each set back up the hill from the one below', () => {
  for (const [i, stack] of onSlope.entries()) {
    const courses = byCourse(stack);
    assert.ok(courses.length >= 2, `seed ${SEEDS[i]}: ${courses.length} courses on the slope`);
    // (The band faces +z: further up the hill is further toward -z.)
    const back = courses.map(([, rocks]) => rocks.reduce((sum, r) => sum - r.at.z, 0) / rocks.length);
    assert.ok(back.at(-1) > back[0], `seed ${SEEDS[i]}: the top course isn't back from the bottom one`);
  }
});

test('the same seed and settings give the same stack, and another seed another', () => {
  const again = makeCourses(level, { ...base, x: meadow.x, z: meadow.z, seed: SEEDS[2] });
  assert.deepEqual(again.list, onLevel[2].list);
  assert.notDeepEqual(onLevel[3].list, onLevel[2].list);
});

test('a stack is a list of whole rocks: each entry makes the same slab again', () => {
  for (const stack of [onLevel[0], onSlope[1]]) {
    assert.equal(stack.list.length, stack.rocks.length);
    stack.list.forEach((entry, i) => {
      assert.equal(entry.kind, 'layered');
      assert.deepEqual(rockFrom(entry).positions, stack.rocks[i].positions, `entry ${i} makes another slab`);
    });
  }
});

test('fewer courses, or more age, leaves the slabs that stay where they were', () => {
  for (const [i, stack] of onLevel.entries()) {
    const key = (r) => `${r.course} ${r.row} ${r.piece}`;
    const was = new Map(stack.rocks.map((r) => [key(r), r]));
    const fewer = makeCourses(level, { ...base, x: meadow.x, z: meadow.z, seed: SEEDS[i], courses: 2 });
    const older = makeCourses(level, { ...base, x: meadow.x, z: meadow.z, seed: SEEDS[i], age: 0.6 });
    let shared = 0;
    for (const r of [...fewer.rocks, ...older.rocks]) {
      const same = was.get(key(r));
      if (!same) continue;
      shared++;
      assert.deepEqual(r.at.toArray(), same.at.toArray(), `seed ${SEEDS[i]}: slab ${key(r)} moved`);
      assert.deepEqual(r.q.toArray(), same.q.toArray(), `seed ${SEEDS[i]}: slab ${key(r)} turned`);
    }
    assert.ok(shared >= 4, `seed ${SEEDS[i]}: only ${shared} slabs to compare`);
  }
});
