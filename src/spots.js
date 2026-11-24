import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { EDGE, spotDraws } from './edge.js';
import { LAND_ROCK } from './landRock.js';
import { feetOf } from './feet.js';
import { LAND_IN, landIn } from './landIn.js';

// The spots for clusters along the feet of the land's steep ground, drawn
// by place. The world is cut into cells, fixed to it; each cell draws its
// own spots from its own numbers, seeded by where it is, along the feet
// that cross it. So a cell's spots are the same whichever rectangle of
// land asks, and in whatever order.
//
// - How many: as along an edge (edge.js), so many big clusters to every
//   so many metres of foot, and middling and small ones for each big one.
//   A cell with more foot in it has more spots.
// - Each spot's rank, place up the rise and when it comes in, as along an
//   edge (edge.js spotDraws), from its own numbers.
// - Where the rock falls away: where the rise above the foot gets low,
//   or not steep, or its rock less bare. There each spot shows less (fall)
//   and its rocks are smaller (grade). This is where a cliff ends, read
//   at the place itself, not from how far its stretch's end is.
// - Where no cliff would stand (feet.js), a spot is pale: its rock is
//   laid only with the slope's say, as along a band's pale lengths.
// - Each spot takes the kind of rock where it is.
// - A cluster belongs to the square of land its spot is in.

const { clamp, lerp, smoothstep } = THREE.MathUtils;

export const SPOTS = {
  cell: 8,            // m: the cells spots are drawn by, fixed to the world (ten to a square)
  square: 80,         // m: a cluster belongs to the square of land its spot is in
  full: 6,            // m: over a rise this tall the rocks are the full size asked; lower, smaller
  // Where the rock falls away: from none of it at the first to all at the second.
  rise: [0.75, 2.5],  // m: the rise above the foot
  steepest: [30, 40], // degrees: the steepest it gets
  bare: [0.25, 0.75], // how bare its rock gets
};
const RANKS = [['big', 1], ['mid', EDGE.mids], ['small', EDGE.smalls]];

// A cell's own seed, from the settings' seed and where it is.
const cellSeed = (seed, cx, cz) => (Math.imul((seed | 0) + 0x632be5ab, 0x9e3779b1) ^ Math.imul(cx, 0x85ebca6b) ^ Math.imul(cz, 0xc2b2ae35)) >>> 0;

// How much of the rock is left above a foot, 0 to 1.
export function fallOf({ reading, bare }) {
  return smoothstep(reading.rise, SPOTS.rise[0], SPOTS.rise[1])
    * smoothstep(reading.steepest, SPOTS.steepest[0], SPOTS.steepest[1])
    * smoothstep(bare, SPOTS.bare[0], SPOTS.bare[1]);
}

// How big the rocks above a foot are, as a share of the size asked: by
// how tall its rise is. pale: where no cliff stands.
export const gradeOf = (reading, pale = false) => clamp(reading.rise / SPOTS.full, pale ? LAND_ROCK.palest : LAND_ROCK.smallest, 1);

// The spots whose places lie in a rectangle { x0, x1, z0, z1 } (m).
// land: as handed over, or read (landIn). settings: seed; spots (big
// clusters to every 41 m of foot, the test edge's length) and uneven, as
// the edge's; kind, where the land doesn't say.
//
// Each spot: { id, rank, cell, foot, up, at, comes, r, fall, grade, pale,
// kind, facing, square, reading }. id: its rank, its cell and its number
// there; foot: [x, z], where along the foot it is; up: how far up the
// rise (0 the foot, 1 the top; below 0, out before it); at: { x, z }, its
// place; comes: the number "how much shows" must pass for it to be in;
// r: its own numbers; fall: how much of the rock is left there (0 to 1);
// grade: how big its rocks are, as a share of the size asked; pale: no
// cliff stands there; facing: how far round its rise is turned from the
// test land's band (which faces +z); square: [i, j], the square of land
// it belongs to; reading: the foot's (landIn at).
export function spotsOn(land, { x0, x1, z0, z1 }, settings = {}) {
  const read = typeof land?.at === 'function' ? land : landIn(land, { kind: settings.kind });
  const { cell } = SPOTS;
  // Every cell whose feet could put a spot in the rectangle: a spot is no
  // further from its foot than a rise is wide.
  const reach = LAND_IN.widest;
  const found = [];
  for (let cz = Math.floor((z0 - reach) / cell); cz <= Math.floor((z1 + reach) / cell); cz++) {
    for (let cx = Math.floor((x0 - reach) / cell); cx <= Math.floor((x1 + reach) / cell); cx++) {
      for (const spot of cellSpots(read, cx, cz, settings).face) {
        if (spot.at.x >= x0 && spot.at.x < x1 && spot.at.z >= z0 && spot.at.z < z1) found.push(spot);
      }
    }
  }
  return found;
}

// Where along a cell's feet a spot s m along them is: the foot piece, and
// the point. feet: the cell's, each { piece, fall, from, length }.
function alongFeet(feet, s) {
  const own = feet.find((f) => s < f.from + f.length) ?? feet.at(-1);
  const t = clamp((s - own.from) / own.length, 0, 1);
  const { piece } = own;
  return { own, foot: [lerp(piece.from[0], piece.to[0], t), lerp(piece.from[1], piece.to[1], t)] };
}

// A place so far up a foot's rise (0 the foot, 1 the top; below 0 out
// before it, above 1 back past the top), as along an edge's band.
export function upFrom(foot, reading, up) {
  const wide = Math.max(reading.wide, 0.5);
  const d = up < 0 ? up * LAND_ROCK.beyond : up > 1 ? wide + (up - 1) * LAND_ROCK.beyond : up * wide;
  return { x: foot[0] + reading.up[0] * d, z: foot[1] + reading.up[1] * d };
}

// One cell's own draws, wherever its spots lie: the clusters' spots (face,
// as spotsOn gives them); then, along the same feet and from the same
// numbers, the places for the rim (rim) and for fallen rock (fallen):
// each { id, foot, r, fall, pale, reading }, so many to every 41 m of
// foot as along an edge at plenty (edge.js EDGE.lip.most, EDGE.talus.most).
// Also length: how much foot the cell has.
export function cellSpots(read, cx, cz, { seed = 1, spots = EDGE.spots, uneven = EDGE.uneven } = {}) {
  const { cell } = SPOTS;
  const { pieces } = feetOf(read, { x0: cx * cell, x1: (cx + 1) * cell, z0: cz * cell, z1: (cz + 1) * cell }, { margin: 0 });
  const feet = [];
  let length = 0;
  for (const piece of pieces) {
    const fall = fallOf(piece);
    if (!(fall > 0)) continue;
    const long = Math.hypot(piece.to[0] - piece.from[0], piece.to[1] - piece.from[1]);
    feet.push({ piece, fall, from: length, length: long });
    length += long;
  }
  const face = [];
  const rim = [];
  const fallen = [];
  if (!feet.length) return { face, rim, fallen, length };

  const random = mulberry32(cellSeed(seed, cx, cz));
  const metre = 1 / (EDGE.to - EDGE.from); // so many to the test edge's length, to the metre
  const each = clamp(spots, 0, Infinity) * metre;
  for (const [rank, share] of RANKS) {
    const count = Math.floor(length * each * share + random());
    for (let k = 0; k < count; k++) {
      const r = Array.from({ length: 8 }, () => random());
      const { own, foot } = alongFeet(feet, ((k + 0.5 + (r[0] - 0.5) * clamp(uneven, 0, 1)) / count) * length);
      const { up, comes } = spotDraws(rank, r);
      const { piece, fall } = own;
      const { reading } = piece;
      const at = upFrom(foot, reading, up);
      const pale = !piece.stands;
      face.push({
        id: `${rank} ${cx},${cz} ${k}`, rank, cell: [cx, cz], foot, up, at, comes, r, fall,
        grade: gradeOf(reading, pale),
        pale, kind: read.rockAt(at.x, at.z).kind,
        facing: Math.atan2(-reading.up[0], -reading.up[1]),
        square: [Math.floor(at.x / SPOTS.square), Math.floor(at.z / SPOTS.square)],
        reading,
      });
    }
  }
  for (const [part, most, draws, list] of [['rim', EDGE.lip.most, 6, rim], ['fallen', EDGE.talus.most, 9, fallen]]) {
    const count = Math.floor(length * most * metre + random());
    for (let k = 0; k < count; k++) {
      const r = Array.from({ length: draws }, () => random());
      const { own, foot } = alongFeet(feet, ((k + r[0]) / count) * length);
      list.push({ id: `${part} ${cx},${cz} ${k}`, cell: [cx, cz], foot, r, fall: own.fall, pale: !own.piece.stands, reading: own.piece.reading });
    }
  }
  return { face, rim, fallen, length };
}
