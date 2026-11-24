import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHills } from '../src/hills.js';
import { createLand, landMesh } from '../src/land.js';
import { CONTOURS, contourLines, contoursOf } from '../src/contours.js';

// Contour lines (src/contours.js): a line round the land at every metre
// of height, a bolder one at every fifth, cut from the drawn ground's own
// facets.

const land = createHills({ seed: 1 });
const ground = landMesh(land, { step: 0.5, bare: 1 });
const made = contoursOf(ground);
const top = ground.geometry.attributes.position.array.reduce((most, v, i) => (i % 3 === 1 ? Math.max(most, v) : most), 0);
// Each line: [x, y, z] of one end, then of the other.
const pairs = (list) => Array.from({ length: list.length / 6 }, (_, i) => [list.slice(i * 6, i * 6 + 3), list.slice(i * 6 + 3, i * 6 + 6)]);

test('every line is level, at a whole metre of height; the bolder ones at every fifth', () => {
  assert.ok(made.thin.length > 0 && made.bold.length > 0);
  for (const [name, list] of [['thin', made.thin], ['bold', made.bold]]) {
    for (const [a, b] of pairs(list)) {
      assert.equal(a[1], b[1]);
      assert.ok(Number.isInteger(a[1] / CONTOURS.every) && a[1] >= CONTOURS.every, `a line at ${a[1]} m`);
      assert.equal((a[1] / CONTOURS.every) % CONTOURS.bold === 0, name === 'bold', `a ${name} line at ${a[1]} m`);
    }
  }
});

test('there is a line at every metre below the top of the land, and none out on the plain', () => {
  assert.equal(made.heights, Math.ceil(top / CONTOURS.every) - 1);
  for (const [a, b] of pairs([...made.thin, ...made.bold])) {
    for (const [x, , z] of [a, b]) assert.ok(land.hillsAt(x, z) > 0, `a line on the plain at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
});

test('the lines lie on the ground', () => {
  for (const [a, b] of pairs([...made.thin, ...made.bold])) {
    for (const [x, y, z] of [a, b]) assert.ok(Math.abs(land.heightAt(x, z) - y) < 0.3, `a line ${(y - land.heightAt(x, z)).toFixed(2)} m off the ground`);
  }
});

test('lines twice as far apart in height: half as many of them', () => {
  const wide = contoursOf(ground, { every: 2 });
  assert.equal(wide.heights, Math.ceil(top / 2) - 1);
  assert.ok(wide.thin.length + wide.bold.length < made.thin.length + made.bold.length);
});

test('drawn: two sets of lines, lifted a little off the ground; and they work on the test land too', () => {
  const drawn = contourLines(ground);
  assert.deepEqual(drawn.children.map((c) => c.name), ['thin', 'bold']);
  for (const lines of drawn.children) assert.equal(lines.position.y, CONTOURS.lift);
  assert.equal(drawn.userData.heights, made.heights);
  const slope = contoursOf(landMesh(createLand({ steep: 60 })));
  assert.ok(slope.heights >= 7, `${slope.heights} heights on the test land`);
});
