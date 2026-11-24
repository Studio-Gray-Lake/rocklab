import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAWN, LEVELS, drawnFingerprintOf, fingerprintOf } from '../scripts/same-rocks.js';

// Every level at its starting settings, rock for rock, as recorded before
// the core was split out. A change meant
// to leave the rocks alone must keep these. A change meant to move them
// is shown first, then recorded here again (scripts/same-rocks.js prints
// them).
const RECORDED = {
  'granite stone': { rocks: 1, hash: '0269513c' },
  'layered stone': { rocks: 1, hash: 'd9a7b36f' },
  'granite cluster': { rocks: 7, hash: '21bed1ce' },
  'layered cluster': { rocks: 12, hash: '77eaca4c' },
  'granite cliff': { rocks: 204, hash: '7cbb4f85' },
  'layered cliff': { rocks: 200, hash: 'c5166a94' },
  'land': { rocks: 795, hash: 'b3679412' }, // laid by place
};

for (const [name, make] of Object.entries(LEVELS)) {
  test(`the same rocks: ${name}`, () => {
    assert.deepEqual(fingerprintOf(make()), RECORDED[name]);
  });
}

// And what the page draws of them: every triangle shown, with its normal
// and its colour.
const DRAWN_RECORDED = {
  'granite cluster': { triangles: 245, hash: '1cf2ad02' },
  'layered cluster': { triangles: 605, hash: '9116ba60' },
  'granite cliff': { triangles: 8949, hash: '77d9d489' },
  'layered cliff': { triangles: 11141, hash: '13b9ce53' },
};

for (const [name, draw] of Object.entries(DRAWN)) {
  test(`the same look: ${name}`, () => {
    assert.deepEqual(drawnFingerprintOf(draw()), DRAWN_RECORDED[name]);
  });
}
