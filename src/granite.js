import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { cornersOf } from './corners.js';
import { mulberry32 } from './random.js';

// Granite, young to old.
//
// Granite breaks into boxes along three sets of cracks roughly at right
// angles. A fresh piece is a rough box: about six faces and eight corners,
// about 1 long, 0.7 wide and 0.5 thick. With age its corners go first,
// then its edges, then its faces, until the block is a rounded lump; its
// size hardly changes.
//
// How it's made: as the workshop's rocks are, cut and not pulled. Every
// face is a flat plane, [nx, ny, nz, d] with the rock where n·p <= d, in a
// unit frame; the corners are where three planes meet (src/corners.js
// cornersOf); the corners are scaled to the rock's size and hulled (three's
// ConvexHull). So a rock is convex and whole.
//
// Steady under its sliders: every number a rock needs is drawn first, from
// its seed, in one fixed order. Age only moves the wear cuts in from where
// they just touch the fresh rock; size only says how many of the breaks are
// used. So sliding the age never reshuffles the rock, and an older rock is
// always inside the younger one.
//
// - shapeGranite({ seed, size, age }): the rock's corners in its own frame
//   (m): x along its length, y its thickness, z its width, its middle at
//   the origin.
// - orientation(slant, lean, turn): how it's turned in the world.
// - buildRock(points): the hull of points already in place: the drawn
//   triangles, their facets and planes.
// - measure(rock): its faces, corners, sharpest edge and least thickness.

const { clamp, lerp, degToRad, radToDeg } = THREE.MathUtils;

export const GRANITE = {
  size: [0.3, 6],      // m: its length, a small stone to a block
  wide: [0.62, 0.9],   // its width as a share of its length
  // Its thickness as a share of its length, give or take a tenth by the
  // seed. The research's average for all broken rock is 0.5; on the page
  // that read as a flat slab, and granite's blocks are chunkier, so it
  // starts at 0.6 (by eye, and a slider).
  thick: 0.6,
  thickRange: [0.4, 0.9],
  lean: 12,            // degrees: how far a face may lean off square (unit frame)
  inset: 0.14,         // how far in a face may sit (unit frame)
  breaks: 6,           // the most fresh breaks a rock has (the biggest block's)
  bite: 0.004,         // a wear cut shallower than this isn't made yet (unit frame)
};

// When each kind of wear cut works, as shares of the rock's age: corners
// first, then edges, then faces.
const WEARS = { corner: [0, 0.55], edge: [0.15, 0.8], face: [0.45, 1] };

export const unit = ([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

// How far the solid with these corners reaches along n.
export function reachOf(corners, n) {
  let most = -Infinity;
  for (const p of corners) most = Math.max(most, n[0] * p.x + n[1] * p.y + n[2] * p.z);
  return most;
}

// The corners of the solid these cuts make. (cornersOf
// bounds a solid with a box at ±1.4; a leaning box's far corner can reach
// past that, so the cuts are solved at a smaller scale and scaled back.)
const SOLVE = 0.7;
export function cornersIn(cuts) {
  return cornersOf(cuts.map(([x, y, z, d]) => [x, y, z, d * SOLVE]), true).map((p) => p.divideScalar(SOLVE));
}

// Every number a rock of this seed needs, drawn once in a fixed order.
const drawn = new Map();
function draws(seed) {
  if (drawn.has(seed)) return drawn.get(seed);
  const random = mulberry32((seed | 0) * 7919 + 211);
  const jitter = (by) => (2 * random() - 1) * by;
  const wide = lerp(GRANITE.wide[0], GRANITE.wide[1], random());
  const thicker = lerp(0.9, 1.1, random()); // its thickness, times this

  // Its six faces: none quite square to the next, each a little in.
  const faces = [];
  const off = Math.tan(degToRad(GRANITE.lean));
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1]) {
      const n = [0, 0, 0];
      n[axis] = sign;
      n[(axis + 1) % 3] = jitter(off);
      n[(axis + 2) % 3] = jitter(off);
      faces.push([...unit(n), 1 - GRANITE.inset * random()]);
    }
  }

  // Its fresh breaks: a piece off a corner, or along an edge. Mostly off
  // its upper half, where they show; the second off the other end from the
  // first, so the outline is broken at both.
  const breaks = [];
  for (let k = 0; k < GRANITE.breaks; k++) {
    const n = [0, 1, 2].map((axis) => (random() < (axis === 1 ? 0.75 : 0.5) ? 1 : -1) * lerp(0.3, 1, random()));
    if (k === 1) n[0] = -Math.sign(breaks[0].n[0]) * Math.abs(n[0]);
    const alongEdge = random() < 0.35;
    const flat = Math.floor(random() * 3);
    if (alongEdge) n[flat] *= 0.08;
    breaks.push({ n: unit(n), depth: random() });
  }

  // Its wear cuts: one a corner, one an edge, four a face.
  const wear = [];
  const cut = (kind, n, target) => wear.push({ kind, n: unit(n), rate: lerp(0.8, 1.25, random()), target: lerp(target[0], target[1], random()) });
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    cut('corner', [sx + jitter(0.18), sy + jitter(0.18), sz + jitter(0.18)], [1.02, 1.16]);
  }
  for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      const n = [jitter(0.14), jitter(0.14), jitter(0.14)];
      n[a] += sa;
      n[b] += sb;
      cut('edge', n, [0.98, 1.1]);
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1]) {
      for (const other of [(axis + 1) % 3, (axis + 2) % 3]) {
        for (const side of [1, -1]) {
          const tilt = degToRad(24 + jitter(5));
          const n = [jitter(0.08), jitter(0.08), jitter(0.08)];
          n[axis] += sign * Math.cos(tilt);
          n[other] += side * Math.sin(tilt);
          cut('face', n, [0.97, 1.06]);
        }
      }
    }
  }
  const all = { wide, thicker, faces, breaks, wear };
  drawn.set(seed, all);
  return all;
}

// How many fresh breaks a rock this long has: two on a small stone, six on
// the biggest block. A bigger rock has cuts of its own; it isn't a small
// one scaled up.
export function breaksFor(size) {
  const [least, most] = GRANITE.size;
  const t = clamp(Math.log(size / least) / Math.log(most / least), 0, 1);
  return Math.min(GRANITE.breaks, 2 + Math.floor(t * (GRANITE.breaks - 1)));
}

// The share of a wear cut's way in, at this age: 0 untouched, 1 fully worn.
function wearShare(kind, age) {
  const [from, to] = WEARS[kind];
  const t = clamp((age - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

// A granite rock's shape: its corners in its own frame (m), and its facts.
// thick: its thickness as a share of its length (the seed varies it a
// tenth either way); it's never wider than long, nor thicker than wide.
export function shapeGranite({ seed = 1, size = 1.5, age = 0, thick = GRANITE.thick } = {}) {
  const d = draws(seed);
  size = clamp(size, 0.05, 50);
  age = clamp(age, 0, 1);
  const thickShare = clamp(thick * d.thicker, 0.25, 0.95);
  const wideShare = clamp(Math.max(d.wide, thickShare + 0.04), thickShare, 1);

  // The fresh rock: the six faces, then its breaks, each measured in from
  // how far the rock then reaches that way.
  const cuts = d.faces.map((f) => [...f]);
  const count = breaksFor(size);
  for (let k = 0; k < count; k++) {
    const { n, depth } = d.breaks[k];
    // The first two are the big breaks; the rest are chips.
    const [least, most] = k < 2 ? [0.2, 0.48] : [0.07, 0.2];
    cuts.push([...n, reachOf(cornersIn(cuts), n) - lerp(least, most, depth)]);
  }
  const fresh = cornersIn(cuts);

  // The wear: each cut starts where it just touches the fresh rock and
  // moves in with age toward its place on the old rounded lump.
  let worn = 0;
  for (const { kind, n, rate, target } of d.wear) {
    const touching = reachOf(fresh, n);
    const bite = wearShare(kind, age * rate) * (touching - target);
    if (bite < GRANITE.bite) continue;
    cuts.push([...n, touching - bite]);
    worn++;
  }
  const corners = worn ? cornersIn(cuts) : fresh;

  // To its size, by the fresh rock's own box: so age doesn't change the
  // size, only wears it.
  const box = new THREE.Box3().setFromPoints(fresh);
  const length = size;
  const width = size * wideShare;
  const thickness = size * thickShare;
  const sx = length / (box.max.x - box.min.x);
  const sy = thickness / (box.max.y - box.min.y);
  const sz = width / (box.max.z - box.min.z);
  const cx = (box.max.x + box.min.x) / 2;
  const cy = (box.max.y + box.min.y) / 2;
  const cz = (box.max.z + box.min.z) / 2;
  const points = corners.map((p) => new THREE.Vector3((p.x - cx) * sx, (p.y - cy) * sy, (p.z - cz) * sz));
  // (spec: what it was asked for, enough to make it again.)
  return { kind: 'granite', seed, size, age, points, length, width, thick: thickness, breaks: count, cuts: cuts.length, spec: { kind: 'granite', seed, size, age, thick } };
}

// How a rock is turned in the world. slant (radians): how far its
// thickness leans off plumb; lean (radians about the vertical, from +x
// toward +z): the way its top leans; turn (radians): its own turn about
// its thickness, made first.
export function orientation(slant = 0, lean = 0, turn = 0) {
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(lean), 0, -Math.cos(lean)), slant);
  return tilt.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn));
}

// Neighbouring triangles this close to one plane are one facet.
const SAME_FACET = Math.cos(degToRad(1));

// The rock these points make, where they are: its hull's triangles (flat,
// wound outward), which facet each is part of, each facet's plane, and its
// corners. The points are rounded to float32 first, so the drawn mesh's
// positions are the hull's own (as the workshop's rocks do).
export function buildRock(points, about = {}) {
  const rounded = points.map((p) => new THREE.Vector3(Math.fround(p.x), Math.fround(p.y), Math.fround(p.z)));
  const faces = new ConvexHull().setFromPoints(rounded).faces;
  if (faces.length < 4) throw new Error('a rock came out flat');
  const T = faces.length;
  const positions = new Float32Array(T * 9);
  const normals = new Float32Array(T * 3);
  const areas = new Float64Array(T);
  const index = new Map(faces.map((f, i) => [f, i]));
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const corners = new Set();
  faces.forEach((face, i) => {
    const a = face.edge.tail().point;
    const b = face.edge.head().point;
    const c = face.edge.next.head().point;
    a.toArray(positions, i * 9);
    b.toArray(positions, i * 9 + 3);
    c.toArray(positions, i * 9 + 6);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    areas[i] = n.length() / 2;
    n.normalize().toArray(normals, i * 3);
    corners.add(a).add(b).add(c);
  });

  // Facets: neighbouring triangles on one plane.
  const facet = Int32Array.from({ length: T }, (_, i) => i);
  const root = (i) => (facet[i] === i ? i : (facet[i] = root(facet[i])));
  const dot = (i, j) => normals[i * 3] * normals[j * 3] + normals[i * 3 + 1] * normals[j * 3 + 1] + normals[i * 3 + 2] * normals[j * 3 + 2];
  faces.forEach((face, i) => {
    let edge = face.edge;
    do {
      const j = index.get(edge.twin?.face);
      if (j !== undefined && dot(i, j) > SAME_FACET) facet[root(i)] = root(j);
      edge = edge.next;
    } while (edge !== face.edge);
  });
  for (let i = 0; i < T; i++) facet[i] = root(i);

  // Each facet's plane (its triangles' normals, by area), [nx, ny, nz, d].
  const sums = new Map();
  for (let i = 0; i < T; i++) {
    const s = sums.get(facet[i]) ?? sums.set(facet[i], [0, 0, 0, 0, 0, 0, 0]).get(facet[i]);
    for (let k = 0; k < 3; k++) {
      s[k] += areas[i] * normals[i * 3 + k];
      s[3 + k] += areas[i] * (positions[i * 9 + k] + positions[i * 9 + 3 + k] + positions[i * 9 + 6 + k]) / 3;
    }
    s[6] += areas[i];
  }
  const planes = [];
  const planeOf = new Map(); // facet -> its plane's index
  for (const [f, s] of sums) {
    const [nx, ny, nz] = unit(s);
    planeOf.set(f, planes.length);
    planes.push([nx, ny, nz, (nx * s[3] + ny * s[4] + nz * s[5]) / s[6]]);
  }

  // The sharpest edge between two facets: the angle inside the rock there.
  let sharpest = Math.PI;
  faces.forEach((face, i) => {
    let edge = face.edge;
    do {
      const j = index.get(edge.twin?.face);
      if (j !== undefined && facet[i] !== facet[j]) sharpest = Math.min(sharpest, Math.PI - Math.acos(clamp(dot(i, j), -1, 1)));
      edge = edge.next;
    } while (edge !== face.edge);
  });

  // Its box, for a quick "is this point anywhere near it".
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of corners) {
    min[0] = Math.min(min[0], p.x); min[1] = Math.min(min[1], p.y); min[2] = Math.min(min[2], p.z);
    max[0] = Math.max(max[0], p.x); max[1] = Math.max(max[1], p.y); max[2] = Math.max(max[2], p.z);
  }

  return { ...about, positions, normals, areas, facet, planes, planeOf, corners: [...corners], sharpest, min, max };
}

// A rock's facts, for the readout and the tests: how many flat faces and
// corners it has, its sharpest edge (degrees inside the rock), and its
// least thickness as a share of its greatest reach.
export function measure(rock) {
  const { planes, corners } = rock;
  let thinnest = Infinity;
  for (const [nx, ny, nz] of planes) {
    let low = Infinity, high = -Infinity;
    for (const p of corners) {
      const t = nx * p.x + ny * p.y + nz * p.z;
      low = Math.min(low, t);
      high = Math.max(high, t);
    }
    thinnest = Math.min(thinnest, high - low);
  }
  let longest = 0;
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) longest = Math.max(longest, corners[i].distanceTo(corners[j]));
  return {
    faces: planes.length,
    corners: corners.length,
    triangles: rock.facet.length,
    sharpest: radToDeg(rock.sharpest),
    thinnest: thinnest / longest,
    longest,
  };
}

// Whether (x, y, z) is inside a rock (on its skin counts), by its planes.
export function inside(rock, x, y, z, slack = 1e-6) {
  const { min, max } = rock;
  if (x < min[0] - slack || x > max[0] + slack || y < min[1] - slack || y > max[1] + slack || z < min[2] - slack || z > max[2] + slack) return false;
  for (const [nx, ny, nz, d] of rock.planes) if (nx * x + ny * y + nz * z > d + slack) return false;
  return true;
}

// How far (x, y, z) is outside a rock, by its farthest plane (m): below 0
// inside it.
export function outside(rock, x, y, z) {
  let most = -Infinity;
  for (const [nx, ny, nz, d] of rock.planes) most = Math.max(most, nx * x + ny * y + nz * z - d);
  return most;
}

// A rock's top over (x, z), or -Infinity where a line straight down misses
// it. (A convex rock: the line enters it once and leaves it once.)
export function topAt(rock, x, z) {
  const { min, max } = rock;
  if (x < min[0] || x > max[0] || z < min[2] || z > max[2]) return -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const [nx, ny, nz, d] of rock.planes) {
    if (ny > 1e-9) top = Math.min(top, (d - nx * x - nz * z) / ny);
    else if (ny < -1e-9) bottom = Math.max(bottom, (d - nx * x - nz * z) / ny);
    else if (nx * x + nz * z > d) return -Infinity;
  }
  return bottom > top ? -Infinity : top;
}
