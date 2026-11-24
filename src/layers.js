import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { orientation } from './granite.js';
import { LAYERED, shapeLayered } from './layered.js';
import { BED, seatRock } from './bed.js';
import { entryOf } from './cluster.js';
import { COURSES } from './courses.js';
import { EDGE, showsAt, strewFallen } from './edge.js';

// Layered rock's cliff. Granite's cliff is clusters set along the slope, each
// its own heap. Layered rock can't be done that way: if each stack had its
// own beds, the layers would stop dead between one stack and the next. A
// cliff of layered rock is the same few beds running the whole length of
// the face.
//
// - The beds come first. One above another, each a flat sheet in space
//   with its own thickness: every slab of a bed has its top in one plane
//   and its bottom in another, wherever along the cliff it is. They all
//   lie on the grain: level when there's no slant; tilted, they climb
//   across the face, each starting at the foot and running out at the top.
// - Hard beds and soft beds. A hard bed is laid with slabs and stands out
//   of the slope as a ledge. A soft bed is thin and has none: it lies back,
//   and the bare ground shows there. That is what makes a face of steps,
//   not a wall of bricks.
// - Slabs along each bed, side by side, following the foot's curve, each
//   with its front a little proud of the slope, some more and some less.
//   Thick beds break into long slabs, thin ones into short. Each bed
//   starts at a place of its own, so cracks don't line up from one bed to
//   the next. Here and there a slab is missing and the ledge is broken.
// - How much shows, as for granite: the thickest beds come in first, the
//   highest places last; it falls away toward each end; and the noise
//   (patchiness, patch size) makes ledges come and go along the cliff.
// - Every slab rests, by the stack's rule (courses.js): most of its
//   underside on the land or the slabs under it, and its middle over one.
// - Fallen slabs lie on the bank at the foot, as granite's blocks do.
//
// Steady: a bed is known by its number, counted up and down from the one
// at the foot in the middle of the cliff, and its thickness and its slabs
// are drawn from that number. So tilting the beds, or showing more, never
// reshuffles them.
//
// What comes out is a list of whole rocks.

const { clamp, lerp } = THREE.MathUtils;
const Y = new THREE.Vector3(0, 1, 0);

export const LAYERS = {
  soft: 0.3,            // the chance a bed is soft: thin, with no slabs
  softThick: 0.4,       // a soft bed's thickness, as a share of a hard one's
  comes: [0.12, 0.72],  // when a hard bed comes in, as "how much shows" rises: the thickest first
  fray: 0.2,            // how far a slab's own number strays from its bed's: ledges fray at their ends
  proud: [0.12, 0.34],  // how far a slab's front stands out of the slope, as a share of its width: little shows, lots shows
  uneven: [0.55, 1.45], // ...times this, slab by slab: a ledge's front isn't a ruled line
  gaps: 0.07,           // the share of a bed's slabs that are never there: a ledge is broken here and there
  mostBeds: 80,         // beds counted, up and down from the middle one, at most
  near: 2.2,            // slabs within this many of a slab's lengths are its neighbours
};

// A bed's own numbers, from its number: how thick, hard or soft, when it
// comes in, and where along the cliff its first slab starts.
function bedOf(seed, k) {
  const random = mulberry32(((seed | 0) * 4099 + k * 7919 + 13) | 0);
  const thick = random();
  const hard = random() >= LAYERS.soft;
  return { k, thick, hard, comes: random(), start: random(), random };
}

// The cliff on this land. Its settings: seed; shows (the one slider); size
// (m: its longest slabs' length), age, thick (the bed thickness asked, as
// a share of size), slant, lean, turn (radians: its grain), cross (how far
// slabs side by side cross), noise (how far a slab strays off its bed),
// least (bed.js's), fallen (how much fallen rock), and patchy and patch
// (the noise along the edge: edge.js's).
//
// Gives { rocks, beds, left, list }: every rock in place; how many beds
// have slabs showing; how many slabs were not kept; and the list of whole
// rocks it is. Also face and loose: how many are the face's and how many
// fallen.
export function makeLayers(land, {
  seed = 1, shows = 0.6, size = 2.4, age = 0, thick = LAYERED.bed, slant = 0, lean = 0, turn = 0, cross = 0.35,
  noise = 0, least = BED.least, under = BED.under, fallen = 0, patchy = EDGE.patchy, patch = EDGE.patch,
} = {}) {
  const grain = orientation(slant, lean, turn);
  const up = Y.clone().applyQuaternion(grain);
  const sound = { seed, patchy, patch };
  const middle = (EDGE.from + EDGE.to) / 2;
  const want = 1 - (1 - clamp(least, 0, 1)) * clamp(shows, 0, 1);

  // How high the beds' frame reaches over the face, from the foot at the
  // middle of the cliff: the least and the most any place on the face is.
  const origin = land.placeOn(middle, 0);
  const base = up.x * origin.x + up.y * origin.y + up.z * origin.z;
  const level = (p) => up.x * p.x + up.y * p.y + up.z * p.z - base;
  let lowest = Infinity, highest = -Infinity;
  for (let x = EDGE.from; x <= EDGE.to; x += 1) {
    for (const t of [0, 1]) {
      const h = level(land.placeOn(x, t));
      lowest = Math.min(lowest, h);
      highest = Math.max(highest, h);
    }
  }

  // The beds, counted up and down from the one whose bottom is at the
  // foot in the middle: each with where its bottom is.
  // (A hard bed is never thinner than a slab as long as `size` may be: so
  // every slab of it is exactly its thickness.)
  const thickness = (bed) => (bed.hard
    ? Math.max(size * thick * lerp(COURSES.bed[0], COURSES.bed[1], bed.thick), (LAYERED.thin + 0.02) * size)
    : size * thick * lerp(COURSES.bed[0], COURSES.bed[1], bed.thick) * LAYERS.softThick);
  const beds = [];
  let at = 0;
  for (let k = 0; k < LAYERS.mostBeds && at < highest; k++) {
    const bed = bedOf(seed, k);
    beds.push({ ...bed, bottom: at, deep: thickness(bed) });
    at += thickness(bed);
  }
  at = 0;
  for (let k = -1; k > -LAYERS.mostBeds && at > lowest; k--) {
    const bed = bedOf(seed, k);
    at -= thickness(bed);
    beds.unshift({ ...bed, bottom: at, deep: thickness(bed) });
  }

  // Where, up the band at x, a bed's bottom meets the land's surface: 0
  // the foot, 1 the top; null where it doesn't (under the foot there, or
  // over the top).
  const meets = (x, bottom) => {
    let [low, high] = [0, 1];
    if (level(land.placeOn(x, low)) > bottom || level(land.placeOn(x, high)) < bottom) return null;
    for (let i = 0; i < 22; i++) {
      const mid = (low + high) / 2;
      if (level(land.placeOn(x, mid)) < bottom) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  };

  // The beds from the bottom up, each laid with its slabs along the cliff.
  const rocks = [];
  let left = 0;
  const showing = new Set();
  for (const bed of beds) {
    if (!bed.hard) continue;
    // (The thicker the bed, the sooner it comes in.)
    const comes = lerp(LAYERS.comes[1], LAYERS.comes[0], bed.thick) + (bed.comes - 0.5) * 0.1;
    let cursor = EDGE.from - bed.start * size;
    for (let j = 0; cursor < EDGE.to && j < 200; j++) {
      const r = Array.from({ length: 10 }, () => bed.random());
      const long = Math.min(size, bed.deep * lerp(COURSES.long[0], COURSES.long[1], r[0]));
      const x = cursor + long / 2;
      cursor += long * (1 - COURSES.lap * cross);
      if (x < EDGE.from || x > EDGE.to) continue;
      const here = showsAt(land, x, shows, sound);
      const t = meets(x, bed.bottom);
      if (t === null) continue;
      // (It comes in when enough shows here for its bed, give or take its
      // own number; and, like granite's, the higher places last.)
      if (here <= Math.max(comes + (r[8] - 0.5) * LAYERS.fray, clamp((t - EDGE.reach[0]) / EDGE.reach[1], 0, 0.93))) continue;
      if (r[8] > 1 - LAYERS.gaps) continue; // (one of the slabs that are never there)

      const shape = shapeLayered({
        seed: ((seed | 0) * 151 + bed.k * 389 + j * 5 + 7) | 0, size: long,
        age: clamp(age * lerp(0.85, 1.15, r[1]), 0, 1),
        thick: clamp(bed.deep / long, LAYERED.thin + 0.02, LAYERED.bedRange[1]), exact: true,
      });
      // Its length along the cliff's foot here, in its bed's plane; its
      // back into the hill.
      const foot = new THREE.Vector3(1, 0, (land.foot(x + 0.25) - land.foot(x - 0.25)) / 0.5);
      const along = foot.addScaledVector(up, -foot.dot(up)).normalize();
      const back = new THREE.Vector3().crossVectors(up, along).normalize();
      if (back.z > 0) {
        along.negate();
        back.negate();
      }
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, new THREE.Vector3().crossVectors(along, up)));
      if (r[2] < 0.5) q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
      if (noise > 0) {
        const axis = new THREE.Vector3(r[3] - 0.5, r[4] - 0.5, r[5] - 0.5);
        if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), noise * (Math.PI / 2) * (0.3 + 0.7 * r[6])));
      }
      // Its place: its front bottom edge where its bed meets the slope,
      // sunk a little; then its front stood proud of the slope, the more
      // the more shows.
      const front = land.placeOn(x, t);
      const proud = lerp(LAYERS.proud[0], LAYERS.proud[1], here) * lerp(LAYERS.uneven[0], LAYERS.uneven[1], r[9]) * shape.width;
      const middleOf = new THREE.Vector3(front.x, front.y, front.z)
        .addScaledVector(up, shape.thick / 2 - want * COURSES.sink * bed.deep)
        .addScaledVector(back, shape.width / 2 - proud + (r[7] - 0.5) * 0.1 * shape.width);

      const reach = LAYERS.near * long + 1;
      const near = rocks.filter((o) => o.max[0] > x - reach && o.min[0] < x + reach && o.max[1] > middleOf.y - reach && o.min[1] < middleOf.y + reach);
      const rock = seatRock(shape, land, { at: middleOf, q, under: COURSES.under, neighbours: near });
      const seen = rock.stands >= Math.max(BED.showsLeast, BED.showsShare * shape.thick) && rock.exposed >= COURSES.clear;
      if (!seen || rock.rests < COURSES.rests || rock.hangs > BED.slack) {
        left++;
        continue;
      }
      Object.assign(rock, { role: 'slab', bed: bed.k, piece: j, along: x, hidden: false });
      rocks.push(rock);
      showing.add(bed.k);
    }
  }
  const face = rocks.length;

  // Fallen slabs, on the bank at the foot and out past it.
  left += strewFallen(land, rocks, { seed, shows, fallen, size, kind: 'layered', age, thick, least, under, noise: sound });

  return {
    rocks, beds: { all: beds.filter((b) => b.hard).length, showing: showing.size }, face, loose: rocks.length - face, left,
    list: rocks.map(entryOf), seed, size, up: up.clone(),
  };
}
