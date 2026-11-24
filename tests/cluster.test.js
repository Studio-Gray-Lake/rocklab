import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLand } from '../src/land.js';
import { inside } from '../src/granite.js';
import { BED, middleShowing, undersideShowing } from '../src/bed.js';
import { CLUSTER, makeCluster, rockFrom } from '../src/cluster.js';

// The cluster (src/cluster.js): whole rocks pushed into each other and the
// land. Nothing floats, nothing shows as a sliver, the rocks that stand
// against the others really cross one, and the cluster is a list of whole
// rocks that makes the same cluster again.

const rad = (degrees) => (degrees * Math.PI) / 180;
const SEEDS = [1, 2, 3, 4, 5, 6];
const STEEPS = [0, 60];
const AGES = [0, 1];
const NOISES = [0, CLUSTER.noise, 1];

const clusters = [];
for (const steep of STEEPS) {
  const land = createLand({ steep });
  const at = land.placeOn(-8, 0.45);
  for (const seed of SEEDS) for (const age of AGES) for (const noise of NOISES) {
    const settings = { x: at.x, z: at.z, seed, size: 1.5, age, noise, pieces: 12, slant: rad(35), turn: rad(20), shows: 0.8 };
    clusters.push({ about: `steep ${steep}°, seed ${seed}, age ${age}, noise ${noise}`, land, settings, cluster: makeCluster(land, settings) });
  }
}

test('a cluster has its big rock, and others with it', () => {
  for (const { about, cluster } of clusters) {
    assert.ok(cluster.rocks.length >= 4, `${about}: only ${cluster.rocks.length} rocks`);
    assert.equal(cluster.rocks[0].role, 'big', about);
    for (const r of cluster.rocks) assert.ok(r.size <= cluster.rocks[0].size + 1e-9, `${about}: a ${r.role} rock is bigger than the big one`);
  }
});

test('nothing floats: no underside shows, against the land and the rocks already there', () => {
  for (const { about, land, cluster } of clusters) {
    cluster.rocks.forEach((rock, i) => {
      const before = cluster.rocks.slice(0, i);
      const showing = Math.max(undersideShowing(rock, land, BED.under, undefined, before), middleShowing(rock, land, undefined, before));
      assert.ok(showing <= BED.slack + 1e-6, `${about}: the ${rock.role} rock (piece ${rock.piece}) shows ${showing.toFixed(3)} m of underside`);
    });
  }
});

test('nothing shows as a sliver, and no rock lies wholly inside another', () => {
  for (const { about, land, cluster } of clusters) {
    for (const rock of cluster.rocks) {
      assert.ok(rock.exposed >= BED.exposed, `${about}: only ${(100 * rock.exposed).toFixed(0)}% of the ${rock.role} rock is clear`);
      for (const other of cluster.rocks) {
        if (other === rock) continue;
        assert.ok(rock.corners.some((p) => !inside(other, p.x, p.y, p.z)), `${about}: the ${rock.role} rock lies wholly inside the ${other.role} rock`);
      }
      assert.ok(rock.corners.some((p) => p.y > land.heightAt(p.x, p.z)), `${about}: the ${rock.role} rock lies wholly under the land`);
    }
  }
});

test('a rock standing against the others really crosses one', () => {
  for (const { about, cluster } of clusters) {
    for (const rock of cluster.rocks) {
      if (rock.role === 'big' || rock.role === 'foot') continue;
      assert.ok(rock.held - rock.buried >= CLUSTER.touch - 1e-9, `${about}: the ${rock.role} rock (piece ${rock.piece}) has ${(100 * (rock.held - rock.buried)).toFixed(0)}% of itself in a neighbour`);
    }
  }
});

test('a cluster is a list of whole rocks: each entry makes the same rock again', () => {
  for (const { about, cluster } of clusters.filter((_, i) => i % 5 === 0)) {
    assert.equal(cluster.list.length, cluster.rocks.length);
    cluster.list.forEach((entry, i) => {
      for (const key of ['kind', 'seed', 'size', 'age', 'thick', 'at', 'turn']) assert.ok(entry[key] !== undefined, `${about}: an entry has no ${key}`);
      assert.deepEqual(rockFrom(entry).positions, cluster.rocks[i].positions, `${about}: entry ${i} makes another rock`);
    });
  }
});

test('the same seed and settings give the same cluster, and another seed another', () => {
  const { land, settings, cluster } = clusters[4];
  assert.deepEqual(makeCluster(land, settings).list, cluster.list);
  assert.notDeepEqual(makeCluster(land, { ...settings, seed: settings.seed + 50 }).list, cluster.list);
});

test('fewer pieces leaves the ones that stay where they were', () => {
  for (const { about, land, settings, cluster } of clusters.filter((_, i) => i % 7 === 0)) {
    const fewer = makeCluster(land, { ...settings, pieces: 5 });
    for (const rock of fewer.rocks) {
      const same = cluster.rocks.find((r) => r.piece === rock.piece);
      assert.ok(same, `${about}: piece ${rock.piece} is only there with fewer pieces`);
      assert.deepEqual(rock.positions, same.positions, `${about}: piece ${rock.piece} moved`);
    }
  }
});

test('age wears the rocks without turning them', () => {
  for (const { about, land, settings, cluster } of clusters.filter((c) => c.settings.age === 0).filter((_, i) => i % 4 === 0)) {
    const older = makeCluster(land, { ...settings, age: 0.6 });
    for (const rock of older.rocks) {
      const young = cluster.rocks.find((r) => r.piece === rock.piece);
      if (!young) continue;
      assert.deepEqual(rock.q.toArray(), young.q.toArray(), `${about}: piece ${rock.piece} turned with age`);
      assert.equal(rock.size, young.size, `${about}: piece ${rock.piece} changed size with age`);
    }
  }
});

test('with one piece a cluster is one rock', () => {
  const land = createLand({ steep: 60 });
  const at = land.placeOn(-8, 0.45);
  const one = makeCluster(land, { x: at.x, z: at.z, seed: 1, size: 1.5, pieces: 1, shows: 0.8 });
  assert.equal(one.rocks.length, 1);
  assert.equal(one.rocks[0].role, 'big');
});
