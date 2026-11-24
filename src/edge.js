import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { bandShare } from './land.js';
import { slowField } from './field.js';
import { shapeOf } from './kinds.js';
import { orientation } from './granite.js';
import { CLUSTER, entryOf, makeCluster } from './cluster.js';
import { BED, bedRock } from './bed.js';

// Along the edge: the clusters placed along the land's steep band, so
// that one slider, "how much shows", takes it from stones in the grass, to
// outcrops, to a cliff. Clusters of rock are set along the edge, resized
// and rearranged every which way; a cliff is how much of the rock shows,
// at what tilt, and in which pattern.
//
// - The spots. Places for clusters are drawn along the band and up it,
//   unevenly spaced, in three ranks: a few big clusters across the middle
//   of the face carry the outline; middling ones go below and above them;
//   small ones and single stones lie at the foot, a few of them up on the
//   face.
// - One grain. Every cluster shares the slant, the lean and the turn: one
//   body of rock in place.
// - How much shows does three things together: how far each rock stands
//   out of the land; how many spots have a cluster (each spot has its own
//   number, and its cluster is there once the slider is past it); and how
//   far up the band the rock reaches. Toward each end of the edge it falls
//   away, so the rock there is smaller, deeper and sparser.
// - Built big first, and from the foot up within a rank. Every rock is
//   bedded against the land and the rocks already placed near it, its own
//   cluster's and its neighbours'.
//
// The foot and the top, where the edge meets the land:
// - Fallen rock. The land has an apron at the band's foot, a bank at 35°
//   (land.js), as tall as there is fallen rock. On it and out past it lie
//   loose whole rocks, every which way: many small and few big, the bigger
//   ones lower and farther out, a few alone past the foot; fresher than the
//   face above. More under more rock.
// - The rim. Blocks along the lip at the top, sunk well over half into the
//   meadow behind, so the skyline is rock and grass by turns.
// Both draw from streams of their own, so with both at nothing the edge is
// rock for rock what it was without them.
//
// Noise. Everything
// above is drawn spot by spot, each on its own, so rock is sprinkled
// evenly. A slow field along the edge (field.js) is the one thing
// neighbours share:
// - patchy: it raises and lowers "how much shows" from place to place, so
//   rock gathers in some stretches and thins in others. patch: how long
//   such a stretch is (m).
// - drift: the grain's slant, lean and turn wander slowly along the edge,
//   so neighbouring clusters agree and far ones differ.
// With both at nothing the edge is rock for rock what it was.
//
// Steady: every spot's numbers are drawn first, from the seed, in a fixed
// order. Sliding "how much shows" up only brings more spots in; it never
// moves one.
//
// The band. The
// edge was made for the test land's one straight band. It is laid along
// any band that says the same few things about itself: how long it is
// (from, to: m along its foot); how the rock falls away toward its two
// ends (near, far); where a place so far along and so far up it is
// (place); where a place so far out from its foot is (out); and, if it
// has them, how tall the bank at its foot is (apron), how it's turned
// from the test band (facing: the grain turns with it), how tall it is
// beside the test band (scale), how big its rocks are from place to
// place, as a share of the size asked (grade: a lower band, smaller
// rocks), and how many big clusters it may have (spotsRange). With no band given it is the test land's, and the edge
// is rock for rock what it was. place.js lays the land's rock by place on the
// land of hills.
//
// The slope decides: a flat top has flat-lying rocks if any; steeper
// ground has more exposed, larger rocks; gentler slopes, smaller ones.
// `slope`, 0 to 1: how much say the land's steepness at a spot has there.
// - How much shows follows it: on the steepest ground as much as asked;
//   on gentler ground fewer spots have rock, and more of each rock is
//   buried, so it looks smaller. (Not smaller rocks: how big a block is
//   comes from the rock's own cracks.)
// - How the rock lies follows it: on steep ground the grain asked for;
//   as the ground levels the rock lies down with it, and on a flat top
//   it is low flat slabs (granite also breaks into sheets that lie with
//   the surface).
// - The rim's rock reaches further back over the top.
// With it at nothing the edge is rock for rock what it was.
//
// What comes out is still a list of whole rocks.

const { clamp, lerp, smoothstep, degToRad, radToDeg } = THREE.MathUtils;
const REPOSE = Math.tan(degToRad(35)); // where fallen rock comes to rest (as land.js)
const NONE = [];

export const EDGE = {
  from: -22, to: 19,   // m: the edge, along the band
  taper: 7,            // m: how far in from its near end it comes to its full showing
  spots: 8,            // how many big clusters along it, to start with
  spotsRange: [3, 12],
  uneven: 0.6,         // how unevenly they're spaced: 0 even, 1 as uneven as it goes
  mids: 1.75,          // middling clusters for each big one
  smalls: 3,           // small ones and stones for each big one
  // Each rank's biggest rock, as a share of the size asked; its pieces, as
  // a share of the pieces asked (the small ones: one to three rocks); when
  // its spots come in, as "how much shows" rises; and how far up the band
  // they stand (0 the foot, 1 the top).
  big: { size: [0.85, 1], pieces: 1, comes: [0.18, 0.55], up: [0.3, 0.62] },
  mid: { size: [0.5, 0.68], pieces: 0.7, comes: [0.35, 0.8], low: [0.05, 0.3], high: [0.68, 0.95] },
  small: { size: [0.22, 0.36], comes: [0.02, 0.5], foot: [-0.08, 0.15], face: [0.15, 0.95], onFace: 0.25 },
  reach: [0.3, 0.75],  // a spot `up` the band comes in only once "how much shows" is past (up − 0.3) / 0.75
  least: 0.25,         // a rock's own showing where the slider is at its lowest
  near: 3.2,           // rocks within this many of a cluster's sizes of its spot are its neighbours
  // The foot: fallen rock.
  fallen: 0.6,         // how much, to start with: 0 none, 1 plenty
  apron: 2,            // m: the bank's height where there's plenty and the rock above shows fully
  talus: {
    most: 90,          // loose rocks along the edge, at plenty
    size: [0.07, 0.42],// a loose rock's length, as a share of the size asked...
    power: 2.6,        // ...many small, few big: the draw raised to this
    age: 0.6,          // its age, as a share of the face's: fresher
    alone: 0.06,       // the share of them lying alone, out past the foot
    shows: 0.85,       // its own showing
    held: 0.35,        // at least this share of it in the bank or a neighbour
  },
  // The top: the rim.
  rim: 0.6,            // how much, to start with: 0 none, 1 plenty
  lip: {
    most: 16,          // blocks or small groups along the lip, at plenty
    size: [0.4, 0.75], // the biggest rock of each, as a share of the size asked
    up: [0.95, 1.03],  // where on the band: just under the top to just over it
    shows: 0.35,       // their own showing: three quarters or so buried
  },
  // The slope's say, at its fullest.
  slope: {
    shows: [10, 50],   // degrees: on ground as level as the first as little shows as it gets; from the second, all that's asked
    fewer: 0.3,        // on level ground, "how much shows" counts for this share of itself in bringing spots in
    deeper: 0.5,       // ...and a rock there stands this share as far out
    lies: [12, 40],    // degrees: on ground as level as the first a rock lies flat with it; from the second, the grain asked for
    back: 0.45,        // how much further back over the top the rim's rock reaches (as place's `up`)
  },
  // Noise: a slow field along the edge.
  patchy: 0,           // how strongly rock gathers and thins along the edge: 0 an even sprinkle, 1 groups and gaps
  patch: 9,            // m: how long a stretch of more rock, or less, is
  patchRange: [3, 24],
  drift: 0,            // how far the grain's tilt wanders along the edge: 0 not at all, 1 as far as it goes
  // At full drift, how far each wanders either way (degrees), and how much
  // slower than the patches it does (in patch lengths).
  wander: { slant: 12, lean: 25, turn: 40, slower: 1.5 },
};

// What the slope says at a place on a land (the slope's say; `say`, 0 to
// 1, is how much of one it has): how much of what's asked shows there (0
// on level ground, 1 on steep); how flat a rock lies there; and its
// grain: the one asked ({ slant, lean, turn }), turned toward lying with
// the ground as the ground levels.
const NORMAL = new THREE.Vector3();
export function slopeSays(land, at, asked, say) {
  land.normalAt(at.x, at.z, NORMAL);
  const steep = radToDeg(Math.acos(clamp(NORMAL.y, -1, 1)));
  const flat = say * (1 - smoothstep(steep, EDGE.slope.lies[0], EDGE.slope.lies[1]));
  const grain = orientation(asked.slant ?? 0, asked.lean ?? 0, asked.turn ?? 0);
  // (Lying with the ground: its top leans the way the ground falls, as far as the ground does.)
  if (flat > 0) grain.slerp(orientation(degToRad(steep), Math.atan2(NORMAL.z, NORMAL.x), asked.turn ?? 0), flat);
  return { steep, shows: smoothstep(steep, EDGE.slope.shows[0], EDGE.slope.shows[1]), flat, grain };
}

// The test land's band: how the rock falls away toward its ends (at the
// far end, with the band itself).
const TEST = {
  from: EDGE.from, to: EDGE.to,
  near: (x) => smoothstep(x, EDGE.from, EDGE.from + EDGE.taper),
  far: (x) => smoothstep(bandShare(x), 0.05, 0.75) * (1 - smoothstep(x, EDGE.to - 2, EDGE.to)),
};
// And on a land (land.js createLand): where its places are.
export const testBand = (land) => ({
  ...TEST,
  place: (x, up) => land.placeOn(x, up),
  out: (x, far) => ({ x, z: land.foot(x) + far }),
  apron: (x) => land.apronAt(x),
});
// How many of something there are along a band, for `most` along the
// test land's.
const alongBand = (band, most) => Math.max(1, Math.round((most * (band.to - band.from)) / (EDGE.to - EDGE.from)));

// The patches' field for these settings: (x) => -1 to 1, or null when
// there's no patchiness (the edge is then exactly as without it).
const patchesOf = ({ seed = 1, patchy = 0, patch = EDGE.patch } = {}) => (patchy > 0 ? { strong: clamp(patchy, 0, 1), field: slowField(seed, clamp(patch, EDGE.patchRange[0], EDGE.patchRange[1]), 1) } : null);

// How much shows at x along the edge: the slider's value, falling away to
// nothing toward each end (at the far end, with the band itself); and,
// with patches, more in some stretches and less in others.
function showing(x, shows, patches = null, band = TEST) {
  const near = band.near(x);
  const far = band.far(x);
  const even = clamp(shows, 0, 1) * near * far;
  return patches ? clamp(even * (1 + patches.strong * patches.field(x)), 0, 1) : even;
}
// (noise: { seed, patchy, patch }, the edge's own, for the patches.)
export const showsAt = (land, x, shows, noise = {}, band = TEST) => showing(x, shows, patchesOf(noise), band);

// How much fallen rock, or rim, there is at x: the slider's value, where
// rock shows above; less where little does.
const amountAt = (x, shows, amount, patches = null, band = TEST) => clamp(amount, 0, 1) * smoothstep(showing(x, shows, patches, band), 0.15, 0.6);

// The apron for these settings, for the land (land.js createLand): how tall
// the bank of fallen rock is at x. (seed, patchy, patch: the edge's own, so
// the bank lies under the rock.)
export function apronFor({ shows = 0.6, fallen = EDGE.fallen, seed = 1, patchy = 0, patch = EDGE.patch } = {}) {
  const patches = patchesOf({ seed, patchy, patch });
  return (x) => EDGE.apron * amountAt(x, shows, fallen, patches);
}

// A spot's place up the band (0 its foot, 1 its top) and the number at
// which it comes in, from its rank and its own draws r (r[1] to r[3]).
export function spotDraws(rank, r) {
  let up;
  if (rank === 'big') up = lerp(EDGE.big.up[0], EDGE.big.up[1], r[1]);
  else if (rank === 'mid') up = r[2] < 0.5 ? lerp(EDGE.mid.low[0], EDGE.mid.low[1], r[1]) : lerp(EDGE.mid.high[0], EDGE.mid.high[1], r[1]);
  else up = r[2] < EDGE.small.onFace ? lerp(EDGE.small.face[0], EDGE.small.face[1], r[1]) : lerp(EDGE.small.foot[0], EDGE.small.foot[1], r[1]);
  const [from, to] = EDGE[rank].comes;
  return { up, comes: Math.max(lerp(from, to, r[3]), clamp((up - EDGE.reach[0]) / EDGE.reach[1], 0, 0.93)) };
}

// The spots of an edge with `count` big clusters: each with its rank, how
// far along (x) and up the band (up) it is, the number at which it comes
// in, and its own draws. Drawn in a fixed order from the seed. from, to:
// the band's two ends (the test land's, unless given).
export function spotsOf(seed, count = EDGE.spots, uneven = EDGE.uneven, from = EDGE.from, to = EDGE.to) {
  const random = mulberry32((seed | 0) * 6151 + 29);
  const length = to - from;
  const spots = [];
  const along = (i, n, r) => from + ((i + 0.5 + (r - 0.5) * clamp(uneven, 0, 1)) / n) * length;
  const add = (rank, i, n) => {
    const r = Array.from({ length: 8 }, () => random());
    const x = along(i, n, r[0]);
    spots.push({ id: `${rank} ${i}`, rank, index: i, x, ...spotDraws(rank, r), r });
  };
  for (let i = 0; i < count; i++) add('big', i, count);
  const mids = Math.round(count * EDGE.mids);
  for (let i = 0; i < mids; i++) add('mid', i, mids);
  const smalls = Math.round(count * EDGE.smalls);
  for (let i = 0; i < smalls; i++) add('small', i, smalls);
  return spots;
}

const RANK = { big: 0, mid: 1, small: 2 };

// Fallen rock at the foot of an edge: loose whole rocks of its kind, every
// which way, on the land's apron and out past it; many small and few big,
// the bigger lower and farther out; fresher than the face. Strewn into
// `rocks` (bedded against the ones near them, and added to them). Gives
// how many were left out. Its settings are the edge's own; noise: its
// { seed, patchy, patch }, so fallen rock lies under the rock. band: the
// band it lies at the foot of; others: rocks already on the land (another
// edge's), to be bedded against too.
export function strewFallen(land, rocks, settings = {}) {
  const steps = fallenSteps(land, rocks, settings);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
// The same, a rock at a time: it hands over each rock as it's placed.
function* fallenSteps(land, rocks, {
  seed = 1, shows = 0.6, fallen = 0, size = 2.5, kind = 'granite', age = 0, thick, least = BED.least, under = BED.under, noise = {},
  band = testBand(land), others = NONE,
} = {}) {
  if (!(fallen > 0)) return 0;
  const patches = patchesOf(noise);
  const length = band.to - band.from;
  const hit = (x, z, reach) => (o) => o.max[0] > x - reach && o.min[0] < x + reach && o.max[2] > z - reach && o.min[2] < z + reach;
  const nearTo = (x, z, reach) => (others.length ? [...others.filter(hit(x, z, reach)), ...rocks.filter(hit(x, z, reach))] : rocks.filter(hit(x, z, reach)));
  let left = 0;
  const random = mulberry32((seed | 0) * 6151 + 131);
  const { size: sizes, power, age: fresher, alone, shows: own, held } = EDGE.talus;
  const most = alongBand(band, EDGE.talus.most);
  const loose = [];
  for (let j = 0; j < most; j++) {
    const r = Array.from({ length: 9 }, () => random());
    const x = band.from + ((j + r[0]) / most) * length;
    if (amountAt(x, shows, fallen, patches, band) <= r[2]) continue;
    const rank = r[1] ** power; // 0 the smallest, 1 the biggest
    loose.push({ j, x, r, rank, long: size * lerp(sizes[0], sizes[1], rank) * (band.grade ? band.grade(x) : 1) });
  }
  // Big first: the small ones then lie against them.
  loose.sort((a, b) => b.long - a.long || a.j - b.j);
  for (const { j, x, r, rank, long } of loose) {
    // How far down the bank: 0 its top, against the face; 1 its toe;
    // past 1, out on the meadow. The bigger, the lower. (A band with no
    // bank of its own: as far out as a bank would have run.)
    const bank = band.apron ? band.apron(x) : EDGE.apron * (band.scale ?? 1) * amountAt(x, shows, fallen, patches, band);
    const run = bank / (land.repose ?? REPOSE) + 0.4;
    const down = r[4] < alone ? 1.15 + 0.5 * r[3] : clamp(0.1 + 0.8 * rank ** 0.7 + (r[3] - 0.5) * 0.35, 0.02, 1.1);
    const at = band.out(x, down * run);
    // Any way up: a turn drawn evenly from them all.
    const [u1, u2, u3] = [r[5], r[6] * Math.PI * 2, r[7] * Math.PI * 2];
    const q = new THREE.Quaternion(Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3));
    const shape = shapeOf(kind)({ seed: (seed | 0) * 7919 + j * 13 + 5, size: long, age: clamp((age ?? 0) * fresher, 0, 1), thick });
    const rock = bedRock(shape, land, {
      x: at.x, z: at.z, q, shows: own, least, under, held,
      seat: r[8] < 0.5 ? 'rocks' : 'land',
      neighbours: nearTo(at.x, at.z, 2 * long + 1),
    });
    if (rock.hidden) {
      left++;
      continue;
    }
    rock.role = 'fallen';
    rock.part = 'fallen';
    rock.spot = `fallen ${j}`;
    rocks.push(rock);
    yield [rock];
  }
  return left;
}

// The edge on this land. Its settings: seed; shows (the one slider); spots
// and uneven (EDGE's); and the cluster's own (cluster.js): size (m: the
// biggest rocks' length), age, thick, pieces, mix, noise, cross, slant,
// lean, turn, least, under. fallen and rim, 0 to 1: how much fallen rock
// lies at the foot, and how much rock stands at the lip (the land should
// have been made with apronFor's apron for the same settings). patchy,
// patch and drift: the noise (EDGE's).
//
// band: the band it's laid along (the test land's own, unless given);
// others: rocks already on the land (another edge's), to be bedded
// against too. slope, 0 to 1: how much say the land's steepness has in
// how much shows and how the rock lies.
//
// Gives { rocks, clusters, spots, left, list }: every rock in place; the
// clusters placed (each with its spot and its rocks); how many spots there
// are and how many have a cluster; how many rocks were left out; and the
// list of whole rocks it is. Also face, lip and loose: how many of the
// rocks are the face's, the rim's and the fallen ones.
export function makeEdge(land, settings = {}) {
  const steps = edgeSteps(land, settings);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// The same edge, a cluster at a time: it hands over the rocks of each
// cluster as it's placed (so a page can draw them, and stay alive, while
// a long edge is made), and gives what makeEdge gives when it's done.
export function* edgeSteps(land, {
  seed = 1, shows = 0.6, spots = EDGE.spots, uneven = EDGE.uneven, size = 2.5, pieces = CLUSTER.pieces,
  least = BED.least, under = BED.under, fallen = 0, rim = 0, patchy = EDGE.patchy, patch = EDGE.patch, drift = EDGE.drift,
  band = testBand(land), others = NONE, slope = 0,
  ...cluster
} = {}) {
  const say = clamp(slope, 0, 1);
  // The noise: where rock gathers and thins, and how the grain wanders.
  const patches = patchesOf({ seed, patchy, patch });
  const far = clamp(drift, 0, 1);
  const slow = clamp(patch, EDGE.patchRange[0], EDGE.patchRange[1]) * EDGE.wander.slower;
  const wander = far > 0 ? ['slant', 'lean', 'turn'].map((_, i) => slowField(seed, slow, 2 + i)) : null;
  const rad = Math.PI / 180;
  // The grain at x: the one asked, wandered by the drift; and turned
  // with the band, where the band is turned from the test land's (the
  // whole grain, about the vertical: granite.js orientation).
  const wandered = (x) => (wander ? {
    slant: clamp((cluster.slant ?? 0) + far * EDGE.wander.slant * rad * wander[0](x), 0, 45 * rad),
    lean: (cluster.lean ?? 0) + far * EDGE.wander.lean * rad * wander[1](x),
    turn: (cluster.turn ?? 0) + far * EDGE.wander.turn * rad * wander[2](x),
  } : {});
  const grainAt = (x) => {
    const grain = wandered(x);
    if (!band.facing) return grain;
    const round = band.facing(x);
    return { ...grain, lean: (grain.lean ?? cluster.lean ?? 0) - round, turn: (grain.turn ?? cluster.turn ?? 0) + round };
  };
  // What the slope says at a place, x along the band.
  const slopeAt = (x, at) => slopeSays(land, at, { slant: cluster.slant ?? 0, lean: cluster.lean ?? 0, turn: cluster.turn ?? 0, ...grainAt(x) }, say);
  const [fewest, most] = band.spotsRange ?? EDGE.spotsRange;
  const all = spotsOf(seed, clamp(Math.round(spots), fewest, most), uneven, band.from, band.to);
  const hit = (x, z, reach) => (o) => o.max[0] > x - reach && o.min[0] < x + reach && o.max[2] > z - reach && o.min[2] < z + reach;
  // Big first; within a rank, from the foot up.
  const order = [...all].sort((a, b) => RANK[a.rank] - RANK[b.rank] || a.up - b.up || a.index - b.index);

  const rocks = [];
  const clusters = [];
  let left = 0;
  const shown = [];   // the spots that are in, at this showing
  for (const spot of order) {
    const asked = showing(spot.x, shows, patches, band);
    if (asked <= spot.comes) continue;
    const at = band.place(spot.x, spot.up);
    // (The slope's say: on gentler ground less of what's asked counts.)
    const lie = say > 0 ? slopeAt(spot.x, at) : null;
    const here = lie ? asked * lerp(1, lerp(EDGE.slope.fewer, 1, lie.shows), say) : asked;
    if (here <= spot.comes) continue;
    shown.push(spot.id);
    const { rank, r } = spot;
    const big = size * lerp(EDGE[rank].size[0], EDGE[rank].size[1], r[4]) * (band.grade ? band.grade(spot.x) : 1);
    const many = rank === 'small' ? Math.min(pieces, 1 + Math.floor(r[5] * 3)) : Math.max(1, Math.round(pieces * EDGE[rank].pieces));
    const reach = EDGE.near * big + 1;
    const made = makeCluster(land, {
      ...cluster, ...grainAt(spot.x),
      x: at.x, z: at.z,
      seed: (seed | 0) * 977 + spot.index * 31 + RANK[rank] * 7 + 3,
      size: big, pieces: many, least, under,
      // (A rock stands further out the more shows there; and on gentler
      // ground, with the slope's say, less far.)
      shows: lie ? lerp(EDGE.least, 1, here) * lerp(1, lerp(EDGE.slope.deeper, 1, lie.shows), say) : lerp(EDGE.least, 1, here),
      ...(lie ? { grain: lie.grain, flat: lie.flat } : {}),
      neighbours: others.length ? [...others.filter(hit(at.x, at.z, reach)), ...rocks.filter(hit(at.x, at.z, reach))] : rocks.filter(hit(at.x, at.z, reach)),
    });
    left += made.left;
    if (!made.rocks.length) continue;
    for (const rock of made.rocks) rock.spot = spot.id;
    rocks.push(...made.rocks);
    clusters.push({ spot, rocks: made.rocks });
    yield made.rocks;
  }
  const face = rocks.length;
  const nearTo = (x, z, reach) => (others.length ? [...others.filter(hit(x, z, reach)), ...rocks.filter(hit(x, z, reach))] : rocks.filter(hit(x, z, reach)));
  const length = band.to - band.from;

  // The rim: blocks and small groups along the lip, deep in the meadow.
  if (rim > 0) {
    const random = mulberry32((seed | 0) * 6151 + 257);
    const { size: sizes, up, shows: own } = EDGE.lip;
    const blocks = alongBand(band, EDGE.lip.most);
    for (let k = 0; k < blocks; k++) {
      const r = Array.from({ length: 6 }, () => random());
      const x = band.from + ((k + r[0]) / blocks) * length;
      if (amountAt(x, shows, rim, patches, band) <= r[2]) continue;
      // (With the slope's say the rim reaches further back over the top,
      // and its rock lies as the ground there does.)
      const at = band.place(x, lerp(up[0], say > 0 ? up[1] + EDGE.slope.back * say : up[1], r[1]));
      const lie = say > 0 ? slopeAt(x, at) : null;
      const big = size * lerp(sizes[0], sizes[1], r[3]) * (band.grade ? band.grade(x) : 1);
      const made = makeCluster(land, {
        ...cluster, ...grainAt(x),
        x: at.x, z: at.z, seed: (seed | 0) * 977 + k * 37 + 211,
        size: big, pieces: Math.min(pieces, 1 + Math.floor(r[4] * 3)), least, under, shows: own,
        ...(lie ? { grain: lie.grain, flat: lie.flat } : {}),
        neighbours: nearTo(at.x, at.z, EDGE.near * big + 1),
      });
      left += made.left;
      for (const rock of made.rocks) {
        rock.spot = `rim ${k}`;
        rock.part = 'rim';
      }
      rocks.push(...made.rocks);
      if (made.rocks.length) yield made.rocks;
    }
  }
  const lip = rocks.length - face;

  // The fallen rock, on the apron and out past it.
  left += yield* fallenSteps(land, rocks, {
    seed, shows, fallen, size, kind: cluster.kind, age: cluster.age, thick: cluster.thick, least, under,
    noise: { seed, patchy, patch }, band, others,
  });
  const fell = rocks.length - face - lip;

  return {
    rocks, clusters, spots: { all: all.length, shown: shown.length, placed: clusters.length, ids: shown },
    face, lip, loose: fell, left, list: rocks.map(entryOf), seed, size,
  };
}
