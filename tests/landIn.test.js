import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LAND_IN, landIn } from '../src/landIn.js';
import { HILLS, bandsOf, createHills } from '../src/hills.js';
import { createLand } from '../src/land.js';

// The land as the placer reads it (src/landIn.js): height and normal, and
// how bare the rock is and which kind. The land of hills says where its
// rock is bare, from its beds; a land that doesn't say is read from its
// slope alone; and what a land says is kept in range.

const half = HILLS.size / 2;
const slopeAt = (land, x, z) => THREE.MathUtils.radToDeg(Math.acos(land.normalAt(x, z).y));

test('the land of hills says its rock is bare along its bands, and nowhere on the plain', () => {
  for (const seed of [1, 2, 3]) {
    const hills = createHills({ seed });
    const land = landIn(hills);
    assert.equal(land.says, true);
    let on = 0, bare = 0;
    for (const band of bandsOf(hills)) {
      for (const stretch of band.stretches) {
        // A little way up the band from its foot.
        for (let i = 0; i + 1 < stretch.points.length; i += 3) {
          const [[ax, az], [bx, bz]] = [stretch.points[i], stretch.points[i + 1]];
          const [x, z] = [(ax + bx) / 2, (az + bz) / 2];
          const up = hills.normalAt(x, z);
          const flat = Math.hypot(up.x, up.z) || 1;
          const rock = land.rockAt(x - (up.x / flat) * 0.5, z - (up.z / flat) * 0.5);
          on++;
          if (rock.bare > 0) bare++;
          assert.ok(rock.bare <= 1);
          assert.equal(rock.kind, 'granite');
        }
      }
    }
    assert.ok(on > 10 && bare / on > 0.9, `seed ${seed}: bare at ${bare} of ${on} places up the bands`);
    for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      assert.equal(land.rockAt(x, z).bare, 0, `seed ${seed}: the plain at ${x}, ${z}`);
    }
  }
});

test('a land read at a point reads the same, whatever was read before it', () => {
  const [a, b] = [landIn(createHills({ seed: 4 })), landIn(createHills({ seed: 4 }))];
  const points = Array.from({ length: 40 }, (_, i) => [((i * 37) % 80) - 40, ((i * 53) % 80) - 40]);
  const first = points.map(([x, z]) => a.rockAt(x, z));
  const backward = points.slice().reverse().map(([x, z]) => b.rockAt(x, z)).reverse();
  assert.deepEqual(first, backward);
});

test('a land that does not say is read from its slope: bare where steep, under soil where gentle', () => {
  const ground = createLand();
  const land = landIn(ground, { kind: 'layered' });
  assert.equal(land.says, false);
  let steep = 0, gentle = 0;
  for (let x = -20; x <= 6; x += 2) {
    for (let z = -14; z <= 14; z += 0.5) {
      const slope = slopeAt(ground, x, z);
      const rock = land.rockAt(x, z);
      assert.equal(rock.kind, 'layered');
      if (slope >= LAND_IN.bare[1]) { steep++; assert.equal(rock.bare, 1); }
      if (slope <= LAND_IN.bare[0]) { gentle++; assert.equal(rock.bare, 0); }
    }
  }
  assert.ok(steep > 10 && gentle > 100, `${steep} steep places, ${gentle} gentle`);
});

test('what a land says is kept in range; a plain [x, y, z] normal is taken', () => {
  const said = (rock) => landIn({ heightAt: () => 0, normalAt: () => [0, 1, 0], rockAt: () => rock });
  assert.deepEqual(said({ bare: 2, kind: 'obsidian' }).rockAt(0, 0), { bare: 1, kind: 'granite' });
  assert.deepEqual(said({ bare: 0.5 }).rockAt(0, 0), { bare: 0.5, kind: 'granite' });
  assert.deepEqual(said({ bare: -1, kind: 'layered' }).rockAt(0, 0), { bare: 0, kind: 'layered' });
  assert.deepEqual(said(null).rockAt(0, 0), { bare: 0, kind: 'granite' });
  // A rock that lies in beds is made as layered, by whichever name.
  for (const name of ['basalt', 'Marble', 'sandstone']) assert.equal(said({ bare: 1, kind: name }).rockAt(0, 0).kind, 'layered');
  assert.equal(said({ bare: 1, kind: 'Granite' }).rockAt(0, 0).kind, 'granite');
  assert.deepEqual(said({ bare: 0.4 }).normalAt(3, 4).toArray(), [0, 1, 0]);
  assert.throws(() => landIn({ heightAt: () => 0 }), TypeError);
});

// Where the test land's band begins to rise at x: the first place, coming
// from the low meadow, as steep as a rise is walked up.
function footOf(land, x) {
  let z = 14;
  while (z > -14 && land.at(x, z).steep < LAND_IN.ease) z -= 0.05;
  return z;
}

test('a point at the foot of a band reads the band: how tall, how far back, how steep', () => {
  const land = landIn(createLand({ steep: 60 }));
  for (const x of [-20, -15, -5, 0, 5, 8]) {
    const z = footOf(land, x);
    const point = land.at(x, z);
    assert.ok(Math.abs(point.rise - 8) < 0.4, `x ${x}: rise ${point.rise}`);
    assert.ok(point.wide > 4 && point.wide < 6.5, `x ${x}: wide ${point.wide}`);
    assert.ok(Math.abs(point.steepest - 60) < 3, `x ${x}: steepest ${point.steepest}`);
    assert.ok(point.up[1] < -0.8, `x ${x}: up the band is -z`);
    assert.ok(Math.abs(Math.hypot(...point.up) - 1) < 1e-9);
  }
  // Where the band sinks into the meadow, its rise sinks with it.
  const rises = [10, 12, 15, 18].map((x) => land.at(x, footOf(land, x)).rise);
  for (let i = 1; i < rises.length; i++) assert.ok(rises[i] < rises[i - 1], `rises ${rises}`);
  assert.ok(rises[3] < 1.5, `rises ${rises}`);
});

test('read at its feet, a band of the hills is as tall as its bed makes it', () => {
  for (const seed of [1, 2, 3, 5, 6]) {
    const hills = createHills({ seed });
    const land = landIn(hills);
    const ratios = [];
    for (const band of bandsOf(hills)) {
      for (const stretch of band.stretches) {
        for (let i = 0; i + 1 < stretch.points.length; i += 2) {
          const [[ax, az], [bx, bz]] = [stretch.points[i], stretch.points[i + 1]];
          const [x, z] = [(ax + bx) / 2, (az + bz) / 2];
          // A band rises by its bed's thickness, and the hill under it by
          // its own share; unless the hill ends first.
          const point = land.at(x, z);
          let hill = 0;
          for (let d = 0; d <= LAND_IN.widest; d += 0.25) hill = Math.max(hill, hills.heightAt(x + point.up[0] * d, z + point.up[1] * d) - hills.heightAt(x, z));
          ratios.push(point.rise / Math.min(hills.thickAt(band.bed, x, z) * (1 + hills.span), hill));
        }
      }
    }
    ratios.sort((a, b) => a - b);
    const middle = ratios[Math.floor(ratios.length / 2)];
    // (Taller is fine: where two beds lie close, the hills make one taller band.)
    const short = ratios.filter((r) => r < 0.75).length / ratios.length;
    assert.ok(middle > 0.85 && middle < 1.15, `seed ${seed}: the middle rise is ${middle} of the bed's`);
    assert.ok(short < 0.05, `seed ${seed}: ${short} of the rises short of the bed's`);
  }
});

test('on the flat there is no way up and no rise; a point reads the same, whatever was read before it', () => {
  const hills = createHills({ seed: 2 });
  const flat = landIn(hills).at(-half, -half);
  assert.deepEqual([flat.up, flat.rise, flat.wide, flat.steep], [[0, 0], 0, 0, 0]);
  const [a, b] = [landIn(createHills({ seed: 2 })), landIn(createHills({ seed: 2 }))];
  const points = Array.from({ length: 30 }, (_, i) => [((i * 29) % 70) - 35, ((i * 47) % 70) - 35]);
  assert.deepEqual(points.map(([x, z]) => a.at(x, z)), points.slice().reverse().map(([x, z]) => b.at(x, z)).reverse());
});
