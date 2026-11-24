import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLand } from '../src/land.js';
import { BED, middleShowing, undersideShowing } from '../src/bed.js';
import { rockFrom } from '../src/cluster.js';
import { EDGE, makeEdge, showsAt, spotsOf } from '../src/edge.js';

// The edge (src/edge.js): clusters along the steep band, and one slider
// from stones to outcrops to a cliff. More showing only brings more spots
// in; nothing floats, against the land and every rock already there; and
// the edge is a list of whole rocks that makes the same edge again.

const rad = (degrees) => (degrees * Math.PI) / 180;
const land = createLand({ steep: 60 });
const settings = { seed: 1, size: 4, age: 0.15, slant: rad(35), turn: rad(20) };
const SHOWS = [0.15, 0.5, 1];
const edges = SHOWS.map((shows) => makeEdge(land, { ...settings, shows }));

test('how much shows is whole in the middle of the edge and falls away to nothing at both ends', () => {
  assert.equal(showsAt(land, EDGE.from, 1), 0);
  assert.ok(showsAt(land, EDGE.to, 1) < 0.01);
  assert.equal(showsAt(land, -5, 0.8), 0.8);
  let last = 0;
  for (let x = EDGE.from; x <= EDGE.from + EDGE.taper; x += 0.5) {
    assert.ok(showsAt(land, x, 1) >= last, `falls at ${x}`);
    last = showsAt(land, x, 1);
  }
});

test('the spots are drawn once, from the seed: three ranks, each with its own number', () => {
  const spots = spotsOf(1);
  assert.deepEqual(spotsOf(1), spots);
  assert.notDeepEqual(spotsOf(2), spots);
  assert.equal(spots.filter((s) => s.rank === 'big').length, EDGE.spots);
  for (const rank of ['big', 'mid', 'small']) assert.ok(spots.some((s) => s.rank === rank), rank);
  for (const s of spots) {
    assert.ok(s.x > EDGE.from && s.x < EDGE.to, `${s.id} is off the edge`);
    assert.ok(s.comes > 0 && s.comes < 1, `${s.id} comes in at ${s.comes}`);
  }
});

test('more showing only brings more spots in, and more rock', () => {
  for (let i = 1; i < edges.length; i++) {
    const before = new Set(edges[i - 1].spots.ids);
    const now = new Set(edges[i].spots.ids);
    for (const id of before) assert.ok(now.has(id), `spot "${id}" is in at ${SHOWS[i - 1]} and gone at ${SHOWS[i]}`);
    assert.ok(now.size > before.size);
    assert.ok(edges[i].rocks.length > edges[i - 1].rocks.length, `${edges[i].rocks.length} rocks at ${SHOWS[i]}, ${edges[i - 1].rocks.length} at ${SHOWS[i - 1]}`);
  }
});

test('low, it is a few stones; high, big rock from foot to top', () => {
  const [low, , high] = edges;
  assert.ok(low.rocks.length > 0 && low.rocks.length <= 20, `${low.rocks.length} rocks at ${SHOWS[0]}`);
  assert.ok(Math.max(...low.rocks.map((r) => r.size)) < 0.5 * settings.size, 'a big rock among the first stones');
  assert.ok(high.rocks.length >= 100, `${high.rocks.length} rocks at 1`);
  const ups = high.clusters.map((c) => c.spot.up);
  assert.ok(Math.min(...ups) < 0.1 && Math.max(...ups) > 0.85, 'the rock does not reach from the foot to the top');
});

test('nothing floats along the whole edge, against the land and every rock already there', () => {
  for (const [i, made] of edges.entries()) {
    made.rocks.forEach((rock, k) => {
      const before = made.rocks.slice(0, k);
      const showing = Math.max(undersideShowing(rock, land, BED.under, undefined, before), middleShowing(rock, land, undefined, before));
      assert.ok(showing <= BED.slack + 1e-6, `at ${SHOWS[i]}: a ${rock.role} rock of spot "${rock.spot}" shows ${showing.toFixed(3)} m of underside`);
    });
  }
});

test('nothing shows as a sliver, and every rock belongs to a spot', () => {
  for (const made of edges) {
    for (const rock of made.rocks) {
      assert.ok(rock.exposed >= BED.exposed, `only ${(100 * rock.exposed).toFixed(0)}% of a ${rock.role} rock is clear`);
      assert.ok(made.spots.ids.includes(rock.spot));
    }
  }
});

test('the same seed and settings give the same edge', () => {
  assert.deepEqual(makeEdge(land, { ...settings, shows: SHOWS[1] }).list, edges[1].list);
});

test('an edge is a list of whole rocks: each entry makes the same rock again', () => {
  const made = edges[2];
  assert.equal(made.list.length, made.rocks.length);
  for (let i = 0; i < made.list.length; i += 9) assert.deepEqual(rockFrom(made.list[i]).positions, made.rocks[i].positions, `entry ${i} makes another rock`);
});
