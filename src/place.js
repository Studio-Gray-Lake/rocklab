import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { EDGE, slopeSays } from './edge.js';
import { LAND_ROCK } from './landRock.js';
import { CLUSTER, entryOf, makeCluster } from './cluster.js';
import { BED, bedRock } from './bed.js';
import { shapeOf } from './kinds.js';
import { slowField2 } from './field.js';
import { LAND_DEFAULTS } from './land.js';
import { landIn } from './landIn.js';
import { SPOTS, cellSpots, gradeOf, upFrom } from './spots.js';

// The land's rock, laid by place: any rectangle of land comes out the
// same, whichever was made first, and a square made alone is the square
// made among its neighbours.
//
// What is laid, as along an edge (edge.js),
// each by its own place (spots.js):
// - the clusters along the feet of the steep ground, big, middling and
//   small; where no cliff stands (pale), only with the slope's say;
// - the rim: blocks along the top of a rise, deep in the ground behind;
// - fallen rock: loose whole rocks at the foot and out past it;
// - with the slope's say, stones strewn over the land off the feet, a few
//   to every cell of it, none on the level plain.
// The noise reads the world, not a line: where rock gathers and thins
// (patchy) and how the grain wanders (drift) are slow fields over the land.
//
// Neighbours by place. Everything laid has a fixed rank among all the
// rest: the clusters before the rim, the rim before the fallen rock, the
// fallen before the strewn stones; the big clusters before the middling,
// the middling before the small, and within a rank from the foot up; the
// bigger fallen rock first. Where two touch, the one that ranks first
// stands and the other is bedded against it. So what is laid at a place
// is made from what ranks before it near there, and from nothing else:
// near the edge of a rectangle the placer makes what lies just outside it
// too, to bed against, as it would be made there.

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const REPOSE = Math.tan(THREE.MathUtils.degToRad(35)); // where fallen rock comes to rest (as land.js)

export const PLACE = {
  far: 20,     // m: nothing laid lies further than this from the cell its foot is in
  spread: 1.5, // a thing's rocks lie within this many of its biggest rock's lengths of its place
  level: 2,    // degrees: ground gentler than this is the plain, with no stones strewn on it
  strewn: 8 * 8 / (LAND_ROCK.strewn.cell * LAND_ROCK.strewn.cell), // stones' places to a cell, as over the hills
};
const TIER = { face: 0, pale: 1, rim: 2, fallen: 3, strewn: 4 };
const RANK = { big: 0, mid: 1, small: 2 };

// A number of its own for each thing laid, from the seed and its name.
function seedOf(seed, id) {
  let h = Math.imul((seed | 0) ^ 0x2c1b3c6d, 0x297a2d39);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 1) % 2147483647;
}
// Which of two things laid ranks first.
function before(a, b) {
  for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] < b.rank[i];
  return a.id < b.id;
}
const order = (a, b) => (a === b ? 0 : before(a, b) ? -1 : 1);
const hit = (x, z, reach) => (o) => o.max[0] > x - reach && o.min[0] < x + reach && o.max[2] > z - reach && o.min[2] < z + reach;

// The placer for a land: it keeps what it has made, so squares asked for
// one after another share it. settings: as the land's cliffs take them
// (make.js cliffsOf): seed, shows, spots, uneven, size, pieces, least, under,
// fallen, rim, patchy, patch, drift, slope; kind, where the land doesn't
// say; and the cluster's own (age, thick, mix, noise, cross, slant, lean,
// turn).
export function placerFor(land, {
  seed = 1, shows = 0.6, spots = EDGE.spots, uneven = EDGE.uneven, size = LAND_ROCK.size, pieces = CLUSTER.pieces,
  least = BED.least, under = BED.under, fallen = 0, rim = 0, patchy = EDGE.patchy, patch = EDGE.patch, drift = EDGE.drift,
  slope = 0, kind = 'granite', ...cluster
} = {}) {
  const read = typeof land?.at === 'function' ? land : landIn(land, { kind });
  const say = clamp(slope, 0, 1);
  const { cell } = SPOTS;
  // The noise, over the land.
  const span = clamp(patch, EDGE.patchRange[0], EDGE.patchRange[1]);
  const patches = patchy > 0 ? { strong: clamp(patchy, 0, 1), field: slowField2(seed, span, 1) } : null;
  const far = clamp(drift, 0, 1);
  const wander = far > 0 ? [2, 3, 4].map((which) => slowField2(seed, span * EDGE.wander.slower, which)) : null;
  const rad = Math.PI / 180;
  const asked = { slant: cluster.slant ?? 0, lean: cluster.lean ?? 0, turn: cluster.turn ?? 0 };
  // The grain at a place: the one asked, wandered by the drift; and turned
  // as the rise there is turned from the test land's band.
  const grainAt = (x, z, facing) => {
    const grain = wander ? {
      slant: clamp(asked.slant + far * EDGE.wander.slant * rad * wander[0](x, z), 0, 45 * rad),
      lean: asked.lean + far * EDGE.wander.lean * rad * wander[1](x, z),
      turn: asked.turn + far * EDGE.wander.turn * rad * wander[2](x, z),
    } : {};
    if (facing === undefined) return grain;
    return { ...grain, lean: (grain.lean ?? asked.lean) - facing, turn: (grain.turn ?? asked.turn) + facing };
  };
  // How much shows above a foot: the slider's value (where no cliff
  // stands, as much less as the slope has say), as much as the rock there
  // is left, more in some patches and less in others.
  const showingAt = ({ foot, fall, pale }) => {
    const even = clamp(shows, 0, 1) * (pale ? say : 1) * fall;
    return patches ? clamp(even * (1 + patches.strong * patches.field(foot[0], foot[1])), 0, 1) : even;
  };
  const amountAt = (spot, amount) => clamp(amount, 0, 1) * smoothstep(showingAt(spot), 0.15, 0.6);
  const most = PLACE.spread * size; // the furthest any one thing's rocks reach

  // Each cell's things to lay: where they are, how far their rocks reach,
  // their rank, and how to make them against those that touch.
  const cells = new Map();
  function cellItems(cx, cz) {
    const key = `${cx},${cz}`;
    if (cells.has(key)) return cells.get(key);
    const items = [];
    const own = cellSpots(read, cx, cz, { seed, spots, uneven });

    for (const spot of own.face) {
      const showing = showingAt(spot);
      if (showing <= spot.comes) continue;
      const { at, rank, r } = spot;
      const grain = grainAt(spot.foot[0], spot.foot[1], spot.facing);
      // (The slope's say: on gentler ground less of what's asked counts.)
      const lie = say > 0 ? slopeSays(read, at, { ...asked, ...grain }, say) : null;
      const here = lie ? showing * lerp(1, lerp(EDGE.slope.fewer, 1, lie.shows), say) : showing;
      if (here <= spot.comes) continue;
      const big = size * lerp(EDGE[rank].size[0], EDGE[rank].size[1], r[4]) * spot.grade;
      const many = rank === 'small' ? Math.min(pieces, 1 + Math.floor(r[5] * 3)) : Math.max(1, Math.round(pieces * EDGE[rank].pieces));
      items.push({
        id: spot.id, part: 'face', pale: spot.pale, at, reach: PLACE.spread * big,
        rank: [spot.pale ? TIER.pale : TIER.face, RANK[rank], spot.up],
        make: (neighbours) => makeCluster(read, {
          ...cluster, ...grain, kind: spot.kind,
          x: at.x, z: at.z, seed: seedOf(seed, spot.id), size: big, pieces: many, least, under,
          shows: lie ? lerp(EDGE.least, 1, here) * lerp(1, lerp(EDGE.slope.deeper, 1, lie.shows), say) : lerp(EDGE.least, 1, here),
          ...(lie ? { grain: lie.grain, flat: lie.flat } : {}),
          neighbours,
        }),
      });
    }

    // The rim: blocks and small groups along the top of a rise, deep in the
    // ground behind (with the slope's say, further back over the top).
    if (rim > 0) {
      const { size: sizes, up, shows: deep } = EDGE.lip;
      for (const spot of own.rim) {
        const { r, foot, reading } = spot;
        if (amountAt(spot, rim) <= r[2]) continue;
        const at = upFrom(foot, reading, lerp(up[0], say > 0 ? up[1] + EDGE.slope.back * say : up[1], r[1]));
        const grain = grainAt(foot[0], foot[1], Math.atan2(-reading.up[0], -reading.up[1]));
        const lie = say > 0 ? slopeSays(read, at, { ...asked, ...grain }, say) : null;
        const big = size * lerp(sizes[0], sizes[1], r[3]) * gradeOf(reading, spot.pale);
        items.push({
          id: spot.id, part: 'rim', at, reach: PLACE.spread * big, rank: [TIER.rim, 0, 0],
          make: (neighbours) => makeCluster(read, {
            ...cluster, ...grain, kind: read.rockAt(at.x, at.z).kind,
            x: at.x, z: at.z, seed: seedOf(seed, spot.id), size: big, pieces: Math.min(pieces, 1 + Math.floor(r[4] * 3)),
            least, under, shows: deep,
            ...(lie ? { grain: lie.grain, flat: lie.flat } : {}),
            neighbours,
          }),
        });
      }
    }

    // Fallen rock: loose whole rocks every which way, on the bank at the
    // foot and out past it; many small and few big, the bigger lower and
    // farther out; fresher than the face above, and of its kind.
    if (fallen > 0) {
      const { size: sizes, power, age: fresher, alone, shows: loose, held } = EDGE.talus;
      for (const spot of own.fallen) {
        const { r, foot, reading } = spot;
        const amount = amountAt(spot, fallen);
        if (amount <= r[2]) continue;
        const rank = r[1] ** power; // 0 the smallest, 1 the biggest
        const long = size * lerp(sizes[0], sizes[1], rank) * gradeOf(reading, spot.pale);
        // How far down the bank: 0 its top, against the face; 1 its toe;
        // past 1, out on the meadow. The bank is as tall as there is
        // fallen rock, for a rise this tall beside the test land's.
        const bank = EDGE.apron * (reading.rise / LAND_DEFAULTS.height) * amount;
        const run = bank / REPOSE + 0.4;
        const down = r[4] < alone ? 1.15 + 0.5 * r[3] : clamp(0.1 + 0.8 * rank ** 0.7 + (r[3] - 0.5) * 0.35, 0.02, 1.1);
        const at = { x: foot[0] - reading.up[0] * down * run, z: foot[1] - reading.up[1] * down * run };
        const face = upFrom(foot, reading, 0.5);
        items.push({
          id: spot.id, part: 'fallen', at, reach: PLACE.spread * long, rank: [TIER.fallen, -long, 0],
          make: (neighbours) => {
            // Any way up: a turn drawn evenly from them all.
            const [u1, u2, u3] = [r[5], r[6] * Math.PI * 2, r[7] * Math.PI * 2];
            const q = new THREE.Quaternion(Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3));
            const shape = shapeOf(read.rockAt(face.x, face.z).kind)({ seed: seedOf(seed, spot.id), size: long, age: clamp((cluster.age ?? 0) * fresher, 0, 1), thick: cluster.thick });
            const rock = bedRock(shape, read, { x: at.x, z: at.z, q, shows: loose, least, under, held, seat: r[8] < 0.5 ? 'rocks' : 'land', neighbours });
            return rock.hidden ? { rocks: [], left: 1 } : { rocks: [rock], left: 0 };
          },
        });
      }
    }

    // The stones strewn over the land, off the feet (with the slope's
    // say): on a steeper slope more of them, standing further out; on a
    // gentle one fewer, deeper in; on a level top, low flat slabs. None on
    // the level plain, nor on ground as steep as a face.
    if (say > 0) {
      const { comes, counts, shows: stands, size: sizes, off } = LAND_ROCK.strewn;
      const random = mulberry32(seedOf(seed, `strewn ${key}`));
      const count = Math.floor(PLACE.strewn + random());
      const normal = new THREE.Vector3();
      for (let k = 0; k < count; k++) {
        const r = Array.from({ length: 6 }, () => random());
        const [x, z] = [(cx + r[0]) * cell, (cz + r[1]) * cell];
        read.normalAt(x, z, normal);
        const round = Math.atan2(normal.x, normal.z);
        const grain = grainAt(x, z);
        const lie = slopeSays(read, { x, z }, { slant: grain.slant ?? asked.slant, lean: (grain.lean ?? asked.lean) - round, turn: (grain.turn ?? asked.turn) + round }, say);
        if (lie.steep < PLACE.level || lie.steep > off) continue;
        const here = clamp(shows, 0, 1) * say * lerp(counts[0], counts[1], lie.shows);
        if (here <= lerp(comes[0], comes[1], r[2])) continue;
        const big = size * lerp(sizes[0], sizes[1], r[3]);
        const id = `strewn ${key} ${k}`;
        items.push({
          id, part: 'strewn', at: { x, z }, reach: PLACE.spread * big, rank: [TIER.strewn, 0, 0],
          make: (neighbours) => makeCluster(read, {
            ...cluster, kind: read.rockAt(x, z).kind,
            x, z, seed: seedOf(seed, id), size: big, pieces: Math.min(pieces, 1 + Math.floor(r[4] * LAND_ROCK.strewn.pieces)),
            shows: lerp(stands[0], stands[1], lie.shows), least, under, grain: lie.grain, flat: lie.flat,
            neighbours,
          }),
        });
      }
    }
    cells.set(key, items);
    return items;
  }

  // Every thing laid whose place is within r of (x, z).
  function itemsNear(x, z, r) {
    const found = [];
    for (let cz = Math.floor((z - r - PLACE.far) / cell); cz <= Math.floor((z + r + PLACE.far) / cell); cz++) {
      for (let cx = Math.floor((x - r - PLACE.far) / cell); cx <= Math.floor((x + r + PLACE.far) / cell); cx++) {
        for (const item of cellItems(cx, cz)) if (Math.hypot(item.at.x - x, item.at.z - z) <= r) found.push(item);
      }
    }
    return found;
  }

  // What a thing laid is, made: against everything that ranks before it
  // and could touch it (the two near enough for their rocks to meet), each
  // made the same way first.
  const made = new Map();
  function makeOf(item) {
    if (made.has(item.id)) return made.get(item.id);
    const first = itemsNear(item.at.x, item.at.z, item.reach + most)
      .filter((other) => before(other, item) && Math.hypot(other.at.x - item.at.x, other.at.z - item.at.z) <= item.reach + other.reach)
      .sort(order);
    const neighbours = first.flatMap((other) => makeOf(other).rocks).filter(hit(item.at.x, item.at.z, item.reach));
    const { rocks, left } = item.make(neighbours);
    for (const rock of rocks) {
      rock.spot = item.id;
      if (item.part !== 'face') rock.part = item.part;
      if (item.part === 'fallen') rock.role = 'fallen';
    }
    const result = { rocks, left };
    made.set(item.id, result);
    return result;
  }

  // The things laid in a rectangle, in their ranks.
  function itemsIn({ x0, x1, z0, z1 }) {
    const found = [];
    for (let cz = Math.floor((z0 - PLACE.far) / cell); cz <= Math.floor((z1 + PLACE.far) / cell); cz++) {
      for (let cx = Math.floor((x0 - PLACE.far) / cell); cx <= Math.floor((x1 + PLACE.far) / cell); cx++) {
        for (const item of cellItems(cx, cz)) if (item.at.x >= x0 && item.at.x < x1 && item.at.z >= z0 && item.at.z < z1) found.push(item);
      }
    }
    return found.sort(order);
  }

  return { read, itemsIn, makeOf, made };
}

// The rock of a rectangle of land { x0, x1, z0, z1 }, a thing at a time:
// it hands over { rocks, id, part, pale } as each is made, and gives
// { rocks, laid, left, list }: every rock; each thing laid with its rocks
// (pale: a cluster where no cliff stands); how many
// rocks were left out; the list of whole rocks. placer: placerFor's (one
// kept over many rectangles), or a land and its settings.
export function* placeSteps(placer, rect) {
  const rocks = [];
  const laid = [];
  let left = 0;
  for (const item of placer.itemsIn(rect)) {
    const made = placer.makeOf(item);
    left += made.left;
    if (!made.rocks.length) continue;
    rocks.push(...made.rocks);
    laid.push({ id: item.id, part: item.part, pale: !!item.pale, at: item.at, rocks: made.rocks });
    yield { rocks: made.rocks, id: item.id, part: item.part, pale: !!item.pale };
  }
  return { rocks, laid, left, list: rocks.map(entryOf) };
}

// The same, all at once. land: as handed over (or a placer, from placerFor).
export function placeOn(land, rect, settings = {}) {
  const placer = typeof land?.itemsIn === 'function' ? land : placerFor(land, settings);
  const steps = placeSteps(placer, rect);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
