import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { orientation } from './granite.js';
import { LAYERED, shapeLayered } from './layered.js';
import { BED, seatRock } from './bed.js';
import { entryOf } from './cluster.js';

// Layered rock's cluster: a stack of courses. Granite's cluster is a heap round
// one big rock. Layered rock isn't heaped: it lies in beds. So its cluster
// is a small stack of ledges.
//
// - A course is one bed: slabs side by side along the slope, all of that
//   bed's thickness, their tops in one plane and their bottoms in another.
//   Where two of them cross a little is the crack between them.
// - The stack. Courses lie one on another, each sunk a little into the one
//   below, each a little shorter than the one below, and each set back
//   from the one below: on a slope, as far as the slope itself goes back,
//   so each course's front stands just behind the one under it. So the
//   stack steps: a riser, a ledge, a riser. On a steep slope each front
//   stands a little proud of the slope, as a ledge does where the softer
//   rock under it has worn back; without that a slab lying level in a
//   steep hill would show only a sliver of its top edge.
// - Rows. A course is rows of slabs deep, the lower courses deeper, so
//   every slab above has a floor under it. On a slope the back rows are in
//   the hill, and aren't kept.
// - Beds differ: each course has its own thickness. A thick bed breaks
//   into long slabs and a thin one into short ones (cracks lie about as
//   far apart as the bed is thick).
// - Cracks don't line up: every row's slabs are of uneven lengths and
//   start at a place of their own. Now and then a slab of the top course
//   is missing.
// - One grain: every bed lies in the same tilted plane, the slant. Noise
//   loosens it, toward slabs that have slipped.
//
// The stack is one stiff body in its beds' own frame, so the planes stay
// planes. It is set with the front of its bottom course at its spot, sunk
// into the land by the share asked. Then every slab is tested where its
// bed puts it, from the bottom up, and kept if it rests: most of its
// underside (`rests`) on the land or the slabs already kept, and its
// middle over one of them. The rest of its underside may bridge a crack or
// stand out as a ledge's lip. A slab that doesn't rest, or that wouldn't
// show, is left out. So the land cuts the stack off as it does an outcrop:
// what would stand in the air, or lie wholly in the hill, isn't there.
//
// Steady: every number is drawn first, from the seed, course by course.
// Fewer courses leaves the lower ones' slabs as they were.
//
// What comes out is a list of whole rocks, as a cluster's is.

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const Y = new THREE.Vector3(0, 1, 0);

export const COURSES = {
  courses: 3,           // how many, to start with
  coursesRange: [1, 5],
  slabs: 3,             // how many slabs long the bottom course is, to start with
  slabsRange: [1, 4],
  step: 0.45,           // how far each course is set back from the one below, as a share of a slab's width
  bed: [0.55, 1.45],    // a course's thickness, as a share of the bed thickness asked: beds differ
  long: [2.2, 5.5],     // a slab's length, in thicknesses of its bed: thin beds break short
  sink: 0.15,           // the share of a course's thickness sunk into the one below
  shrink: 0.18,         // each course is this much shorter than the bottom one, a course
  lap: 0.9,             // slabs side by side cross by this share of "how far they cross", of their length
  missing: 0.2,         // the chance a slab of the top course is missing
  rows: 3,              // the most rows of slabs deep a course is (the bottom ones)
  deep: 0.7,            // how far apart its rows are, as a share of a slab's width
  mostSlabs: 7,         // slabs drawn for a row (more than any row uses)
  under: 65,            // degrees: a slab's face within this of facing the land is its underside
  rests: 0.6,           // a slab is kept if at least this share of its underside rests on something
  clear: 0.04,          // ...and at least this share of it is clear of the land and the others
  proud: 0.4,           // on a steep slope a course's front stands this far out of it, as a share of a slab's width
};

// Every number a stack of this seed needs: a course at a time.
const drawn = new Map();
function draws(seed) {
  if (drawn.has(seed)) return drawn.get(seed);
  const random = mulberry32((seed | 0) * 8191 + 43);
  const courses = [];
  for (let k = 0; k < COURSES.coursesRange[1]; k++) {
    courses.push({
      bed: random(), start: random(), back: random(),
      rows: Array.from({ length: COURSES.rows }, () => ({
        start: random(),
        slabs: Array.from({ length: COURSES.mostSlabs }, () => Array.from({ length: 10 }, () => random())),
      })),
    });
  }
  drawn.set(seed, courses);
  return courses;
}

// The stack at (x, z) on the land. Its settings: seed, size (m: its
// longest slabs' length), age, thick (the bed thickness asked, as a share
// of size), courses, slabs (the bottom course's length in slabs), step
// (COURSES's), noise and cross (cluster.js's), slant, lean, turn (radians:
// its grain), shows, least (bed.js's), and neighbours: rocks already there.
//
// Gives { rocks, left, list }, as a cluster does. Each rock carries its
// course (0 the bottom one), its row, and how far along its course its
// middle is.
export function makeCourses(land, {
  x = 0, z = 0, seed = 1, size = 1.5, age = 0, thick = LAYERED.bed, courses = COURSES.courses, slabs = COURSES.slabs,
  step = COURSES.step, noise = 0, cross = 0.35, slant = 0, lean = 0, turn = 0, shows = 0.6,
  least = BED.least, neighbours = [],
} = {}) {
  const d = draws(seed);
  const many = clamp(Math.round(courses), COURSES.coursesRange[0], COURSES.coursesRange[1]);
  const across = clamp(Math.round(slabs), COURSES.slabsRange[0], COURSES.slabsRange[1]);

  // The land at the spot, and the beds' own frame: square to the beds (up),
  // along them (along), and back into the hill (back).
  const n = land.normalAt(x, z);
  const spot = new THREE.Vector3(x, land.heightAt(x, z), z);
  const grain = orientation(slant, lean, turn);
  const up = Y.clone().applyQuaternion(grain);
  // On level ground the courses run along the grain's own length (so
  // "turn" turns them). On a slope they run along it, as ledges do: a
  // straight course set askew would leave the hill at one end and be lost
  // in it at the other.
  const contour = new THREE.Vector3().crossVectors(Y, n);
  const sloping = contour.length(); // the slope's sine
  const along = new THREE.Vector3(1, 0, 0).applyQuaternion(grain);
  if (sloping > 0.02) {
    contour.addScaledVector(up, -contour.dot(up));
    if (contour.lengthSq() > 1e-6) {
      contour.normalize();
      if (contour.dot(along) < 0) contour.negate();
      along.lerp(contour, smoothstep(sloping, 0.1, 0.5)).normalize();
    }
  }
  const back = new THREE.Vector3().crossVectors(up, along).normalize();
  const uphill = new THREE.Vector3().crossVectors(n, new THREE.Vector3().crossVectors(Y, n));
  if (sloping > 0.02 ? back.dot(uphill) < 0 : back.z > 0) {
    along.negate();
    back.negate();
  }
  // How far back the slope itself goes for each metre up: a course set
  // back further than that would be lost in the hill.
  const run = sloping > 0.02 ? Math.max(n.y, 0) / sloping : Infinity;
  // How far a course's front stands out of the slope (none on the level).
  const proud = COURSES.proud * smoothstep(sloping, 0.2, 0.8);
  // A slab lying in a bed: its length along, its thickness up.
  const lying = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, new THREE.Vector3().crossVectors(along, up)));

  // The courses' slabs, in the beds' frame: a (along), b (back from the
  // stack's front), c (up from its bottom).
  const length0 = across * 0.75 * size;
  const width0 = 0.72 * size; // about a slab's width
  const plan = [];
  let bottom = 0;
  for (let k = 0; k < many; k++) {
    const c = d[k];
    const bed = size * thick * lerp(COURSES.bed[0], COURSES.bed[1], c.bed);
    const length = length0 * Math.max(0.3, 1 - COURSES.shrink * k);
    const slack = (length0 - length) / 2;
    // Its front: set back from the course below's, but no further than the
    // slope goes back in the height the stack has gained.
    const set = Math.min(step * width0 * k, Number.isFinite(run) ? 0.9 * run * bottom : Infinity) + (c.back - 0.5) * 0.1 * width0;
    const course = [];
    const rows = clamp(many - k, 1, COURSES.rows);
    for (let row = 0; row < rows; row++) {
      const { start, slabs: drawnSlabs } = c.rows[row];
      // (Each row starts at a place of its own, so its cracks don't line
      // up with the next row's or the course below's. The course's own
      // start shifts it within the room the course below leaves it.)
      let cursor = -length / 2 + (c.start - 0.5) * 2 * slack + (row === 0 ? 0 : (start - 0.5) * 0.5 * size);
      const end = cursor + length;
      for (let j = 0; j < COURSES.mostSlabs && cursor < end - 0.25 * bed; j++) {
        const r = drawnSlabs[j];
        // (The last slab of a row is cut to what's left of it, but never
        // shorter than its bed allows: a slab is a slab, not a cube.)
        const long = Math.min(size, bed * lerp(COURSES.long[0], COURSES.long[1], r[0]), Math.max(end - cursor, bed / LAYERED.bedRange[1]));
        const shape = shapeLayered({
          seed: (seed | 0) * 151 + k * 23 + row * 97 + j * 5 + 2, size: long,
          age: clamp(age * lerp(0.85, 1.15, r[1]), 0, 1),
          thick: clamp(bed / long, LAYERED.thin + 0.02, LAYERED.bedRange[1]), exact: true,
        });
        const q = lying.clone();
        if (r[2] < 0.5) q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
        if (noise > 0) {
          const axis = new THREE.Vector3(r[3] - 0.5, r[4] - 0.5, r[5] - 0.5);
          if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
          q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), noise * (Math.PI / 2) * (0.3 + 0.7 * r[6])));
        }
        const a = cursor + shape.length / 2;
        const b = set - proud * width0 + row * COURSES.deep * width0 + shape.width / 2 + (r[7] - 0.5) * 0.1 * shape.width;
        const missing = k === many - 1 && k > 0 && r[8] < COURSES.missing;
        if (!missing) {
          course.push({
            k, row, j, a, shape, q,
            offset: new THREE.Vector3().addScaledVector(along, a).addScaledVector(back, b).addScaledVector(up, bottom + shape.thick / 2),
          });
        }
        cursor += shape.length * (1 - COURSES.lap * cross);
      }
    }
    plan.push({ bed, slabs: course });
    bottom += bed * (1 - COURSES.sink);
  }

  // The stack's own place: the front of its bottom course's underside, at
  // the spot, below the land by the share asked of that course's
  // thickness.
  const want = 1 - (1 - clamp(least, 0, 1)) * clamp(shows, 0, 1);
  const origin = spot.clone().addScaledVector(up, -want * plan[0].bed);

  // From the bottom up: every slab where its bed puts it, kept if it rests
  // and shows.
  const rocks = [];
  const there = [...neighbours];
  let left = 0;
  for (const { slabs: course } of plan) {
    for (const slab of course) {
      const rock = seatRock(slab.shape, land, { at: origin.clone().add(slab.offset), q: slab.q, under: COURSES.under, neighbours: there });
      const shows_ = rock.stands >= Math.max(BED.showsLeast, BED.showsShare * slab.shape.thick) && rock.exposed >= COURSES.clear;
      if (!shows_ || rock.rests < COURSES.rests || rock.hangs > BED.slack) {
        left++;
        continue;
      }
      Object.assign(rock, { role: 'slab', course: slab.k, row: slab.row, piece: slab.row * COURSES.mostSlabs + slab.j, along: slab.a, hidden: false });
      rocks.push(rock);
      there.push(rock);
    }
  }
  return { rocks, left, list: rocks.map(entryOf), seed, size, up: up.clone() };
}
