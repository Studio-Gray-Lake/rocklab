import * as THREE from 'three';
import { buildRock, inside, orientation, topAt } from './granite.js';

// Bedding: how a rock is set into the land, and into the rocks already
// there, so nothing floats.
//
// A rock reads as floating when a thin slice of air shows between it and
// what is under or behind it. The workshop lets a rock down until no face
// within 45° of facing straight down shows, which holds on gentle ground;
// on steep ground that misses the gap, since the land no longer
// faces straight up. Here it is the same rule measured against the land:
// no face within `under` degrees of facing the land may show, so no wedge
// of air thinner than that is left under a rock, whatever way the land
// faces. On level ground it is the workshop's rule exactly.
//
// 1. How much shows. The rock is set at its spot and pushed back into the
//    land, square to the land there, until the asked share of it is buried
//    (never less than `least`).
// 2. No gap. A point on a face that faces the land must be in the land or
//    inside a neighbour. If one isn't, the rock is pushed further in.
// 3. Under its middle. The rock's underside straight below its middle is
//    in the land or in a neighbour, so it can't hang by a corner.
//
// neighbours: the rocks already placed (a cluster's, biggest first). A rock
// is bedded against them and the land together.

const { clamp, degToRad } = THREE.MathUtils;

export const BED = {
  least: 0.3,         // the share of a rock buried when "how much shows" is 1 (to be set by eye)
  under: 45,          // degrees: a face within this of facing the land is an underside, and is buried
  slack: 0.01,        // m: a gap smaller than this is none
  showsLeast: 0.03,   // m: a rock standing less than this out of the land is left out...
  showsShare: 0.15,   // ...or less than this share of its own thickness...
  exposed: 0.12,      // ...or with less than this share of it clear of the land and its neighbours (a sliver)
  grid: 7,            // samples a side through a rock's box, for the shares
};

// Points spread through a shape's inside (its own frame), for measuring how
// much of it is buried.
export const pointsInside = (shape) => insidePoints(shape);
function insidePoints(shape) {
  if (shape.inside) return shape.inside;
  const rock = buildRock(shape.points);
  const box = new THREE.Box3().setFromPoints(shape.points);
  const points = [];
  const N = BED.grid;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const x = box.min.x + ((i + 0.5) / N) * (box.max.x - box.min.x);
    const y = box.min.y + ((j + 0.5) / N) * (box.max.y - box.min.y);
    const z = box.min.z + ((k + 0.5) / N) * (box.max.z - box.min.z);
    if (rock.planes.every(([nx, ny, nz, d]) => nx * x + ny * y + nz * z <= d)) points.push(new THREE.Vector3(x, y, z));
  }
  shape.inside = points;
  return points;
}

// Whether (x, y, z) is inside any of the neighbours. neighbours: a list of
// rocks, or (from bedRock) the same list with the few near the rock being
// bedded picked out: { all, near, box }. A point inside the box is asked of
// the near ones only (no other rock's box reaches it, so none of them can
// hold it); a point outside it, of them all. The same answer, sooner.
const within = (neighbours, x, y, z) => {
  let list = neighbours;
  if (neighbours.box) {
    const [x0, y0, z0, x1, y1, z1] = neighbours.box;
    list = x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 ? neighbours.near : neighbours.all;
  }
  for (const r of list) if (inside(r, x, y, z, 1e-4)) return true;
  return false;
};
// The neighbours near a rock about to be bedded at `spot`: a box round it,
// as far as the rock reaches (`reach`) and a good way more, and the rocks
// whose own boxes come within it.
function nearTo(neighbours, spot, reach) {
  if (neighbours.length < 4) return neighbours;
  const r = 3 * reach;
  const box = [spot.x - r, spot.y - r, spot.z - r, spot.x + r, spot.y + r, spot.z + r];
  const slack = 2e-4;
  const near = neighbours.filter((o) => o.max[0] >= box[0] - slack && o.min[0] <= box[3] + slack
    && o.max[1] >= box[1] - slack && o.min[1] <= box[4] + slack && o.max[2] >= box[2] - slack && o.min[2] <= box[5] + slack);
  return { all: neighbours, near, box };
}

// How far the rock's undersides (its faces within `under` degrees of
// facing the land) stand above the land at most (m, measured square to the
// land), where no neighbour covers them: 0 or less when none shows. shift:
// the rock as if moved by this much (a vector), without rebuilding it.
const NO_SHIFT = new THREE.Vector3();
const NONE = [];
// limit: past this, the answer is only that it shows more (it stops at the
// first point that does).
export function undersideShowing(rock, land, under = BED.under, shift = NO_SHIFT, neighbours = NONE, limit = Infinity) {
  const { positions, normals } = rock;
  const nl = new THREE.Vector3();
  const facing = -Math.cos(degToRad(under));
  let showing = -Infinity;
  const at = (x, y, z, nx, ny, nz) => {
    x += shift.x; y += shift.y; z += shift.z;
    land.normalAt(x, z, nl);
    if (nx * nl.x + ny * nl.y + nz * nl.z >= facing) return;
    const above = (y - land.heightAt(x, z)) * nl.y;
    if (above <= showing) return;
    if (above > 0 && within(neighbours, x, y, z)) return;
    showing = above;
  };
  const past = () => showing > limit;
  // (A face within 90° - under of looking straight up can't face any land,
  // however steep: the land is never past upright. With a degree to
  // spare, such a face is passed over without reading the land under it.)
  const upward = under < 89 ? Math.cos(degToRad(90 - under - 1)) : Infinity;
  for (let i = 0; i < normals.length / 3; i++) {
    const p = positions.subarray(i * 9, i * 9 + 9);
    const [nx, ny, nz] = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    if (ny > upward) continue;
    // Its corners, the middles of its sides, and its middle.
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      at(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], nx, ny, nz);
      at((p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2, nx, ny, nz);
    }
    at((p[0] + p[3] + p[6]) / 3, (p[1] + p[4] + p[7]) / 3, (p[2] + p[5] + p[8]) / 3, nx, ny, nz);
    if (past()) return showing;
  }
  return showing;
}

// The share of the rock's underside that rests on something: of the
// points on its faces within `under` degrees of facing the land, how many
// are in the land or inside a neighbour. 1 when it has no such face.
export function undersideHeld(rock, land, under = BED.under, neighbours = NONE) {
  const { positions, normals } = rock;
  const nl = new THREE.Vector3();
  const facing = -Math.cos(degToRad(under));
  let all = 0;
  let held = 0;
  const at = (x, y, z, nx, ny, nz) => {
    land.normalAt(x, z, nl);
    if (nx * nl.x + ny * nl.y + nz * nl.z >= facing) return;
    all++;
    if (y <= land.heightAt(x, z) + BED.slack || within(neighbours, x, y, z)) held++;
  };
  for (let i = 0; i < normals.length / 3; i++) {
    const p = positions.subarray(i * 9, i * 9 + 9);
    const [nx, ny, nz] = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      at(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], nx, ny, nz);
      at((p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2, nx, ny, nz);
    }
    at((p[0] + p[3] + p[6]) / 3, (p[1] + p[4] + p[7]) / 3, (p[2] + p[5] + p[8]) / 3, nx, ny, nz);
  }
  return all ? held / all : 1;
}

// How far the rock's underside, straight below its middle, stands above the
// land (m): 0 or less when it's in the land, or inside a neighbour. shift:
// as undersideShowing's.
export function middleShowing(rock, land, shift = NO_SHIFT, neighbours = NONE) {
  const middle = new THREE.Vector3();
  for (const p of rock.corners) middle.add(p);
  middle.divideScalar(rock.corners.length).add(shift);
  let bottom = -Infinity;
  for (const [nx, ny, nz, d] of rock.planes) {
    const moved = d + nx * shift.x + ny * shift.y + nz * shift.z;
    if (ny < -1e-9) bottom = Math.max(bottom, (moved - nx * middle.x - nz * middle.z) / ny);
  }
  const above = bottom - land.heightAt(middle.x, middle.z);
  return above > 0 && within(neighbours, middle.x, bottom, middle.z) ? 0 : above;
}

// A shape where it's put: turned by q (a quaternion), its middle at `at`.
export function placeShape(shape, q, at, about = {}) {
  return buildRock(shape.points.map((p) => p.clone().applyQuaternion(q).add(at)), about);
}

// A shape seated where it's put: its middle at `at`, turned by q, and not
// moved. For a rock whose place is given by something else (a slab in its
// bed). Gives the rock with the same facts as bedRock's, and, for the one
// who placed it to act on: showing, how far its underside stands out of
// the land and its neighbours (m; 0 or less when none does); rests, the
// share of its underside that rests on the land or a neighbour; and hangs,
// how far its underside below its middle stands over them (m).
export function seatRock(shape, land, { at, q, under = BED.under, neighbours = NONE } = {}) {
  const rock = placeShape(shape, q, at);
  let inLand = 0;
  let clear = 0;
  const samples = insidePoints(shape);
  const p = new THREE.Vector3();
  for (const s of samples) {
    p.copy(s).applyQuaternion(q).add(at);
    if (p.y < land.heightAt(p.x, p.z)) inLand++;
    else if (!within(neighbours, p.x, p.y, p.z)) clear++;
  }
  const nl = new THREE.Vector3();
  let stands = -Infinity;
  for (const c of rock.corners) {
    land.normalAt(c.x, c.z, nl);
    stands = Math.max(stands, (c.y - land.heightAt(c.x, c.z)) * nl.y);
  }
  const exposed = clear / samples.length;
  return Object.assign(rock, {
    ...shape.spec, length: shape.length, width: shape.width,
    x: at.x, z: at.z, at: at.clone(), q: q.clone(),
    buried: inLand / samples.length, held: 1 - exposed, exposed, stands, pushed: 0,
    showing: Math.max(undersideShowing(rock, land, under, NO_SHIFT, neighbours), middleShowing(rock, land, NO_SHIFT, neighbours)),
    rests: undersideHeld(rock, land, under, neighbours),
    hangs: middleShowing(rock, land, NO_SHIFT, neighbours),
    hidden: stands < Math.max(BED.showsLeast, BED.showsShare * shape.thick) || exposed < BED.exposed,
  });
}

// A shape bedded at (x, z). shows, 0 to 1: how much of it stands out, at
// most (the tests may bury it deeper). slant, lean, turn: how it's turned
// (granite.js orientation), or q, a quaternion, instead. neighbours: rocks
// already placed, to be bedded against too. seat: 'land' stands it on the
// land (beside a neighbour, crossing into its side); 'rocks' stands it on
// whatever is highest there, the land or a neighbour's top. held: at least
// this share of it is in the land or a neighbour, whatever `shows` asks.
// least and under: BED's, for trying other values by eye.
//
// Gives the rock in place (buildRock's), with: at and q, where its middle
// is and how it's turned (with the shape's spec, enough to make it again);
// buried, the share of it in the land; held, the share of it in the land
// or a neighbour; exposed, the share of it clear of both; stands, how far
// it stands out of the land at most (m, square to the land); pushed, how
// far the tests pushed it further in (m); and hidden, true when too little
// of it would show (it's then left out).
export function bedRock(shape, land, {
  x = 0, z = 0, shows = 0.6, slant = 0, lean = 0, turn = 0, q = null, least = BED.least, under = BED.under,
  neighbours = NONE, seat = 'land', held = 0,
} = {}) {
  q = q ?? orientation(slant, lean, turn);
  const turned = shape.points.map((p) => p.clone().applyQuaternion(q));
  const samples = insidePoints(shape).map((p) => p.clone().applyQuaternion(q));
  const n = land.normalAt(x, z);
  const spot = new THREE.Vector3(x, land.heightAt(x, z), z);
  if (seat === 'rocks') for (const r of neighbours) spot.y = Math.max(spot.y, topAt(r, x, z));
  let low = Infinity, high = -Infinity;
  for (const p of turned) {
    const t = p.dot(n);
    low = Math.min(low, t);
    high = Math.max(high, t);
  }
  // (Only the neighbours near enough to matter are asked about most points.)
  const reach = Math.max(...turned.map((p) => p.length())) + (high - low);
  const around = nearTo(neighbours, spot, reach);

  // The rock's middle is at spot + n·t. The share of it in the land, or in
  // a neighbour, falls as t rises.
  // (While t stays between -high and -low, as the search below keeps it, a
  // sample sweeps a short line; only the neighbours whose boxes that line
  // comes near can hold it, and only they are asked.)
  const [t0, t1] = [-high, -low];
  const slack = 2e-4;
  const sweeps = samples.map((s) => {
    const [ax, ay, az] = [spot.x + n.x * t0 + s.x, spot.y + n.y * t0 + s.y, spot.z + n.z * t0 + s.z];
    const [bx, by, bz] = [spot.x + n.x * t1 + s.x, spot.y + n.y * t1 + s.y, spot.z + n.z * t1 + s.z];
    const [x0, x1, y0, y1, z0, z1] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by), Math.min(az, bz), Math.max(az, bz)];
    return (around.near ?? around).filter((o) => o.max[0] >= x0 - slack && o.min[0] <= x1 + slack
      && o.max[1] >= y0 - slack && o.min[1] <= y1 + slack && o.max[2] >= z0 - slack && o.min[2] <= z1 + slack);
  });
  const sharesAt = (t) => {
    const swept = t >= t0 && t <= t1;
    let under = 0;
    let clear = 0;
    for (let k = 0; k < samples.length; k++) {
      const s = samples[k];
      const px = spot.x + n.x * t + s.x;
      const py = spot.y + n.y * t + s.y;
      const pz = spot.z + n.z * t + s.z;
      if (py < land.heightAt(px, pz)) under++;
      else if (!within(swept ? sweeps[k] : around, px, py, pz)) clear++;
    }
    return { buried: under / samples.length, exposed: clear / samples.length };
  };
  const want = Math.max(clamp(held, 0, 1), 1 - (1 - clamp(least, 0, 1)) * clamp(shows, 0, 1));
  let [deep, shallow] = [-high, -low];
  for (let i = 0; i < 18; i++) {
    const mid = (deep + shallow) / 2;
    if (1 - sharesAt(mid).exposed > want) deep = mid;
    else shallow = mid;
  }
  let t = (deep + shallow) / 2;
  const asked = t;

  // The two tests: pushed in until both pass, then eased back out to the
  // shallowest depth at which they still do (so the depth doesn't depend
  // on how it was reached).
  const at = new THREE.Vector3();
  const place = () => buildRock(turned.map((p) => p.clone().add(at.copy(spot).addScaledVector(n, t))));
  let rock = place();
  const shift = new THREE.Vector3();
  const showingAt = (deeper) => {
    shift.copy(n).multiplyScalar(-deeper);
    return Math.max(undersideShowing(rock, land, under, shift, around), middleShowing(rock, land, shift, around));
  };
  // (Whether it passes needs only whether any point shows past the
  // limit: the middle first, then the undersides, stopping at the first.)
  const passes = (deeper) => {
    const limit = 0.8 * BED.slack;
    shift.copy(n).multiplyScalar(-deeper);
    return middleShowing(rock, land, shift, around) <= limit && undersideShowing(rock, land, under, shift, around, limit) <= limit;
  };
  if (!passes(0)) {
    let fails = 0;
    let deeper = 0;
    for (let i = 0; i < 24 && !passes(deeper); i++) {
      fails = deeper;
      deeper += Math.max(showingAt(deeper), 0) * 1.05 + BED.slack;
    }
    for (let i = 0; i < 12; i++) {
      const mid = (fails + deeper) / 2;
      if (passes(mid)) deeper = mid;
      else fails = mid;
    }
    t -= deeper;
    rock = place();
    // (Rebuilt in its place, its faces may be cut into triangles another
    // way, and so be tested at other points: pushed on until it passes as
    // it is.)
    for (let i = 0; i < 12 && showingAt(0) > BED.slack; i++) {
      t -= Math.max(showingAt(0), 0) * 1.05 + BED.slack;
      rock = place();
    }
  }

  // How far it stands out of the land at most.
  const nl = new THREE.Vector3();
  let stands = -Infinity;
  for (const p of rock.corners) {
    land.normalAt(p.x, p.z, nl);
    stands = Math.max(stands, (p.y - land.heightAt(p.x, p.z)) * nl.y);
  }
  const { buried, exposed } = sharesAt(t);
  const hidden = stands < Math.max(BED.showsLeast, BED.showsShare * shape.thick) || exposed < BED.exposed;
  return Object.assign(rock, {
    ...shape.spec, length: shape.length, width: shape.width,
    x, z, at: at.clone(), q: q.clone(), buried, held: 1 - exposed, exposed, stands, pushed: asked - t, hidden,
  });
}
