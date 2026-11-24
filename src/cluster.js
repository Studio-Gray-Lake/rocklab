import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { GRANITE, orientation } from './granite.js';
import { shapeOf } from './kinds.js';
import { BED, bedRock, placeShape } from './bed.js';

// A cluster: a handful of whole rocks pushed into each other and into the
// land so they read as one mass.
//
// The pieces, as the workshop's amorphous boulder is laid out, in whole
// rocks instead of lumps:
// - one big rock carries the shape;
// - one at each end of it, along its length, reaching back into it;
// - a crest: one seated on top of it, half sunk into it, for a broken
//   skyline;
// - one against each flank;
// - small ones at its foot (downhill, on a slope), and in the crooks where
//   two rocks meet.
//
// One grain: every rock shares the cluster's slant, lean and turn, with
// its length along one of granite's three crack directions. `noise`
// loosens that, from rock in place (0) to a loose heap lying every which
// way (1).
//
// Built big first. Each rock is bedded against the land and the rocks
// already placed (bed.js), and one that would show only a sliver is left
// out.
//
// Steady under its sliders: every number a cluster needs is drawn first,
// from its seed, in one fixed order, for all twelve pieces it may have.
// `pieces` only says how many of them are used.
//
// What comes out is a list of whole rocks: each
// with a kind, a seed, a size, an age, a place and a turn, enough to make
// it again (rockFrom).

const { clamp, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;

export const CLUSTER = {
  // What each piece is, in the order they're added: so a few pieces are
  // already the big one with its ends and its crest, and more add the
  // flanks and the small ones.
  roles: ['big', 'end', 'end', 'crest', 'flank', 'foot', 'flank', 'foot', 'crook', 'foot', 'crook', 'foot'],
  // Each kind of piece's length, as a share of the big one's.
  sizes: { big: [1, 1], end: [0.5, 0.72], crest: [0.42, 0.6], flank: [0.45, 0.66], foot: [0.24, 0.4], crook: [0.22, 0.34] },
  pieces: 8,      // how many pieces, to start with
  mix: 0.5,       // the size mix: 0 toward small, 1 toward big
  noise: 0.15,    // 0 on the grain, 1 every which way
  cross: 0.35,    // how far a rock crosses its neighbour, as a share of its own size
  seated: 0.45,   // a crest or a crook rock: at least this share of it is in what it sits on
  touch: 0.06,    // a rock standing against another has at least this share of itself inside one
  tries: 6,       // ...moved in toward the big rock this many times at most to get there
  least: 0.08,    // m: no rock shorter than this
  level: 0.05,    // a slope gentler than this (its tangent) has no downhill for the foot rocks
};

// Every number a cluster of this seed needs: twelve a piece.
const drawn = new Map();
function draws(seed) {
  if (drawn.has(seed)) return drawn.get(seed);
  const random = mulberry32((seed | 0) * 9973 + 17);
  const pieces = CLUSTER.roles.map(() => Array.from({ length: 12 }, () => random()));
  drawn.set(seed, pieces);
  return pieces;
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const quarter = (axis) => new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2);

// The cluster at (x, z) on the land. Its settings: seed, size (m: its
// biggest rock's length), age, thick (granite.js's), pieces (1 to 12), mix,
// noise, cross (CLUSTER's), slant, lean, turn (radians: its grain), shows
// (how much shows, at most), least and under (bed.js's), and neighbours:
// rocks already there (another cluster's), to be bedded against too; and
// kind, the kind of rock (kinds.js). grain: its grain given whole (a
// turn), in place of slant, lean and turn. flat, 0 to 1: how far its
// rocks lie down with it (none stands on end, and granite's are thinner:
// slabs), for rock lying on level ground.
//
// Gives { rocks, left, list }: the rocks in place (bed.js's), how many were
// left out (too little of them would show, or they never met the others),
// and the list they are.
export function makeCluster(land, {
  x = 0, z = 0, seed = 1, size = 1.5, age = 0, thick, pieces = CLUSTER.pieces, mix = CLUSTER.mix, noise = CLUSTER.noise,
  cross = CLUSTER.cross, slant = 0, lean = 0, turn = 0, shows = 0.6, least = BED.least, under = BED.under,
  neighbours = [], kind = 'granite', grain: given = null, flat = 0,
} = {}) {
  const d = draws(seed);
  const grain = given ?? orientation(slant, lean, turn);
  const lying = clamp(flat, 0, 1);
  const slab = lying > 0 && kind === 'granite' ? lerp(thick ?? GRANITE.thick, Math.min(thick ?? GRANITE.thick, GRANITE.thickRange[0]), lying) : thick;
  const count = clamp(Math.round(pieces), 1, CLUSTER.roles.length);

  // The land's own directions at the spot: square to it (n), along the
  // slope's contour (u) and up it (v).
  const n = land.normalAt(x, z);
  const u = new THREE.Vector3().crossVectors(Y, n);
  const sloping = u.length() > CLUSTER.level;
  if (!sloping) u.set(1, 0, 0);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  const rocks = [];                 // this cluster's own
  const there = [...neighbours];    // every rock to bed against: the others', then its own
  let left = 0;
  let big = null;
  // The big rock's own directions over the land: along its length (e) and
  // across it (f), and how far it reaches each way from its middle (m).
  const e = new THREE.Vector3(), f = new THREE.Vector3();
  let reachE = 1, reachF = 1;
  // How far the big rock reaches from its middle toward (c, s) in (e, f).
  const skin = (c, s) => (reachE * reachF) / Math.hypot(reachF * c, reachE * s);
  const sides = [];   // the rocks standing against it (ends and flanks), for the crooks
  let ends = 0, flanks = 0;

  for (let i = 0; i < count; i++) {
    const role = CLUSTER.roles[i];
    const r = d[i];

    // Its size, age and shape.
    const [least_, most_] = CLUSTER.sizes[role];
    const scale = role === 'big' ? 1 : role === 'foot' || role === 'crook' ? lerp(0.8, 1.3, mix) : lerp(0.85, 1.15, mix);
    const shape = shapeOf(kind)({
      seed: (seed | 0) * 131 + i * 17 + 1,
      size: Math.max(CLUSTER.least, size * lerp(least_, most_, r[0]) * scale),
      age: clamp(age * lerp(0.85, 1.15, r[1]), 0, 1),
      thick: slab,
    });

    // Its turn: on the grain, its length along one of the three crack
    // directions (the big one's along the first), either way round; then
    // loosened by the noise.
    const along = role === 'big' ? 0 : r[2] < 0.45 ? 0 : r[2] < 0.8 + 0.2 * lying ? 1 : 2;
    const q = grain.clone();
    if (along === 1) q.multiply(quarter(Y));
    if (along === 2) q.multiply(quarter(Z));
    if (r[3] < 0.5) q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
    if (noise > 0) {
      const axis = new THREE.Vector3(r[4] - 0.5, r[5] - 0.5, r[6] - 0.5);
      if (axis.lengthSq() < 1e-6) axis.copy(X);
      const angle = noise * (Math.PI / 2) * (0.3 + 0.7 * r[7]) * (role === 'big' ? 0.5 : 1);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), angle));
    }

    // Its place, from the big rock's middle: so far along its length (a)
    // and across it (b), over the land.
    let a = 0, b = 0;
    let seat = 'land';
    let held = 0;
    const mean = (shape.length + shape.width) / 2;
    const out = (0.5 - cross) * mean; // out from the big rock's skin, so it crosses it by `cross` of itself
    if (role === 'end') {
      // At one end, then the other; a little to one side.
      a = (ends % 2 === 0 ? 1 : -1) * (reachE + out);
      b = (r[8] - 0.5) * 0.5 * reachF;
      ends++;
    } else if (role === 'flank') {
      // Against one flank, then the other; somewhere along it.
      a = (r[8] - 0.5) * 1.1 * reachE;
      b = (flanks % 2 === 0 ? 1 : -1) * (reachF + out);
      flanks++;
    } else if (role === 'crest') {
      // On top of it, off its middle, half sunk into it.
      a = (r[8] - 0.5) * 0.7 * reachE;
      b = (r[9] - 0.5) * 0.6 * reachF;
      seat = 'rocks';
      held = CLUSTER.seated;
    } else if (role === 'foot') {
      // At its foot: downhill of it on a slope, anywhere round it on the
      // level; a little way out, some of them.
      const way = sloping ? Math.atan2(-v.dot(f), -v.dot(e)) + (r[8] - 0.5) * 2 : r[8] * TAU;
      const [c, s] = [Math.cos(way), Math.sin(way)];
      const far = skin(c, s) + out + r[9] * 0.12 * size;
      a = c * far;
      b = s * far;
    } else if (role === 'crook' && sides.length) {
      // In the crook where a rock standing against it meets it: seated on
      // whatever is there, half sunk in.
      const side = sides[Math.floor(r[8] * sides.length) % sides.length];
      const [sa, sb] = [side.a, side.b];
      const far = Math.hypot(sa, sb) || 1;
      const turnBy = (r[9] < 0.5 ? -1 : 1) * 0.6;
      const way = Math.atan2(sb, sa) + turnBy;
      const [c, s] = [Math.cos(way), Math.sin(way)];
      const at = Math.min(far, skin(c, s)) * 0.95;
      a = c * at;
      b = s * at;
      seat = 'rocks';
      held = CLUSTER.seated;
    } else if (role === 'crook') {
      continue; // (no rock stands against it to make a crook)
    }
    // Bedded; and one that stands against the others is moved in toward
    // the big rock until it really crosses one of them. (A foot rock may
    // lie a little apart.) One that never does is left out, like one of
    // which too little would show.
    const stands = role !== 'big' && role !== 'foot';
    let rock = null;
    for (let attempt = 0; attempt < CLUSTER.tries; attempt++) {
      const k = 0.85 ** attempt;
      const px = role === 'big' ? x : big.at.x + k * (a * e.x + b * f.x);
      const pz = role === 'big' ? z : big.at.z + k * (a * e.z + b * f.z);
      rock = bedRock(shape, land, { x: px, z: pz, shows, q, least, under, neighbours: there, seat, held });
      if (!stands || rock.held - rock.buried >= CLUSTER.touch) break;
    }
    if (rock.hidden || (stands && rock.held - rock.buried < CLUSTER.touch)) {
      left++;
      if (role === 'big') break; // nothing to stand the others against
      continue;
    }
    rock.role = role;
    rock.piece = i;
    rocks.push(rock);
    there.push(rock);
    if (role === 'end' || role === 'flank') sides.push({ a, b });
    if (role === 'big') {
      big = rock;
      e.copy(X).applyQuaternion(rock.q).addScaledVector(n, -X.clone().applyQuaternion(rock.q).dot(n));
      if (e.lengthSq() < 1e-6) e.copy(u);
      e.normalize();
      f.crossVectors(n, e).normalize();
      // Its reach each way, over the part of it that stands out of the
      // land (so a neighbour meets what shows, not what's buried).
      reachE = 0;
      reachF = 0;
      for (const p of rock.corners) {
        if (p.y < land.heightAt(p.x, p.z) - 0.02) continue;
        const dx = p.x - rock.at.x, dy = p.y - rock.at.y, dz = p.z - rock.at.z;
        reachE = Math.max(reachE, Math.abs(dx * e.x + dy * e.y + dz * e.z));
        reachF = Math.max(reachF, Math.abs(dx * f.x + dy * f.y + dz * f.z));
      }
      reachE = Math.max(reachE, 0.2 * rock.length);
      reachF = Math.max(reachF, 0.2 * rock.width);
    }
  }

  return { rocks, left, list: rocks.map(entryOf), seed, size };
}

// A placed rock as an entry of the list: its kind, seed, size, age and
// thickness, where its middle is, and how it's turned.
export function entryOf(rock) {
  return {
    kind: rock.kind, seed: rock.seed, size: rock.size, age: rock.age, thick: rock.thick,
    ...(rock.exact ? { exact: true } : {}),
    at: [rock.at.x, rock.at.y, rock.at.z],
    turn: [rock.q.x, rock.q.y, rock.q.z, rock.q.w],
  };
}

// The rock an entry of the list makes: the same rock, in the same place.
export function rockFrom(entry) {
  const { kind, seed, size, age, thick, exact, at, turn } = entry;
  return placeShape(shapeOf(kind)({ seed, size, age, thick, exact }), new THREE.Quaternion(...turn), new THREE.Vector3(...at), { ...entry });
}
