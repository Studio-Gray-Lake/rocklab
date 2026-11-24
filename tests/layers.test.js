import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLand } from '../src/land.js';
import { BED, middleShowing, undersideHeld } from '../src/bed.js';
import { rockFrom } from '../src/cluster.js';
import { COURSES } from '../src/courses.js';
import { EDGE, apronFor } from '../src/edge.js';
import { makeLayers } from '../src/layers.js';

// Layered rock's cliff (src/layers.js): the same few beds running the
// length of the face. A bed is a flat sheet wherever along the cliff it
// is; the beds lie one above another; tilted, they climb across the face;
// every slab rests; and the cliff is a list of whole rocks that makes the
// same cliff again.

const rad = (degrees) => (degrees * Math.PI) / 180;
const land = createLand({ steep: 60 });
const base = { seed: 1, size: 2.4, age: 0, shows: 1 };
const level = makeLayers(land, base);
const tilted = makeLayers(land, { ...base, slant: rad(15) });
const some = makeLayers(land, { ...base, shows: 0.4 });

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
const byBed = (made) => {
  const beds = new Map();
  for (const r of made.rocks) if (!r.part) beds.set(r.bed, [...(beds.get(r.bed) ?? []), r]);
  return [...beds.entries()].sort((a, b) => a[0] - b[0]);
};

test('at full showing there are slabs in many beds, from the foot to the top', () => {
  const beds = byBed(level);
  assert.ok(level.face >= 100, `${level.face} slabs`);
  assert.ok(beds.length >= 6, `${beds.length} beds with slabs`);
  const heights = level.rocks.filter((r) => !r.part).map((r) => land.heightAt(r.x, r.z));
  assert.ok(Math.min(...heights) < 1.5 && Math.max(...heights) > 6, `slabs stand from ${Math.min(...heights).toFixed(1)} to ${Math.max(...heights).toFixed(1)} m up the 8 m band`);
  for (const r of level.rocks) assert.equal(r.kind, 'layered');
});

test('a bed is a flat sheet: its slabs\' tops lie in one plane and their bottoms in another, the length of the cliff', () => {
  for (const [name, made] of [['level', level], ['tilted', tilted]]) {
    for (const [k, rocks] of byBed(made)) {
      const spans = rocks.map((r) => span(r, made.up));
      const far = Math.max(...rocks.map((r) => r.x)) - Math.min(...rocks.map((r) => r.x));
      for (const [low, high] of spans) {
        assert.ok(Math.abs(high - spans[0][1]) < 3e-3, `${name}, bed ${k} (${far.toFixed(0)} m long): a top ${(1000 * (high - spans[0][1])).toFixed(1)} mm off the others`);
        assert.ok(Math.abs(low - spans[0][0]) < 3e-3, `${name}, bed ${k}: a bottom ${(1000 * (low - spans[0][0])).toFixed(1)} mm off the others`);
      }
    }
  }
  const longest = Math.max(...byBed(level).map(([, rocks]) => Math.max(...rocks.map((r) => r.x)) - Math.min(...rocks.map((r) => r.x))));
  assert.ok(longest > 25, `the longest bed runs ${longest.toFixed(0)} m of the cliff`);
});

test('the beds lie one above another, and none in another', () => {
  for (const made of [level, tilted]) {
    const beds = byBed(made).map(([k, rocks]) => ({ k, low: span(rocks[0], made.up)[0], high: span(rocks[0], made.up)[1] }));
    for (let i = 1; i < beds.length; i++) {
      assert.ok(beds[i].low > beds[i - 1].low, `bed ${beds[i].k} isn't above bed ${beds[i - 1].k}`);
      assert.ok(beds[i].low > beds[i - 1].high - 0.25 * (beds[i - 1].high - beds[i - 1].low), `bed ${beds[i].k} lies deep in bed ${beds[i - 1].k}`);
    }
  }
});

test('beds differ in thickness, and the thickest come in first', () => {
  const deep = (made) => byBed(made).map(([, rocks]) => span(rocks[0], made.up)[1] - span(rocks[0], made.up)[0]);
  const all = deep(level);
  assert.ok(Math.max(...all) / Math.min(...all) > 1.4, `beds from ${Math.min(...all).toFixed(2)} to ${Math.max(...all).toFixed(2)} m thick`);
  const mean = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
  const low = makeLayers(land, { ...base, shows: 0.3 });
  assert.ok(byBed(low).length < byBed(level).length);
  assert.ok(mean(deep(low)) > mean(all), `the beds showing at 0.3 are ${mean(deep(low)).toFixed(2)} m thick, all of them ${mean(all).toFixed(2)} m`);
});

test('tilted, the beds climb across the face by the slant asked', () => {
  // (The lean is 0: the beds' tops lean toward +x, so each bed is lower
  // the further along it you go.)
  const long = byBed(tilted).filter(([, rocks]) => Math.max(...rocks.map((r) => r.x)) - Math.min(...rocks.map((r) => r.x)) > 8);
  assert.ok(long.length >= 3, `${long.length} beds long enough to measure`);
  for (const [k, rocks] of long) {
    const first = rocks.reduce((a, b) => (a.x < b.x ? a : b));
    const last = rocks.reduce((a, b) => (a.x > b.x ? a : b));
    const rise = (last.at.y - first.at.y) / (last.at.x - first.at.x);
    assert.ok(Math.abs(Math.abs(rise) - Math.tan(rad(15))) < 0.08, `bed ${k} climbs ${rise.toFixed(2)} a metre, for a slant of 15°`);
  }
  const flat = byBed(level).find(([, rocks]) => rocks.length > 6)[1];
  const heights = flat.map((r) => r.at.y);
  assert.ok(Math.max(...heights) - Math.min(...heights) < 0.02, 'a level bed isn\'t level');
});

test('every slab rests: most of its underside, and its middle, on the land or the slabs under it', () => {
  for (const [name, made] of [['level', level], ['tilted', tilted], ['some', some]]) {
    const face = made.rocks.filter((r) => !r.part);
    face.forEach((rock, at) => {
      const before = face.slice(0, at);
      const rests = undersideHeld(rock, land, COURSES.under, before);
      assert.ok(rests >= COURSES.rests - 1e-9, `${name}: a slab of bed ${rock.bed} rests on ${(100 * rests).toFixed(0)}% of its underside`);
      assert.ok(middleShowing(rock, land, undefined, before) <= BED.slack + 1e-6, `${name}: a slab of bed ${rock.bed} hangs by its middle`);
    });
  }
});

test('more showing brings more slabs in, and nearly all that were there stay', () => {
  const key = (r) => `${r.bed} ${r.piece}`;
  const now = new Set(level.rocks.filter((r) => !r.part).map(key));
  const were = some.rocks.filter((r) => !r.part).map(key);
  assert.ok(level.face > 1.5 * some.face, `${some.face} slabs at 0.4, ${level.face} at 1`);
  const stayed = were.filter((k) => now.has(k)).length;
  assert.ok(stayed >= 0.9 * were.length, `${stayed} of the ${were.length} slabs at 0.4 are still there at 1`);
});

test('the cliff keeps to the edge, and sinks away at its near end', () => {
  for (const r of level.rocks.filter((r) => !r.part)) assert.ok(r.x >= EDGE.from && r.x <= EDGE.to, `a slab at ${r.x.toFixed(1)} m`);
  const near = level.rocks.filter((r) => !r.part && r.x < EDGE.from + 2).length;
  const middle = level.rocks.filter((r) => !r.part && r.x > -6 && r.x < -4).length;
  assert.ok(near < middle, `${near} slabs in the first 2 m, ${middle} in 2 m of the middle`);
});

test('fallen slabs lie at the foot, on the bank', () => {
  const banked = createLand({ steep: 60, apron: apronFor({ shows: 1, fallen: 1 }) });
  const made = makeLayers(banked, { ...base, fallen: 1 });
  const fallen = made.rocks.filter((r) => r.part === 'fallen');
  assert.ok(fallen.length >= 30, `${fallen.length} fallen slabs`);
  assert.equal(made.loose, fallen.length);
  for (const r of fallen) {
    assert.equal(r.kind, 'layered');
    assert.ok(r.z >= banked.foot(r.x) - 0.2, 'a fallen slab lies behind the foot');
  }
});

test('the same seed and settings give the same cliff, and its list makes it again', () => {
  assert.deepEqual(makeLayers(land, { ...base, shows: 0.4 }).list, some.list);
  assert.notDeepEqual(makeLayers(land, { ...base, shows: 0.4, seed: 2 }).list, some.list);
  for (let i = 0; i < tilted.list.length; i += 11) assert.deepEqual(rockFrom(tilted.list[i]).positions, tilted.rocks[i].positions, `entry ${i} makes another slab`);
});
