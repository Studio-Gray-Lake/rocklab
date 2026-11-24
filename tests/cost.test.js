import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareCost } from '../scripts/cost.js';

// What a square of land costs (scripts/cost.js): the land of hills at its
// starting settings, its rock laid by place, handed over and read for the
// walk. A change that makes it dearer, or cheaper, shows here; if it is
// meant, the counts are recorded again (scripts/cost.js prints them). How
// long each stage takes depends on the machine, so it is printed by the
// script, not held.
const RECORDED = { rocks: 795, triangles: 36066, corners: 23270, bytes: 4174368, groups: 359, ground: 161, wall: 198 };

test('a square of land costs what was recorded', () => {
  assert.deepEqual(squareCost().counts, RECORDED);
});
