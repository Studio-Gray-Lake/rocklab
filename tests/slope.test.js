import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLand } from '../src/land.js';
import { BED, middleShowing, undersideShowing } from '../src/bed.js';
import { makeCluster } from '../src/cluster.js';
import { EDGE, apronFor, makeEdge, slopeSays } from '../src/edge.js';

// The slope decides (src/edge.js `slope`): how steep the
// land is at a spot has its say in how much shows there and how the rock
// lies. Steep: as asked. Gentler: fewer rocks, deeper in the ground.
// Level: flat slabs. With it at nothing, everything is rock for rock what
// it was.

const rad = (degrees) => (degrees * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
// How far a rock's own "up" is from the ground's, in degrees.
const offGround = (rock, land) => deg(Math.acos(Math.min(1, Math.abs(UP.clone().applyQuaternion(rock.q).dot(land.normalAt(rock.at.x, rock.at.z))))));
const mean = (list) => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);
const floats = (made, land) => {
  made.rocks.forEach((rock, k) => {
    const before = made.rocks.slice(0, k);
    const showing = Math.max(undersideShowing(rock, land, BED.under, undefined, before), middleShowing(rock, land, undefined, before));
    assert.ok(showing <= BED.slack + 1e-6, `a ${rock.role} rock of spot "${rock.spot}" shows ${showing.toFixed(3)} m of underside`);
  });
};

// The test land, with its bank.
const edgeSettings = { seed: 1, size: 4, age: 0.15, slant: rad(35), turn: rad(20), shows: 0.6, fallen: 0.6, rim: 1, noise: 0 };
const test_ = createLand({ steep: 60, apron: apronFor(edgeSettings) });
const plain = makeEdge(test_, edgeSettings);
const sloped = makeEdge(test_, { ...edgeSettings, slope: 1 });


test('what the slope says: on a steep face, all that is asked and the grain asked for; on level ground, the least and lying flat', () => {
  const asked = { slant: rad(35), lean: 0, turn: rad(20) };
  const face = test_.placeOn(-5, 0.5);
  const top = test_.placeOn(-5, 1.6);
  const steep = slopeSays(test_, face, asked, 1);
  const level = slopeSays(test_, top, asked, 1);
  assert.ok(steep.steep > 55 && steep.shows === 1 && steep.flat === 0);
  assert.ok(Math.abs(deg(Math.acos(UP.clone().applyQuaternion(steep.grain).y)) - 35) < 1e-6, 'on the face the grain is not the one asked for');
  assert.ok(level.steep < EDGE.slope.shows[0] && level.shows === 0 && level.flat === 1);
  assert.ok(UP.clone().applyQuaternion(level.grain).distanceTo(test_.normalAt(top.x, top.z)) < 1e-6, 'on level ground the rock does not lie with the ground');
  // with less say, less of it; with none, none
  assert.ok(Math.abs(slopeSays(test_, top, asked, 0.4).flat - 0.4) < 1e-12);
  assert.equal(slopeSays(test_, top, asked, 0).flat, 0);
  // in between, in between: the gentler, the flatter and the less showing
  const hillside = [20, 30, 45].map((angle) => slopeSays(createLand({ steep: angle }), createLand({ steep: angle }).placeOn(-5, 0.5), asked, 1));
  assert.ok(hillside[0].flat > hillside[1].flat && hillside[1].flat > hillside[2].flat);
  assert.ok(hillside[0].shows < hillside[1].shows && hillside[1].shows < hillside[2].shows);
});

test('with the slope at nothing, the edge is rock for rock what it was', () => {
  assert.deepEqual(makeEdge(test_, { ...edgeSettings, slope: 0 }).list, plain.list);
});

test('a cluster told to lie flat: none of its rocks stands on end, and granite is thinner', () => {
  const flat = createLand({ steep: 0 });
  let onEnd = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const base = { x: 0, z: 9, seed, size: 2, pieces: 12, noise: 0, shows: 0.6 };
    const upright = makeCluster(flat, base);
    const lying = makeCluster(flat, { ...base, flat: 1 });
    onEnd += upright.rocks.filter((r) => UP.clone().applyQuaternion(r.q).y < 0.5).length;
    for (const rock of lying.rocks) assert.ok(UP.clone().applyQuaternion(rock.q).y > 1 - 1e-9, `seed ${seed}: a ${rock.role} rock stands on end`);
    assert.ok(mean(lying.rocks.map((r) => r.thick / r.length)) < mean(upright.rocks.map((r) => r.thick / r.length)));
  }
  assert.ok(onEnd > 0, 'no rock of an upright cluster stood on end to begin with');
});

test('on the test land the rim lies flat on the level top, and reaches further back over it', () => {
  const rim = (made) => made.rocks.filter((r) => r.part === 'rim');
  assert.ok(rim(plain).length > 8 && rim(sloped).length > 8);
  const [before, after] = [mean(rim(plain).map((r) => offGround(r, test_))), mean(rim(sloped).map((r) => offGround(r, test_)))];
  assert.ok(after < before - 10, `the rim's rocks are ${after.toFixed(0)}° off the ground with the slope's say, ${before.toFixed(0)}° without`);
  // how far behind the band's top the farthest of them is
  const behind = (made) => Math.max(...rim(made).map((r) => test_.foot(r.at.x) - test_.width(r.at.x) - r.at.z));
  assert.ok(behind(sloped) > behind(plain) + 1, `the rim reaches ${behind(sloped).toFixed(1)} m back with the slope's say, ${behind(plain).toFixed(1)} m without`);
});

test('the face itself, on steep ground, is nearly what it was; on the gentler ground at its foot and top there is less', () => {
  const steepness = (r) => test_.slopeAt(r.at.x, r.at.z);
  const face = (made) => made.rocks.filter((r) => !r.part);
  const onSteep = (made) => face(made).filter((r) => steepness(r) >= 50).length;
  const onGentle = (made) => face(made).filter((r) => steepness(r) < 35).length;
  assert.ok(Math.abs(onSteep(sloped) - onSteep(plain)) <= 0.2 * onSteep(plain), `${onSteep(sloped)} rocks on the steep face with the slope's say, ${onSteep(plain)} without`);
  assert.ok(onGentle(sloped) < onGentle(plain), `${onGentle(sloped)} rocks of the face on gentle ground with the slope's say, ${onGentle(plain)} without`);
});

test("with the slope's say, nothing floats on the test land", () => {
  floats(sloped, test_);
});
