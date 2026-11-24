import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { slowField2 } from './field.js';

// A small land of hills, stepped by hard beds: a land made first, and the
// places where cliffs belong found in it.
//
// - Hills by rule: a few rounded hills in a plain, each its own small
//   part: a place, a length, a width, a turn and a height, by the seed.
//   The first is the big one; the rest are smaller, and stand apart from
//   it or on its sides. Where two overlap they run together, to a
//   shoulder or a ridge, a little higher than either.
// - Steps from hard beds: a few hard beds lie through the hills, one
//   above another. The foot of each is a flat sheet, level or tilted.
//   Where a hillside reaches a bed, the ground rises by the bed's
//   thickness over a short way: a steep band. Between beds it keeps the
//   hills' own gentle slope. So a hill has steep bands running round it;
//   and with the beds tilted, the bands climb across. A band is steepest
//   where the hillside is, and fades out where the hillside flattens.
// - Bands come and go: a bed is thick here and thin there, so its band
//   is tall on this side of a hill and gone on that, as cliffs are.
// - The bands are known, not searched for: each is where the land
//   reaches a bed. bandsOf traces each one's foot as runs of points, and
//   says how steep and how tall the band is along them.
//
// One height function, as the test land's: the drawn ground and every
// rock read it.
//
// x and z across the land, its middle at the origin; y up.

const { degToRad, radToDeg, clamp, lerp, smoothstep } = THREE.MathUtils;

export const HILLS = {
  size: 80,            // m across
  count: 4,            // how many hills
  countRange: [1, 6],
  hilly: 5,            // m: how tall the big hill is before its steps
  hillyRange: [2, 12],
  beds: 2,             // how many hard beds lie through them
  bedsRange: [1, 4],
  tall: 5,             // m: how tall a steep band is, where its bed is at its thickest
  tallRange: [2, 9],
  steep: 60,           // degrees: how steep a band is, on a hillside of the usual slope
  steepRange: [40, 75],
  uneven: 0.5,         // how much a bed thins: 0 as thick all over, 1 gone from most of the land
  unevenLength: 32,    // m: how long a thick part, or a thin one, is
  tilt: 0,             // degrees: how far the beds are tilted
  tiltRange: [0, 12],
  toward: 30,          // degrees round from +x: the way the beds rise
  // the hills
  big: [0.25, 0.3],    // the big hill's half length, as a share of the land
  small: [0.13, 0.2],  // the others'
  stretch: [1, 1.25],  // how many times longer than wide a hill is
  share: [0.8, 1.15],  // how tall a hill is for its length, beside the big one
  wobble: 0.12,        // how far a hill's outline wanders off an oval
  // (Hills that overlap run together by their cubes: where one is much
  // the taller it wins, where they're alike the two make a little more.)
  wobbleLength: 15,    // m: how long a wander is
  edge: 2,             // m: no hill comes nearer the land's edge
  // the beds
  low: 0.33, high: 0.77, // where the lowest and the highest bed lie, as shares of the big hill's height
  stray: 0.05,           // how far a bed strays from its place, the same way
  // the bands
  usual: 0.35,         // the usual hillside's slope (rise over run): a steeper one makes a steeper band
  round: 0.5,          // how much of a band's rise is rounded off, at its foot and at its top
  cliff: 35,           // degrees: a band at least this steep is where a cliff would stand,
  lowest: 1.5,         // m: if it's at least this tall,
  shortest: 6,         // m: and at least this long
};

// max(0, x), its corner rounded over r.
const bend = (x, r) => (x <= -r / 2 ? 0 : x >= r / 2 ? x : ((x + r / 2) ** 2) / (2 * r));
// From 0 to 1 as u goes from -0.5 to 0.5, straight in the middle, its ends
// rounded: a band's rise.
const rise = (u) => bend(u + 0.5, HILLS.round) - bend(u - 0.5, HILLS.round);

// The hills of a seed: every one is drawn, in the same order, whatever the
// sliders say, so one more hill leaves the others where they were.
function hillsOf(seed) {
  const random = mulberry32((seed | 0) * 7919 + 61);
  const half = HILLS.size / 2;
  let biggest = 0;
  return Array.from({ length: HILLS.countRange[1] }, (_, i) => {
    const [r0, r1, r2, r3, r4, r5] = [random(), random(), random(), random(), random(), random()];
    const first = i === 0;
    const long = HILLS.size * (first ? lerp(HILLS.big[0], HILLS.big[1], r0) : lerp(HILLS.small[0], HILLS.small[1], r0));
    if (first) biggest = long;
    const short = long / lerp(HILLS.stretch[0], HILLS.stretch[1], r1);
    const turn = Math.PI * r2;
    // (Its place leaves room for all of it inside the land.)
    const room = Math.max(half - HILLS.edge - long * (1 + HILLS.wobble), 0);
    return {
      x: (2 * r3 - 1) * room, z: (2 * r4 - 1) * room,
      long, short, cos: Math.cos(turn), sin: Math.sin(turn),
      // (A shorter hill is a lower one: all the hills are about as steep.)
      share: first ? 1 : (long / biggest) * lerp(HILLS.share[0], HILLS.share[1], r5),
    };
  });
}

// The land for these settings: heightAt(x, z), normalAt, slopeAt, and its
// hard beds. seed; count (how many hills); hilly (m); beds (how many);
// tall (m) and steep (degrees): a band's; uneven (0 to 1): how much a bed
// thins; tilt and toward (degrees): the beds'.
export function createHills({
  seed = 1, count = HILLS.count, hilly = HILLS.hilly, beds = HILLS.beds, tall = HILLS.tall, steep = HILLS.steep, uneven = HILLS.uneven,
  tilt = HILLS.tilt, toward = HILLS.toward,
} = {}) {
  const half = HILLS.size / 2;
  const hills = hillsOf(seed).slice(0, clamp(Math.round(count), HILLS.countRange[0], HILLS.countRange[1]));
  const wander = slowField2(seed, HILLS.wobbleLength, 21);
  const strays = mulberry32((seed | 0) * 7919 + 167);
  const layers = clamp(Math.round(beds), HILLS.bedsRange[0], HILLS.bedsRange[1]);

  // The hills before their steps: each a rounded mound over an oval, its
  // outline wandering a little; where they overlap they run together
  // (so a hillside is never much steeper than a hill's own).
  function hillsAt(x, z) {
    const wide = 1 + HILLS.wobble * wander(x, z);
    let sum = 0;
    for (let i = 0; i < hills.length; i++) {
      const hill = hills[i];
      const dx = x - hill.x, dz = z - hill.z;
      const along = (dx * hill.cos + dz * hill.sin) / hill.long;
      const across = (dz * hill.cos - dx * hill.sin) / hill.short;
      const out = (along * along + across * across) * wide * wide;
      if (out < 1) {
        const mound = hill.share * (1 - out) * (1 - out);
        sum += mound * mound * mound;
      }
    }
    return sum > 0 ? hilly * Math.cbrt(sum) : 0;
  }
  // How far the tilted beds have risen at (x, z), from the land's middle.
  // (On their low side they level out before they'd go under the plain:
  // a bed is met on the hills, never out on the flat. `sunk` is set
  // below, with the beds.)
  const slope = Math.tan(degToRad(clamp(tilt, 0, 45)));
  const [tx, tz] = [slope * Math.cos(degToRad(toward)), slope * Math.sin(degToRad(toward))];
  let sunk = 0;
  const tiltAt = (x, z) => (slope ? bend(tx * x + tz * z + sunk, 1) - sunk : 0);
  // A place's height among the beds: the hills' own, less the beds' rise.
  const amongBeds = (x, z) => hillsAt(x, z) - tiltAt(x, z);

  // The hard beds, from the lowest: how high among the beds each one's
  // foot is, with every bed below it at its thickest. (Every one is
  // drawn, whatever the sliders say.)
  const feet = Array.from({ length: HILLS.bedsRange[1] }, () => strays()).slice(0, layers).map((r, k) => {
    const share = layers === 1 ? HILLS.low : lerp(HILLS.low, HILLS.high, k / (layers - 1));
    return hilly * (share + HILLS.stray * (2 * r - 1)) + k * tall;
  });
  sunk = 0.5 * (feet[0] ?? 0); // (the lowest bed stays half its height above the plain)
  // How thick bed k is at (x, z), m: `tall` at its thickest, and thinner,
  // or gone, where its own slow field is low.
  const thins = feet.map((_, k) => slowField2(seed, HILLS.unevenLength, 30 + k));
  const gone = lerp(-0.3, 0.7, clamp(uneven, 0, 1)); // (its field runs from 0 to 1, mostly about the middle)
  const thickAt = (k, x, z) => (uneven <= 0 ? tall : tall * smoothstep(0.5 + 0.5 * thins[k](x, z), gone, gone + 0.3));

  // How far the beds below bed `upTo` have lifted (x, z). A bed lifts
  // the ground that reaches its foot by its thickness, while the hills'
  // own height rises a set way (`span` to each metre of thickness): as
  // much as makes the band `steep` on a hillside of the usual slope. On
  // a steeper hillside that way is shorter along the ground, and the
  // band steeper; on a gentle one it is long, and the band fades out; on
  // a flat place there is no step. Where two beds lie so near that the
  // land reaches the next before it's done rising through this one, the
  // next band begins where this one ends: the two stand as one taller
  // band.
  //
  // It's worked out in the hills' own height among the beds. It also
  // sets `gap`: how far above bed `upTo`'s foot the place is, in that
  // height (below nothing: it hasn't reached it).
  const face = Math.tan(degToRad(clamp(steep, 10, 85)));
  const span = HILLS.usual / Math.max(face - HILLS.usual, 0.1);
  const below = (HILLS.round / 2) * tall * span + 1e-9; // how far under its foot a band's rounded rise begins, at most
  let gap = 0;
  function lifted(x, z, upTo, among = amongBeds(x, z)) {
    let lift = 0;        // by the beds so far
    let whole = 0;       // what they'd lift a place they'd wholly lifted
    let end = -Infinity; // where the band below is done rising
    for (let k = 0; k < feet.length && k <= upTo; k++) {
      let start = feet[k] - whole;
      // (Below where this bed's band begins to rise, and so below those
      // above it.)
      if (among <= start - below) { gap = among - start; return lift; }
      start = Math.max(start, end);
      if (k === upTo) { gap = among - start; return lift; }
      const thick = thickAt(k, x, z);
      if (thick > 0) {
        const over = thick * span;
        lift += thick * rise((among - start) / over - 0.5);
        end = start + over;
        whole += thick;
      }
    }
    gap = 0;
    return lift;
  }
  // How far above bed k's foot (x, z) is, in the hills' own height: the
  // band's foot runs where it's nothing.
  function aboveFoot(k, x, z) {
    lifted(x, z, k);
    return gap;
  }

  // (The place's height among the beds is worked out once, and handed on.)
  const heightAt = (x, z) => {
    const among = amongBeds(x, z);
    return among + lifted(x, z, feet.length, among) + tiltAt(x, z);
  };
  function normalAt(x, z, out = new THREE.Vector3()) {
    const E = 0.1;
    const dx = (heightAt(x + E, z) - heightAt(x - E, z)) / (2 * E);
    const dz = (heightAt(x, z + E) - heightAt(x, z - E)) / (2 * E);
    return out.set(-dx, 1, -dz).normalize();
  }
  const slopeAt = (x, z) => radToDeg(Math.acos(clamp(normalAt(x, z).y, -1, 1)));
  // The height of bed k's foot at (x, z): a flat sheet, level or tilted
  // (and where it's tilted, levelling out on its low side). Its band
  // begins there, but where it stands on the band below.
  const bedAt = (k, x, z) => feet[k] + tiltAt(x, z);
  // How bare the rock is at (x, z), and which kind, as a land hands it
  // over (landIn.js): bare on a bed's band, from its foot to its top,
  // wherever the bed is as thick as the lowest cliff (thinner, the soil
  // creeps over it); under soil everywhere else. A low band is bare rock
  // all the same: how big its rock is follows how tall it is. The hills'
  // beds are granite.
  function rockAt(x, z) {
    let bare = 0;
    for (let k = 0; k < feet.length; k++) {
      const thick = thickAt(k, x, z);
      if (!(thick > 0)) continue;
      const above = aboveFoot(k, x, z);
      if (above >= 0 && above <= thick * span) bare = Math.max(bare, Math.min(thick / HILLS.lowest, 1));
    }
    return { bare, kind: 'granite' };
  }

  const size = { x0: -half, x1: half, z0: -half, z1: half };
  return {
    seed, hilly, tall, steep, uneven, tilt, toward, size, hills, feet, span,
    heightAt, normalAt, slopeAt, hillsAt, amongBeds, aboveFoot, thickAt, bedAt, rockAt,
  };
}

// The steep bands of a land of hills, traced along their feet. One band
// to a hard bed. Its runs are unbroken lines of points [x, z] along the
// foot; each piece of a run (from one point to the next) has how steep
// the band is above it (degrees), how tall (m), and whether a cliff would
// stand there. Its stretches are the unbroken lengths where one would:
// what a cliff is to be laid along. step: how finely it's traced (m).
export function bandsOf(land, step = 1) {
  const { x0, x1, z0, z1 } = land.size;
  const nx = Math.round((x1 - x0) / step);
  const nz = Math.round((z1 - z0) / step);
  const at = (i, j) => j * (nx + 1) + i;

  // How steep the band above (x, z) is: the steepest the land gets going
  // straight up the slope from there, as far as a band reaches.
  const up = new THREE.Vector3();
  const steepAbove = (x, z) => {
    let most = 0;
    let [px, pz] = [x, z];
    for (let i = 0; i < 8; i++) {
      land.normalAt(px, pz, up);
      most = Math.max(most, radToDeg(Math.acos(clamp(up.y, -1, 1))));
      const flat = Math.hypot(up.x, up.z);
      if (flat < 1e-4) break;
      px -= (up.x / flat) * 0.5;
      pz -= (up.z / flat) * 0.5;
    }
    return most;
  };

  return land.feet.map((foot, bed) => {
    // At every corner of a grid: how far above this bed's foot the land
    // is. The band's foot runs where that is nothing.
    const above = new Float64Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) above[at(i, j)] = land.aboveFoot(bed, x0 + i * step, z0 + j * step);

    // Marching squares. The line crosses a side of the grid where the
    // side's two ends lie either side of the foot; a side is named by its
    // lower corner and its way (0 along x, 1 along z), so the squares
    // either side of it agree on the crossing.
    const points = new Map();
    const crossing = (i, j, way) => {
      const [a, b] = [above[at(i, j)], way ? above[at(i, j + 1)] : above[at(i + 1, j)]];
      if ((a < 0) === (b < 0)) return null;
      const key = 2 * at(i, j) + way;
      if (!points.has(key)) {
        // (Halved in on the side until it's within a centimetre: on steep
        // ground a little off along the land is a lot off in height.)
        const spot = (t) => [x0 + (i + (way ? 0 : t)) * step, z0 + (j + (way ? t : 0)) * step];
        let [from, to] = [0, 1];
        for (let n = 0; n < 7; n++) {
          const mid = (from + to) / 2;
          if ((land.aboveFoot(bed, ...spot(mid)) < 0) === (a < 0)) from = mid;
          else to = mid;
        }
        points.set(key, spot((from + to) / 2));
      }
      return key;
    };
    const joins = new Map(); // a crossing → the crossings it's joined to
    const join = (a, b) => {
      for (const [from, to] of [[a, b], [b, a]]) {
        if (!joins.has(from)) joins.set(from, []);
        joins.get(from).push(to);
      }
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const cuts = [crossing(i, j, 0), crossing(i + 1, j, 1), crossing(i, j + 1, 0), crossing(i, j, 1)].filter((key) => key !== null);
        for (let c = 0; c + 1 < cuts.length; c += 2) join(cuts[c], cuts[c + 1]);
      }
    }

    // The crossings, joined end to end into runs: first the ones with an
    // end (at the land's edge), then the rings.
    const used = new Set();
    const walk = (start) => {
      const keys = [start];
      used.add(start);
      for (let here = start; ;) {
        const next = joins.get(here).find((key) => !used.has(key));
        if (next === undefined) break;
        used.add(next);
        keys.push(next);
        here = next;
      }
      return keys;
    };
    const lines = [];
    for (const [key, to] of joins) if (to.length === 1 && !used.has(key)) lines.push({ keys: walk(key), ring: false });
    for (const key of joins.keys()) {
      if (used.has(key)) continue;
      const keys = walk(key);
      lines.push({ keys: [...keys, keys[0]], ring: true });
    }

    let cliff = 0, gentle = 0;
    const stretches = [];
    const runs = lines.map(({ keys, ring }) => {
      let spots = keys.map((key) => points.get(key));
      const middle = (i) => [(spots[i][0] + spots[i + 1][0]) / 2, (spots[i][1] + spots[i + 1][1]) / 2];
      let steep = spots.slice(1).map((_, i) => steepAbove(...middle(i)));
      let tall = spots.slice(1).map((_, i) => land.thickAt(bed, ...middle(i)));
      const cliffAt = (i) => steep[i] >= HILLS.cliff && tall[i] >= HILLS.lowest;
      // (A ring is begun where no cliff stands, if anywhere, so that no
      // stretch of cliff is cut in two by where the ring happens to begin.)
      const gap = ring ? steep.findIndex((_, i) => !cliffAt(i)) : -1;
      if (gap > 0) {
        const once = spots.slice(0, -1);
        spots = [...once.slice(gap), ...once.slice(0, gap), once[gap]];
        steep = [...steep.slice(gap), ...steep.slice(0, gap)];
        tall = [...tall.slice(gap), ...tall.slice(0, gap)];
      }
      const lengths = spots.slice(1).map((b, i) => Math.hypot(b[0] - spots[i][0], b[1] - spots[i][1]));
      const stands = steep.map((_, i) => cliffAt(i));
      // The unbroken lengths steep and tall enough. One too short is no cliff.
      for (let i = 0; i < stands.length;) {
        if (!stands[i]) { i++; continue; }
        let end = i;
        let length = 0;
        while (end < stands.length && stands[end]) length += lengths[end++];
        if (length < HILLS.shortest) stands.fill(false, i, end);
        else stretches.push({ points: spots.slice(i, end + 1), length });
        i = end;
      }
      const length = lengths.reduce((sum, l) => sum + l, 0);
      const standing = lengths.reduce((sum, l, i) => sum + (stands[i] ? l : 0), 0);
      cliff += standing;
      gentle += length - standing;
      return { points: spots, ring, steep, tall, stands, length };
    });
    return { bed, foot, runs, stretches, cliff, gentle };
  });
}

// The bands' feet marked on the land, for the page: a low kerb along each
// (a strip standing on the ground, and a flat one along its top, so it
// shows from the side and from above): dark where a cliff would stand,
// pale where the band is too gentle or too low.
export function bandMarks(land, bands, { wide = 0.4, high = 0.4 } = {}) {
  const position = [];
  const color = [];
  const dark = new THREE.Color(0x7a2418);
  const pale = new THREE.Color(0xd9cfa8);
  for (const band of bands) {
    for (const run of band.runs) {
      for (let i = 0; i + 1 < run.points.length; i++) {
        const [a, b] = [run.points[i], run.points[i + 1]];
        const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
        const length = Math.hypot(dx, dz) || 1;
        const [sx, sz] = [(-dz / length) * wide / 2, (dx / length) * wide / 2];
        const [ya, yb] = [land.heightAt(a[0], a[1]), land.heightAt(b[0], b[1])];
        // standing
        const [a0, a1, b0, b1] = [[a[0], ya - 0.3, a[1]], [a[0], ya + high, a[1]], [b[0], yb - 0.3, b[1]], [b[0], yb + high, b[1]]];
        // lying along its top
        const [c0, c1, d0, d1] = [
          [a[0] - sx, ya + high, a[1] - sz], [a[0] + sx, ya + high, a[1] + sz],
          [b[0] - sx, yb + high, b[1] - sz], [b[0] + sx, yb + high, b[1] + sz],
        ];
        position.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1, ...c0, ...d0, ...d1, ...c0, ...d1, ...c1);
        const tint = run.stands[i] ? dark : pale;
        for (let v = 0; v < 12; v++) color.push(tint.r, tint.g, tint.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'bands';
  return mesh;
}
