import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STARTS, defaultSettings } from '../src/settings.js';
import { madeOn } from '../src/make.js';
import { rockOutput } from '../src/output.js';

// What Rock Lab hands over for each rock (src/output.js): plain arrays, a
// colour per facet, and the rock's convex corners.

const clusterOf = (kind) => {
  const s = { ...defaultSettings(), kind, ...STARTS[kind] };
  const { land, made } = madeOn('cluster', s);
  return { land, rocks: made.rocks, tone: { seed: s.seed, size: s.size } };
};

for (const kind of ['granite', 'layered']) {
  test(`${kind}: each rock is handed over as plain arrays of numbers, one entry a rock`, () => {
    const { land, rocks, tone } = clusterOf(kind);
    const out = rockOutput(rocks, land.heightAt, { tone });
    assert.equal(out.length, rocks.length);
    for (const o of out) {
      assert.deepEqual(Object.keys(o).sort(), ['colors', 'corners', 'normals', 'positions', 'triangles']);
      for (const key of ['positions', 'normals', 'colors', 'corners']) assert.ok(o[key] instanceof Float32Array, key);
      assert.ok(o.triangles > 0);
      for (const key of ['positions', 'normals', 'colors']) assert.equal(o[key].length, o.triangles * 9, key);
      assert.ok(o.corners.length >= 12 && o.corners.length % 3 === 0, 'at least four corners');
    }
  });

  test(`${kind}: a colour per facet, 0 to 1, the same at a triangle's three corners; normals of length one`, () => {
    const { land, rocks, tone } = clusterOf(kind);
    for (const o of rockOutput(rocks, land.heightAt, { tone })) {
      for (let t = 0; t < o.triangles; t++) {
        for (let v = 1; v < 3; v++) {
          for (let k = 0; k < 3; k++) {
            assert.equal(o.colors[t * 9 + v * 3 + k], o.colors[t * 9 + k]);
            assert.equal(o.normals[t * 9 + v * 3 + k], o.normals[t * 9 + k]);
          }
        }
        for (let k = 0; k < 3; k++) assert.ok(o.colors[t * 9 + k] >= 0 && o.colors[t * 9 + k] <= 1);
        assert.ok(Math.abs(Math.hypot(o.normals[t * 9], o.normals[t * 9 + 1], o.normals[t * 9 + 2]) - 1) < 1e-4);
      }
    }
  });

  test(`${kind}: every triangle lies within its rock's convex corners`, () => {
    const { land, rocks, tone } = clusterOf(kind);
    for (const o of rockOutput(rocks, land.heightAt, { tone })) {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < o.corners.length; i += 3) {
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], o.corners[i + k]); hi[k] = Math.max(hi[k], o.corners[i + k]); }
      }
      for (let i = 0; i < o.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) assert.ok(o.positions[i + k] >= lo[k] - 1e-3 && o.positions[i + k] <= hi[k] + 1e-3);
      }
    }
  });
}

test('the same rocks and settings hand over the same numbers', () => {
  const a = clusterOf('granite');
  const b = clusterOf('granite');
  assert.deepEqual(rockOutput(a.rocks, a.land.heightAt, { tone: a.tone }), rockOutput(b.rocks, b.land.heightAt, { tone: b.tone }));
});

test('what hands over the rocks needs no page: no window, no document, no drawing', () => {
  for (const file of ['output.js', 'granite.js', 'random.js', 'corners.js']) {
    const code = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /\b(window|document|WebGL|Mesh|Material|BufferGeometry)\b/, file);
  }
});
