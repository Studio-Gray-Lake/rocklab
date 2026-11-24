import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAND_SIZE, createLand } from '../src/land.js';
import { BED, middleShowing, undersideShowing } from '../src/bed.js';
import { EDGE, apronFor, makeEdge } from '../src/edge.js';

// The foot and the top (src/edge.js, src/land.js): the bank of fallen rock
// at 35° in the land, the loose rocks on it, and the rocks at the lip.
// With both at nothing, the edge is rock for rock what it was without them.

const rad = (degrees) => (degrees * Math.PI) / 180;
const settings = { seed: 1, size: 4, age: 0.15, slant: rad(35), turn: rad(20), shows: 0.8 };
const plain = createLand({ steep: 60 });
const banked = createLand({ steep: 60, apron: apronFor({ shows: 0.8, fallen: 1 }) });
const full = makeEdge(banked, { ...settings, fallen: 1, rim: 1 });
const fallen = full.rocks.filter((r) => r.part === 'fallen');
const lip = full.rocks.filter((r) => r.part === 'rim');

test('the bank at the foot lies at about 35°, and is as tall as asked', () => {
  const x = -5;
  const tall = banked.apronAt(x);
  assert.ok(Math.abs(tall - EDGE.apron) < 0.05, `${tall.toFixed(2)} m tall where rock shows fully`);
  const run = tall / banked.repose;
  const z = banked.foot(x) + run / 2; // halfway down it
  assert.ok(Math.abs(banked.slopeAt(x, z) - 35) < 4, `${banked.slopeAt(x, z).toFixed(1)}° halfway down the bank`);
  assert.ok(banked.onApron(x, z) > 0.9);
  assert.equal(banked.onApron(x, banked.foot(x) + run + 3), 0, 'the meadow past its toe');
  assert.ok(banked.heightAt(x, z) > plain.heightAt(x, z) + 0.5);
});

test('with no fallen rock the land has no bank: it is the land as it was', () => {
  const none = createLand({ steep: 60, apron: apronFor({ shows: 0.8, fallen: 0 }) });
  for (let x = LAND_SIZE.x0; x <= LAND_SIZE.x1; x += 1.7) {
    for (let z = LAND_SIZE.z0; z <= LAND_SIZE.z1; z += 1.3) assert.equal(none.heightAt(x, z), plain.heightAt(x, z), `(${x}, ${z})`);
  }
  assert.equal(none.apronAt(-5), 0);
});

test('with no fallen rock and no rim, the edge is rock for rock what it was', () => {
  const none = createLand({ steep: 60, apron: apronFor({ shows: 0.8, fallen: 0 }) });
  const before = makeEdge(plain, settings);
  const after = makeEdge(none, { ...settings, fallen: 0, rim: 0 });
  assert.deepEqual(after.list, before.list);
  assert.equal(after.loose, 0);
  assert.equal(after.lip, 0);
});

test('there is fallen rock at the foot and rock at the rim, and more when more is asked', () => {
  assert.ok(fallen.length >= 30, `${fallen.length} fallen rocks at plenty`);
  assert.ok(lip.length >= 8, `${lip.length} rocks at the rim at plenty`);
  const some = makeEdge(createLand({ steep: 60, apron: apronFor({ shows: 0.8, fallen: 0.4 }) }), { ...settings, fallen: 0.4, rim: 0.4 });
  assert.ok(some.loose > 0 && some.loose < full.loose, `${some.loose} at 0.4, ${full.loose} at 1`);
  assert.ok(some.lip > 0 && some.lip < full.lip, `${some.lip} at 0.4, ${full.lip} at 1`);
});

test('fallen rock: many small and few big, the bigger lower, all in front of the face', () => {
  const sizes = fallen.map((r) => r.size).sort((a, b) => a - b);
  const middle = sizes[Math.floor(sizes.length / 2)];
  assert.ok(middle < (sizes[0] + sizes.at(-1)) / 2, 'half of them are not in the smaller half of the sizes');
  const third = Math.floor(fallen.length / 3);
  const bySize = [...fallen].sort((a, b) => a.size - b.size);
  const height = (rocks) => rocks.reduce((sum, r) => sum + banked.heightAt(r.x, r.z), 0) / rocks.length;
  assert.ok(height(bySize.slice(-third)) < height(bySize.slice(0, third)), `the biggest third lie at ${height(bySize.slice(-third)).toFixed(2)} m, the smallest at ${height(bySize.slice(0, third)).toFixed(2)} m`);
  for (const r of fallen) assert.ok(r.z >= banked.foot(r.x) - 0.2, `a fallen rock lies ${(banked.foot(r.x) - r.z).toFixed(2)} m behind the foot`);
});

test('fallen rock is fresher than the face', () => {
  const face = full.rocks.filter((r) => !r.part);
  const age = (rocks) => rocks.reduce((sum, r) => sum + r.age, 0) / rocks.length;
  assert.ok(age(fallen) < age(face));
});

test('the rim: rocks at the top of the band, each more than half buried', () => {
  for (const r of lip) {
    assert.ok(r.held > 0.5, `a rim rock is ${(100 * r.held).toFixed(0)}% in the land or a neighbour`);
    // (Each group's big rock is at the lip; the others stand against it.)
    if (r.role !== 'big') continue;
    const top = banked.placeOn(r.x, 1).y;
    assert.ok(banked.heightAt(r.x, r.z) > top - 1.2, `a rim rock stands ${banked.heightAt(r.x, r.z).toFixed(1)} m up, where the band's top is at ${top.toFixed(1)} m`);
  }
});

test('nothing floats at the foot or the top, against the land and every rock already there', () => {
  full.rocks.forEach((rock, k) => {
    const before = full.rocks.slice(0, k);
    const showing = Math.max(undersideShowing(rock, banked, BED.under, undefined, before), middleShowing(rock, banked, undefined, before));
    assert.ok(showing <= BED.slack + 1e-6, `a ${rock.part ?? 'face'} rock ("${rock.spot}") shows ${showing.toFixed(3)} m of underside`);
    assert.ok(rock.exposed >= BED.exposed, `only ${(100 * rock.exposed).toFixed(0)}% of a ${rock.part ?? 'face'} rock is clear`);
  });
});
