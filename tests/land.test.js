import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAND_SIZE, createLand } from '../src/land.js';

// The test land (src/land.js): a band as steep as asked, sinking into the
// meadow at one end, with a height everywhere.

test('the band is as steep as asked, halfway up it', () => {
  for (const steep of [20, 35, 60, 75]) {
    const land = createLand({ steep });
    const at = land.placeOn(-8, 0.5);
    assert.ok(Math.abs(land.slopeAt(at.x, at.z) - steep) < 4, `asked ${steep}°, got ${land.slopeAt(at.x, at.z).toFixed(1)}°`);
  }
});

test('the meadows are gentle, in front of the band and behind it', () => {
  const land = createLand({ steep: 60 });
  for (const where of [-0.5, 1.4]) {
    const at = land.placeOn(-8, where);
    assert.ok(land.slopeAt(at.x, at.z) < 8, `${where}: ${land.slopeAt(at.x, at.z).toFixed(1)}°`);
  }
});

test('the band stands its height, and sinks into the meadow at its far end', () => {
  const land = createLand({ steep: 60, height: 8 });
  const rise = (x) => land.placeOn(x, 1.3).y - land.placeOn(x, -0.3).y;
  assert.ok(Math.abs(rise(-8) - 8) < 0.5, `${rise(-8).toFixed(2)} m at its middle`);
  assert.ok(Math.abs(rise(22)) < 0.5, `${rise(22).toFixed(2)} m at its far end`);
});

test('with no steepness there is no band', () => {
  const land = createLand({ steep: 0 });
  assert.ok(Math.abs(land.placeOn(-8, 1.3).y - land.placeOn(-8, -0.3).y) < 0.5);
});

test('the land has a height everywhere on it', () => {
  const land = createLand({ steep: 75 });
  for (let x = LAND_SIZE.x0; x <= LAND_SIZE.x1; x += 1.5) {
    for (let z = LAND_SIZE.z0; z <= LAND_SIZE.z1; z += 1.5) assert.ok(Number.isFinite(land.heightAt(x, z)), `(${x}, ${z})`);
  }
});
