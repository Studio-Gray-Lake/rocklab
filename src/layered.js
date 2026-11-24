import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { breaksFor, cornersIn, reachOf, unit } from './granite.js';

// Layered rock: sandstone or limestone.
//
// It breaks along its beds, which are flat and parallel, and along two
// sets of upright cracks. So a fresh
// piece is a slab: flat on top and underneath, where it parted from the
// beds above and below, with near-upright sides broken to an uneven
// outline of four to six. How thick it is, is how thick its bed was.
//
// With age its corners go first, then its edges, then its sides; its top
// and bottom stay flat longest, since rock parts along its beds.
//
// Made as granite is (granite.js): cut by flat planes, truly cut, its
// corners hulled; every number drawn first from its seed, so age only
// moves the wear cuts in and an older slab lies inside the younger one.
//
// Its frame: x along its length, y across its bed (its thickness), z its
// width, its middle at the origin. The cuts are made at the slab's own
// proportions (its half-length 1, its half-thickness `t`), so a bevel is
// the angle it looks.

const { clamp, lerp, degToRad } = THREE.MathUtils;
const TAU = Math.PI * 2;

export const LAYERED = {
  size: [0.3, 6],       // m: its length, a small stone to a block
  wide: [0.6, 0.92],    // its width as a share of its length
  // Its bed's thickness as a share of its length, give or take a tenth by
  // the seed: a slab a fifth as thick as long, up to a thick block.
  bed: 0.3,
  bedRange: [0.2, 0.7],
  thin: 0.15,           // no slab thinner than this share of its length (granite's quarter would forbid slabs)
  sides: [4, 6],        // how many sides its outline has
  batter: 6,            // degrees: how far a side may lean off upright
  inset: 0.2,           // how far in a side may sit
  breaks: 6,            // the most fresh breaks a slab has (the biggest block's)
  bite: 0.004,          // a wear cut shallower than this isn't made yet
};

// The thickness the wear cuts are sized by, at most (as a share of the
// slab's length).
const WORN_BY = 0.45;

// When each kind of wear cut works, as shares of the slab's age: corners
// first, then edges, then its sides, and its top and bottom last of all.
const WEARS = { corner: [0, 0.55], edge: [0.15, 0.8], face: [0.45, 1], top: [0.7, 1.15] };

// Every number a slab of this seed needs, drawn once in a fixed order.
const drawn = new Map();
function draws(seed) {
  if (drawn.has(seed)) return drawn.get(seed);
  const random = mulberry32((seed | 0) * 7919 + 419);
  const wide = lerp(LAYERED.wide[0], LAYERED.wide[1], random());
  const thicker = lerp(0.9, 1.1, random()); // its thickness, times this
  const count = LAYERED.sides[0] + Math.floor(random() * (LAYERED.sides[1] - LAYERED.sides[0] + 1));
  const spin = random() * TAU;

  // Its sides: unevenly round it, each near upright and a little in.
  const sides = [];
  for (let i = 0; i < count; i++) {
    sides.push({
      a: spin + ((i + (random() - 0.5) * 0.5) * TAU) / count,
      batter: degToRad((2 * random() - 1) * LAYERED.batter),
      r: 1 - LAYERED.inset * random(),
    });
  }

  // Its fresh breaks: a piece off its outline, top to bottom or nearly;
  // now and then a chip off a top corner.
  const breaks = [];
  for (let k = 0; k < LAYERED.breaks; k++) {
    breaks.push({ a: random() * TAU, up: random() < 0.3 ? lerp(0.4, 0.9, random()) : lerp(-0.12, 0.25, random()), depth: random() });
  }

  // Its wear cuts, each with how fast it works and how far in it ends (a
  // share, the corner and side cuts' of the slab's half-length, the others'
  // of its thickness).
  const wear = [];
  const cut = (kind, about, far) => wear.push({ kind, ...about, rate: lerp(0.8, 1.25, random()), far: lerp(far[0], far[1], random()) });
  const between = (i) => {
    const next = sides[(i + 1) % count].a + (i === count - 1 ? TAU : 0);
    return (sides[i].a + next) / 2;
  };
  for (let i = 0; i < count; i++) {
    const [a, m] = [sides[i].a + (random() - 0.5) * 0.12, between(i) + (random() - 0.5) * 0.12];
    // The upright corner between two sides, and its top and bottom ends.
    cut('corner', { a: m, tilt: 0 }, [0.1, 0.26]);
    cut('corner', { a: m, tilt: degToRad(42), thick: true }, [0.45, 0.85]);
    cut('corner', { a: m, tilt: -degToRad(42), thick: true }, [0.45, 0.85]);
    // The top and bottom edges of a side.
    cut('edge', { a, tilt: degToRad(45), thick: true }, [0.3, 0.55]);
    cut('edge', { a, tilt: -degToRad(45), thick: true }, [0.3, 0.55]);
    // The side itself, rounded over, above and below its middle.
    cut('face', { a, tilt: degToRad(22), thick: true }, [0.18, 0.36]);
    cut('face', { a, tilt: -degToRad(22), thick: true }, [0.18, 0.36]);
    // The top and the bottom, domed a little toward this side: last.
    cut('top', { a, tilt: degToRad(72), thick: true }, [0.12, 0.26]);
    cut('top', { a, tilt: -degToRad(72), thick: true }, [0.12, 0.26]);
  }
  const all = { wide, thicker, sides, breaks, wear };
  drawn.set(seed, all);
  return all;
}

// The share of a wear cut's way in, at this age: 0 untouched, 1 fully worn.
function wearShare(kind, age) {
  const [from, to] = WEARS[kind];
  const t = clamp((age - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

// A plane's normal that faces out along angle `a` round the slab, tilted
// `tilt` up (or down) from level.
const facing = (a, tilt) => [Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)];

// A slab's shape: its corners in its own frame (m), and its facts. thick:
// its bed's thickness as a share of its length (the seed varies it a tenth
// either way; exact: it doesn't, so the slabs of one bed are one thickness).
export function shapeLayered({ seed = 1, size = 1.5, age = 0, thick = LAYERED.bed, exact = false } = {}) {
  const d = draws(seed);
  size = clamp(size, 0.05, 50);
  age = clamp(age, 0, 1);
  const thickShare = clamp(thick * (exact ? 1 : d.thicker), LAYERED.thin + 0.01, 0.95);
  const t = thickShare; // its half-thickness, where its half-length is 1

  // The fresh slab: the bed's two faces, its sides, then its breaks, each
  // measured in from how far the slab then reaches that way.
  const cuts = [[0, 1, 0, t], [0, -1, 0, t]];
  for (const { a, batter, r } of d.sides) cuts.push([...facing(a, batter), r]);
  const count = breaksFor(size);
  for (let k = 0; k < count; k++) {
    const { a, up, depth } = d.breaks[k];
    const n = unit([Math.cos(a), up * t * 2, Math.sin(a)]);
    const [least, most] = k < 2 ? [0.15, 0.42] : [0.06, 0.18];
    cuts.push([...n, reachOf(cornersIn(cuts), n) - lerp(least, most, depth)]);
  }
  const fresh = cornersIn(cuts);

  // The wear: each cut starts where it just touches the fresh slab and
  // moves in with age.
  let worn = 0;
  for (const { kind, a, tilt, thick: byThickness, rate, far } of d.wear) {
    const n = facing(a, tilt);
    // (A very thick slab's cuts are sized as a moderately thick one's: by
    // its full thickness they would eat it whole.)
    const bite = wearShare(kind, age * rate) * far * (byThickness ? Math.min(t, WORN_BY) : 1);
    if (bite < LAYERED.bite) continue;
    cuts.push([...n, reachOf(fresh, n) - bite]);
    worn++;
  }
  const corners = worn ? cornersIn(cuts) : fresh;

  // To its size, by the fresh slab's own box.
  const box = new THREE.Box3().setFromPoints(fresh);
  const length = size;
  const width = size * clamp(Math.max(d.wide, thickShare + 0.04), thickShare, 1);
  const thickness = size * thickShare;
  const sx = length / (box.max.x - box.min.x);
  const sy = thickness / (box.max.y - box.min.y);
  const sz = width / (box.max.z - box.min.z);
  const cx = (box.max.x + box.min.x) / 2;
  const cy = (box.max.y + box.min.y) / 2;
  const cz = (box.max.z + box.min.z) / 2;
  const points = corners.map((p) => new THREE.Vector3((p.x - cx) * sx, (p.y - cy) * sy, (p.z - cz) * sz));
  // (spec: what it was asked for, enough to make it again.)
  return { kind: 'layered', seed, size, age, points, length, width, thick: thickness, breaks: count, cuts: cuts.length, spec: { kind: 'layered', seed, size, age, thick, ...(exact ? { exact: true } : {}) } };
}
