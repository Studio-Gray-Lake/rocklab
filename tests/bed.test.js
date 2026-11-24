import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLand } from '../src/land.js';
import { shapeGranite } from '../src/granite.js';
import { BED, bedRock, middleShowing, undersideShowing } from '../src/bed.js';

// Bedding (src/bed.js): nothing floats. On level ground, on the steep band
// and on its top, at every steepness: no face that faces the land shows,
// the rock's underside below its middle is in the land, and at least the
// asked share of it is buried.

const SEEDS = [1, 2, 3, 4, 5, 6];
const AGES = [0, 0.5, 1];
const STEEPS = [0, 35, 60, 75];
const WHERES = [-0.4, 0.5, 1.2];
const SLANTS = [0, 35];
const rad = (degrees) => (degrees * Math.PI) / 180;

test('a bedded rock leaves no underside showing, whatever the land', () => {
  for (const steep of STEEPS) {
    const land = createLand({ steep });
    for (const where of WHERES) {
      const at = land.placeOn(-8, where);
      for (const seed of SEEDS) for (const age of AGES) for (const slant of SLANTS) {
        const rock = bedRock(shapeGranite({ seed, size: 1.5, age }), land, { x: at.x, z: at.z, shows: 1, slant: rad(slant), lean: rad(40 * seed), turn: rad(25 * seed) });
        const about = `steep ${steep}°, where ${where}, seed ${seed}, age ${age}, slant ${slant}°`;
        assert.ok(undersideShowing(rock, land) <= BED.slack + 1e-6, `${about}: an underside stands ${undersideShowing(rock, land).toFixed(3)} m out`);
        assert.ok(middleShowing(rock, land) <= BED.slack + 1e-6, `${about}: its middle hangs ${middleShowing(rock, land).toFixed(3)} m over the land`);
        // (The share buried is counted over a grid of points: good to a few in a hundred.)
        assert.ok(rock.buried >= BED.least - 0.04, `${about}: only ${(100 * rock.buried).toFixed(0)}% buried`);
        assert.ok(rock.pushed >= -1e-9, `${about}: the tests lifted it`);
      }
    }
  }
});

test('"how much shows" turned down only ever buries a rock deeper', () => {
  const land = createLand({ steep: 60 });
  for (const where of WHERES) {
    const at = land.placeOn(-8, where);
    for (const seed of SEEDS) {
      let last = -Infinity;
      for (const shows of [1, 0.75, 0.5, 0.25, 0.05]) {
        const rock = bedRock(shapeGranite({ seed, size: 1.5, age: 0.4 }), land, { x: at.x, z: at.z, shows });
        assert.ok(rock.buried >= last - 0.02, `where ${where}, seed ${seed}: less buried at ${shows}`);
        last = rock.buried;
      }
    }
  }
});

test('a rock with too little showing is left out', () => {
  const land = createLand({ steep: 0 });
  const rock = bedRock(shapeGranite({ seed: 1, size: 1.5, age: 0 }), land, { x: 0, z: 8, shows: 0 });
  assert.equal(rock.hidden, true);
  assert.equal(bedRock(shapeGranite({ seed: 1, size: 1.5, age: 0 }), land, { x: 0, z: 8, shows: 1 }).hidden, false);
});

test('the same settings give the same bedded rock', () => {
  const land = createLand({ steep: 60 });
  const at = land.placeOn(-8, 0.45);
  const make = () => bedRock(shapeGranite({ seed: 4, size: 2, age: 0.3 }), land, { x: at.x, z: at.z, shows: 0.6, slant: rad(35), turn: rad(20) });
  assert.deepEqual(make().positions, make().positions);
});
