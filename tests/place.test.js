import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE, placeOn, placeSteps, placerFor } from '../src/place.js';
import { SPOTS } from '../src/spots.js';
import { createHills } from '../src/hills.js';

// The land's rock laid by place (src/place.js): a square comes out the
// same whichever was made first, and made alone or among its neighbours;
// what ranks first stands, and what ranks after is bedded against it.

const hills = createHills({ seed: 2 });
// Everything laid: the clusters, pale lengths, the rim, fallen rock,
// strewn stones, and the noise.
const all = { seed: 3, shows: 0.9, fallen: 0.8, rim: 0.8, slope: 1, size: 3, patchy: 0.6, drift: 0.6 };
const squares = [[-12, 0, -12, 0], [0, 12, -12, 0], [-12, 0, 0, 12], [0, 12, 0, 12]].map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1 }));
const listOf = (placer, rect) => placeOn(placer, rect).list;

test('squares made in two orders, or alone, are the same rocks', () => {
  const forward = placerFor(hills, all);
  const backward = placerFor(hills, all);
  const one = squares.map((rect) => listOf(forward, rect));
  const other = squares.slice().reverse().map((rect) => listOf(backward, rect)).reverse();
  assert.deepEqual(other, one);
  assert.ok(one.every((list) => list.length > 10), `rocks to a square: ${one.map((list) => list.length)}`);
  // Made alone, with nothing made around it first: the same.
  assert.deepEqual(listOf(placerFor(hills, all), squares[3]), one[3]);
  // And the four together are the whole, rock for rock.
  const whole = placeOn(hills, { x0: -12, x1: 12, z0: -12, z1: 12 }, all);
  const sorted = (list) => list.map((entry) => JSON.stringify(entry)).sort();
  assert.deepEqual(sorted(whole.list), sorted(one.flat()));
});

test('everything laid lies in the rectangle asked for, all of its parts there', () => {
  const made = placeOn(hills, { x0: -40, x1: 40, z0: -40, z1: 0 }, all);
  const parts = new Set(made.laid.map((thing) => thing.part));
  assert.deepEqual([...parts].sort(), ['face', 'fallen', 'rim', 'strewn']);
  for (const thing of made.laid) {
    assert.ok(thing.at.x >= -40 && thing.at.x < 40 && thing.at.z >= -40 && thing.at.z < 0);
    for (const rock of thing.rocks) assert.equal(rock.spot, thing.id);
  }
  // Nothing lies further from the cell its foot is in than the placer looks.
  for (const thing of made.laid.filter((t) => t.part !== 'strewn')) {
    const [cx, cz] = thing.id.split(' ').at(-2).split(',').map(Number);
    const [dx, dz] = [Math.max(cx * SPOTS.cell - thing.at.x, 0, thing.at.x - (cx + 1) * SPOTS.cell), Math.max(cz * SPOTS.cell - thing.at.z, 0, thing.at.z - (cz + 1) * SPOTS.cell)];
    assert.ok(Math.hypot(dx, dz) < PLACE.far, `${thing.id} is ${Math.hypot(dx, dz)} m from its cell`);
  }
});

test('what ranks first stands: adding what ranks after it does not move it', () => {
  const rect = squares[1];
  const face = (made) => made.laid.filter((thing) => thing.part === 'face').map((thing) => thing.rocks.map((rock) => JSON.stringify([rock.at, rock.q])));
  const bare = placeOn(hills, rect, { ...all, fallen: 0, rim: 0 });
  const full = placeOn(hills, rect, all);
  assert.deepEqual(face(full), face(bare));
  assert.ok(full.rocks.length > bare.rocks.length);
  // The fallen rock is bedded against the clusters already there: none of
  // it is made as though they weren't.
  const alone = placerFor(hills, all);
  const steps = placeSteps(alone, rect);
  const parts = [];
  for (let step = steps.next(); !step.done; step = steps.next()) parts.push(step.value.part);
  const tier = { face: 0, rim: 1, fallen: 2, strewn: 3 };
  assert.ok(parts.every((part, i) => i === 0 || tier[parts[i - 1]] <= tier[part]), parts.join(' '));
  assert.ok(new Set(parts).size >= 3, parts.join(' '));
});

test('each cluster is of the kind of rock where it is', () => {
  const named = { ...hills, rockAt: (x, z) => ({ bare: hills.rockAt(x, z).bare, kind: x < 0 ? 'granite' : 'sandstone' }) };
  const made = placeOn(named, { x0: -30, x1: 30, z0: -30, z1: 30 }, { seed: 1, shows: 0.8, size: 3 });
  const kinds = new Set();
  for (const thing of made.laid) {
    for (const rock of thing.rocks) {
      kinds.add(rock.kind);
      assert.equal(rock.kind, thing.at.x < 0 ? 'granite' : 'layered', `${thing.id} at ${thing.at.x}`);
    }
  }
  assert.equal(kinds.size, 2);
});
