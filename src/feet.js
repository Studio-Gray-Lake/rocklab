import * as THREE from 'three';
import { LAND_IN, landIn } from './landIn.js';

// The feet of the land's steep ground, traced on a grid fixed to the
// world. A foot is where the ground, coming up from gentler land, gets as
// steep as a rise is walked up (landIn.js LAND_IN.ease), with the steeper
// ground uphill of it (where it is downhill, that is a top). The grid's
// corners lie at whole multiples of its step, so every square of it is
// traced the same whichever rectangle asks: the line in a square depends
// on that square's own corners and nothing else. A rectangle is traced
// with a margin round it, as wide as a rise can be, so what lies just
// inside its edge is read as fully as what lies in its middle.
//
// Each piece of a foot (its line across one square of the grid) is read
// on the foot at its middle, as landIn's at() reads a point, and says whether a cliff
// would stand there: the rise above it steep enough, tall enough and its
// rock bare enough somewhere up it.

const { clamp, radToDeg } = THREE.MathUtils;

export const FEET = {
  step: 1,        // m: the grid's step; its corners lie at whole multiples of it
  margin: LAND_IN.widest, // m: how far past the rectangle it is traced
  halve: 7,       // a crossing is halved in on its side this many times (to within a centimetre)
  // Where a cliff would stand:
  cliff: 35,      // degrees: the rise above is at least this steep somewhere,
  lowest: 1.5,    // m: at least this tall,
  bare: 0.5,      // and its rock, somewhere up it, at least this bare
  every: 1,       // m: how often the rock is read on the way up
};

// The feet over a rectangle { x0, x1, z0, z1 } (m). land: a land as
// handed over, or one already read (landIn). Gives:
// - pieces: one to every square a foot crosses, in the order of the
//   squares (by z, then x): { square: [i, j], from, to, middle, reading,
//   bare, stands }. square: the square's world grid place (its lower corner
//   over the step); from, to: [x, z], the way along it with uphill on the
//   left; middle: [x, z], where it is read: on the foot, at the piece's
//   middle; reading: at(middle); bare: how bare the rock gets up the
//   rise above it, at the barest.
// - runs: the pieces joined end to end, { points, stands, ring }, as
//   bandsOf gives its runs. Only the squares within the rectangle are
//   anyone's to keep: a run is cut where the margin ends.
export function feetOf(land, { x0, x1, z0, z1 }, { step = FEET.step, margin = FEET.margin } = {}) {
  const read = typeof land?.at === 'function' ? land : landIn(land);
  const { ease } = LAND_IN;
  const normal = new THREE.Vector3();
  const steepAt = (x, z) => radToDeg(Math.acos(clamp(read.normalAt(x, z, normal).y, -1, 1)));

  const [i0, i1] = [Math.floor((x0 - margin) / step), Math.ceil((x1 + margin) / step)];
  const [j0, j1] = [Math.floor((z0 - margin) / step), Math.ceil((z1 + margin) / step)];
  const wide = i1 - i0 + 1;
  const field = new Float64Array(wide * (j1 - j0 + 1));
  const at = (i, j) => (j - j0) * wide + (i - i0);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) field[at(i, j)] = steepAt(i * step, j * step) - ease;

  // Where the foot crosses a side of a square: the side named by its lower
  // corner and its way (0 along x, 1 along z), so the squares either side
  // of it agree.
  const sides = new Map();
  const crossing = (i, j, way) => {
    const [a, b] = [field[at(i, j)], way ? field[at(i, j + 1)] : field[at(i + 1, j)]];
    if ((a < 0) === (b < 0)) return null;
    const key = `${i},${j},${way}`;
    if (!sides.has(key)) {
      const spot = (t) => [(i + (way ? 0 : t)) * step, (j + (way ? t : 0)) * step];
      let [from, to] = [0, 1];
      for (let n = 0; n < FEET.halve; n++) {
        const mid = (from + to) / 2;
        if ((steepAt(...spot(mid)) - ease < 0) === (a < 0)) from = mid;
        else to = mid;
      }
      sides.set(key, spot((from + to) / 2));
    }
    return key;
  };

  const pieces = [];
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const cuts = [crossing(i, j, 0), crossing(i + 1, j, 1), crossing(i, j + 1, 0), crossing(i, j, 1)].filter((key) => key !== null);
      for (let c = 0; c + 1 < cuts.length; c += 2) {
        let [ka, kb] = [cuts[c], cuts[c + 1]];
        let [a, b] = [sides.get(ka), sides.get(kb)];
        let middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let reading = read.at(...middle);
        const [ux, uz] = reading.up;
        if (ux === 0 && uz === 0) continue;
        // (Where a foot bends sharply within a square, the straight piece's
        // middle may lie off it, on the face or the meadow: it is read on
        // the foot itself, found along the way up.)
        const onFoot = footAlong(steepAt, middle, reading.up, step);
        if (onFoot) [middle, reading] = [onFoot, read.at(...onFoot)];
        // A foot, not a top: the square's steep corners lie uphill of it.
        let [sx, sz] = [0, 0];
        for (const [ci, cj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
          if (field[at(ci, cj)] >= 0) [sx, sz] = [sx + ci * step - middle[0], sz + cj * step - middle[1]];
        }
        if (!(sx * ux + sz * uz > 0)) continue;
        // Uphill on the left of the way along it.
        if ((b[0] - a[0]) * uz - (b[1] - a[1]) * ux < 0) [a, b, ka, kb] = [b, a, kb, ka];
        const bare = bareAbove(read, middle, reading);
        pieces.push({ square: [i, j], from: a, to: b, middle, reading, bare, stands: standsAt(reading, bare), ends: [ka, kb] });
      }
    }
  }

  // The pieces joined end to end, two to every side they share (whichever
  // way each runs: where a foot turns round a band's end, uphill turns
  // with it). First the runs with an end, then the rings.
  const bySide = new Map();
  pieces.forEach((piece, n) => piece.ends.forEach((key) => bySide.set(key, [...(bySide.get(key) ?? []), n])));
  const used = new Set();
  const runs = [];
  const walk = (first, key) => {
    const points = [sides.get(key)];
    const stands = [];
    for (let n = first; n !== undefined && !used.has(n);) {
      used.add(n);
      key = pieces[n].ends[0] === key ? pieces[n].ends[1] : pieces[n].ends[0];
      points.push(sides.get(key));
      stands.push(pieces[n].stands);
      n = bySide.get(key).find((m) => !used.has(m));
    }
    return { points, stands };
  };
  pieces.forEach((piece, n) => {
    const open = piece.ends.find((key) => bySide.get(key).length === 1);
    if (!used.has(n) && open !== undefined) runs.push({ ...walk(n, open), ring: false });
  });
  pieces.forEach((piece, n) => { if (!used.has(n)) runs.push({ ...walk(n, piece.ends[0]), ring: true }); });
  for (const piece of pieces) delete piece.ends;
  return { pieces, runs };
}

// The foot near a point, along the way up from it: within a step either
// way, where the ground gets as steep as a rise. Nothing if the point is
// on it already (within the halving), or no foot is there.
function footAlong(steepAt, [x, z], [ux, uz], step) {
  const above = (t) => steepAt(x + ux * t, z + uz * t) >= LAND_IN.ease;
  let [from, to] = above(0) ? [-step, 0] : [0, step];
  if (above(from) || !above(to)) return null;
  for (let n = 0; n < FEET.halve; n++) {
    const mid = (from + to) / 2;
    if (above(mid)) to = mid;
    else from = mid;
  }
  const t = (from + to) / 2;
  return Math.abs(t) > step / 2 ** FEET.halve ? [x + ux * t, z + uz * t] : null;
}

// How bare the rock above a foot gets, at the barest, up its rise (a
// band may be only the lower part of a tall rise). At the foot itself,
// where there is no rise.
function bareAbove(read, [x, z], { up, wide }) {
  let most = read.rockAt(x, z).bare;
  for (let d = FEET.every / 2; d < wide; d += FEET.every) most = Math.max(most, read.rockAt(x + up[0] * d, z + up[1] * d).bare);
  return most;
}

// Whether a cliff would stand above a foot: the rise steep and tall
// enough, and its rock bare enough somewhere up it.
const standsAt = ({ steepest, rise }, bare) => steepest >= FEET.cliff && rise >= FEET.lowest && bare >= FEET.bare;
