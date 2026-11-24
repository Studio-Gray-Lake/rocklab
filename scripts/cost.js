// What a square of land costs: the land of hills at its starting settings
// (80 m across, as the page opens it), its rock laid by place, handed over
// and read for the walk. tests/cost.test.js holds the counts as recorded,
// so a change that makes a square dearer shows; run this file to print
// them afresh, with how long each stage takes on this machine:
//   node --import ./tests/hooks.js scripts/cost.js

import { STARTS, defaultSettings } from '../src/settings.js';
import { cliffsOf, madeOn } from '../src/make.js';
import { placeOn } from '../src/place.js';
import { rockOutput } from '../src/output.js';
import { groupsOf } from '../src/walk.js';

// The square, made: what it costs to keep (counts) and to make (ms).
export function squareCost() {
  const s = { ...defaultSettings(), size: STARTS.land.size };
  const { land } = madeOn('land', s);
  const ms = {};
  const time = (name, work) => {
    const began = performance.now();
    const result = work();
    ms[name] = Math.round(performance.now() - began);
    return result;
  };
  const made = time('lay', () => placeOn(land, land.size, cliffsOf(s)));
  // (Handed over as the page draws it: one tone for the land's rock.)
  const out = time('hand over', () => rockOutput(made.rocks, land.heightAt, { tone: { seed: s.seed, size: s.size } }));
  const groups = time('walk', () => groupsOf(made.laid, land.heightAt));
  const triangles = out.reduce((sum, o) => sum + o.triangles, 0);
  const corners = out.reduce((sum, o) => sum + o.corners.length / 3, 0);
  const bytes = out.reduce((sum, o) => sum + o.positions.byteLength + o.normals.byteLength + o.colors.byteLength + o.corners.byteLength, 0);
  const ground = groups.filter((g) => g.ground).length;
  return {
    counts: { rocks: made.rocks.length, triangles, corners, bytes, groups: groups.length, ground, wall: groups.length - ground },
    ms,
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}`) {
  const runs = [squareCost(), squareCost(), squareCost()];
  const middle = (name) => runs.map((r) => r.ms[name]).sort((a, b) => a - b)[1];
  console.log(JSON.stringify({ counts: runs[0].counts, ms: Object.fromEntries(Object.keys(runs[0].ms).map((k) => [k, middle(k)])) }, null, 2));
}
