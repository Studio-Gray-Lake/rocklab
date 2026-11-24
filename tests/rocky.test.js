import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTS, defaultSettings } from '../src/settings.js';
import { madeOn } from '../src/make.js';
import { placeOn, placerFor } from '../src/place.js';
import { createHills } from '../src/hills.js';
import { rockTop } from '../src/walk.js';

// How rocky (src/edge.js `rocky`, and on the land src/spots.js and
// src/place.js): the face filled between the clusters, from nothing (only
// the clusters) to rocked out end to end and top to bottom.

// The share of the test cliff's face with rock over it, seen from above.
function coverOf(land, rocks) {
  let on = 0, all = 0;
  for (let x = -16; x <= 6; x += 0.5) {
    for (let up = 0.1; up <= 0.9 + 1e-9; up += 0.1) {
      const p = land.placeOn(x, up);
      all++;
      const ground = land.heightAt(p.x, p.z);
      if (rocks.some((r) => r.min[0] <= p.x && r.max[0] >= p.x && r.min[2] <= p.z && r.max[2] >= p.z && rockTop(r, p.x, p.z) > ground)) on++;
    }
  }
  return on / all;
}
const granite = (over) => ({ ...defaultSettings(), kind: 'granite', ...STARTS.granite, ...over });
const cliffs = [0, 0.5, 1].map((rocky) => madeOn('cliff', granite({ rocky })));

test('on the test cliff: the more rocky, the more of the face is rock; at full, nearly all of it', () => {
  const covers = cliffs.map(({ land, made }) => coverOf(land, made.rocks));
  assert.ok(covers[0] < covers[1] && covers[1] < covers[2], `covered: ${covers}`);
  assert.ok(covers[2] > 0.93, `at full ${covers[2]} of the face`);
  assert.ok(covers[0] < 0.8, `at nothing ${covers[0]} of the face`);
});

test('how rocky only fills: the clusters stay where they are, and more places fill as it rises', () => {
  const clustersOf = (made) => made.clusters.filter((c) => c.spot.rank !== 'fill').map((c) => c.rocks.map((r) => JSON.stringify([r.at, r.q])));
  assert.deepEqual(clustersOf(cliffs[1].made), clustersOf(cliffs[0].made));
  assert.deepEqual(clustersOf(cliffs[2].made), clustersOf(cliffs[0].made));
  const fills = cliffs.map(({ made }) => made.clusters.filter((c) => c.spot.rank === 'fill').length);
  assert.equal(fills[0], 0);
  assert.ok(fills[0] < fills[1] && fills[1] < fills[2], `filling clusters: ${fills}`);
});

test('on the land, the fill is laid by place: a square made alone is the square made among its neighbours', () => {
  const hills = createHills({ seed: 2 });
  const settings = { seed: 3, shows: 0.8, size: 3, rocky: 0.7 };
  const squares = [[-12, 0, -12, 0], [0, 12, -12, 0]].map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1 }));
  const together = placerFor(hills, settings);
  const both = squares.map((rect) => placeOn(together, rect).list);
  assert.deepEqual(placeOn(placerFor(hills, settings), squares[1]).list, both[1]);
  // And the fill is there: more rock than without it.
  const without = placeOn(hills, squares[0], { ...settings, rocky: 0 });
  assert.ok(both[0].length > without.list.length, `${both[0].length} rocks with it, ${without.list.length} without`);
});
