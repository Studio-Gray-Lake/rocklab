import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRock, inside, measure } from '../src/granite.js';
import { LAYERED, shapeLayered } from '../src/layered.js';
import { KINDS, shapeOf } from '../src/kinds.js';
import { createLand } from '../src/land.js';
import { BED, bedRock, middleShowing, undersideShowing } from '../src/bed.js';
import { makeCluster, rockFrom } from '../src/cluster.js';

// Layered rock's slab (src/layered.js): whole and convex, flat on top and
// underneath, thin but never a sliver or knife-edged, the same for the
// same seed, and only ever worn by age, its top and bottom last.

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const AGES = [0, 0.1, 0.25, 0.5, 0.75, 1];
const SIZES = [0.3, 1.5, 6];
const BEDS = [LAYERED.bedRange[0], LAYERED.bed, LAYERED.bedRange[1]];

const each = (run) => {
  for (const seed of SEEDS) for (const size of SIZES) for (const age of AGES) for (const thick of BEDS) run({ seed, size, age, thick });
};

test('every slab is whole: a closed convex solid holding all its corners', () => {
  each((spec) => {
    const shape = shapeLayered(spec);
    const rock = buildRock(shape.points);
    assert.ok(rock.planes.length >= 6, `${JSON.stringify(spec)} has ${rock.planes.length} faces`);
    for (const p of shape.points) assert.ok(inside(rock, p.x, p.y, p.z, 1e-4 * spec.size), `${JSON.stringify(spec)}: a corner is outside its own hull`);
  });
});

test('a slab is thin but never a sliver, and never knife-edged', () => {
  each((spec) => {
    const shape = shapeLayered(spec);
    const m = measure(buildRock(shape.points));
    const least = (m.thinnest * m.longest) / shape.length;
    assert.ok(least >= LAYERED.thin, `${JSON.stringify(spec)}: ${least.toFixed(3)} of its length thick`);
    assert.ok(m.sharpest >= 45, `${JSON.stringify(spec)}: an edge of ${m.sharpest.toFixed(1)}°`);
  });
});

test('its bed is as thick as asked, give or take a tenth', () => {
  for (const seed of SEEDS) {
    for (const thick of BEDS) {
      const shape = shapeLayered({ seed, size: 2, age: 0, thick });
      const share = shape.thick / shape.length;
      assert.ok(share > 0.89 * thick && share < 1.11 * thick, `seed ${seed}: asked ${thick}, got ${share.toFixed(3)}`);
    }
  }
});

// The share of a slab's skin that is its flat top and bottom: the faces
// square to its bed (its y).
function flatShare(shape) {
  const rock = buildRock(shape.points);
  let flat = 0;
  let all = 0;
  for (let i = 0; i < rock.facet.length; i++) {
    all += rock.areas[i];
    if (Math.abs(rock.normals[i * 3 + 1]) > 0.999) flat += rock.areas[i];
  }
  return flat / all;
}

test('young, it is flat on top and underneath; old, it still has its flat top', () => {
  for (const seed of SEEDS) {
    const young = flatShare(shapeLayered({ seed, size: 1.5, age: 0 }));
    const old = flatShare(shapeLayered({ seed, size: 1.5, age: 1 }));
    assert.ok(young > 0.45, `seed ${seed}: ${(100 * young).toFixed(0)}% of a young slab is its two flat faces`);
    assert.ok(old > 0.12, `seed ${seed}: ${(100 * old).toFixed(0)}% of an old slab is still flat`);
    assert.ok(old < young, `seed ${seed}: age wears nothing off its flat faces`);
  }
});

test('the same seed and settings give the same slab, and another seed another', () => {
  for (const spec of [{ seed: 3, size: 1.5, age: 0 }, { seed: 3, size: 6, age: 0.6, thick: 0.2 }, { seed: 11, size: 0.3, age: 1 }]) {
    const a = buildRock(shapeLayered(spec).points).positions;
    assert.deepEqual(buildRock(shapeLayered(spec).points).positions, a);
    assert.notDeepEqual(buildRock(shapeLayered({ ...spec, seed: spec.seed + 1 }).points).positions, a);
  }
});

test('age only wears: an older slab lies inside the younger one, and gains faces', () => {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      let faces = 0;
      for (let i = 1; i < AGES.length; i++) {
        const younger = buildRock(shapeLayered({ seed, size, age: AGES[i - 1] }).points);
        const older = shapeLayered({ seed, size, age: AGES[i] });
        for (const p of older.points) {
          assert.ok(inside(younger, p.x, p.y, p.z, 1e-4 * size), `seed ${seed}, ${size} m: at age ${AGES[i]} a corner stands out of the slab at age ${AGES[i - 1]}`);
        }
        faces = Math.max(faces, measure(buildRock(older.points)).faces);
      }
      const young = measure(buildRock(shapeLayered({ seed, size, age: 0 }).points)).faces;
      assert.ok(young >= 6 && young <= 2 + LAYERED.sides[1] + LAYERED.breaks, `seed ${seed}, ${size} m: ${young} faces when young`);
      assert.ok(faces > 2 * young, `seed ${seed}, ${size} m: never more than ${faces} faces`);
    }
  }
});

test('layered rock is a kind of rock, beside granite, with its own thin rule', () => {
  assert.equal(shapeOf('layered'), shapeLayered);
  assert.equal(shapeLayered({ seed: 1 }).kind, 'layered');
  assert.ok(KINDS.layered.thin < KINDS.granite.thin);
  assert.throws(() => shapeOf('marble'));
});

test('a slab beds like any rock, and its list entry makes the same slab again', () => {
  for (const steep of [0, 60]) {
    const land = createLand({ steep });
    const at = land.placeOn(-8, 0.45);
    for (const seed of [1, 2, 3, 4]) {
      for (const age of [0, 1]) {
        const rock = bedRock(shapeLayered({ seed, size: 1.6, age }), land, { x: at.x, z: at.z, shows: 0.8, slant: 0.6, turn: 0.35 * seed });
        const showing = Math.max(undersideShowing(rock, land), middleShowing(rock, land));
        assert.ok(showing <= BED.slack + 1e-6, `steep ${steep}°, seed ${seed}, age ${age}: shows ${showing.toFixed(3)} m of underside`);
        assert.equal(rock.kind, 'layered');
      }
    }
    const one = makeCluster(land, { kind: 'layered', x: at.x, z: at.z, seed: 2, size: 1.6, pieces: 1, shows: 0.8 });
    assert.equal(one.rocks.length, 1);
    assert.equal(one.list[0].kind, 'layered');
    assert.deepEqual(rockFrom(one.list[0]).positions, one.rocks[0].positions);
  }
});
