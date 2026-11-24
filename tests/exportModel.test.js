import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTS, defaultSettings } from '../src/settings.js';
import { madeOn } from '../src/make.js';
import { drawRocks } from '../src/rockLook.js';
import { rockFrom } from '../src/cluster.js';
import { MODEL_LICENCE, modelOf } from '../src/exportModel.js';

// The rocks on show as a model (src/exportModel.js): every drawn triangle,
// where it stands, and the list of rocks that makes them again.

test('a cliff as a model: every triangle drawn, in place, and its rocks listed so they can be made again', () => {
  const s = { ...defaultSettings(), kind: 'granite', ...STARTS.granite };
  const { land, made } = madeOn('cliff', s);
  const drawn = drawRocks(made.rocks, land.heightAt, { tone: { seed: s.seed, size: s.size } });
  drawn.position.set(1, 2, 3);
  const { root, rocks, triangles } = modelOf([drawn], { version: '0.2.0', tab: 'cliff', settings: s });
  assert.equal(rocks, made.rocks.length);
  assert.equal(triangles, drawn.userData.triangles);
  const [mesh] = root.children;
  const [a, b] = [drawn.geometry.getAttribute('position'), mesh.geometry.getAttribute('position')];
  assert.ok(Math.abs(b.getX(0) - (a.getX(0) + 1)) < 1e-5 && Math.abs(b.getY(0) - (a.getY(0) + 2)) < 1e-5 && Math.abs(b.getZ(0) - (a.getZ(0) + 3)) < 1e-5);
  assert.deepEqual(mesh.geometry.getAttribute('color').array, drawn.geometry.getAttribute('color').array);
  const { rocklab } = root.userData;
  assert.equal(rocklab.licence, MODEL_LICENCE);
  assert.equal(rocklab.tab, 'cliff');
  // The list makes the same rocks again.
  const again = rockFrom(rocklab.rocks[0]);
  assert.deepEqual(Array.from(again.positions), Array.from(made.rocks[0].positions));
});
