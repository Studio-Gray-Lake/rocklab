import { SPOTS } from './spots.js';

// What a rock says to the walk: read from the rock alone (its faces, kept
// as planes, and its convex corners) and the land under it.
//
// The walk is the game's own. It climbs a step up to 30 cm within 20 cm,
// steps down 40 cm, takes slopes to 55 degrees over 60 cm, and stands on
// whatever is highest under it, land or rock. A rock more than a step
// proud of the land is something it meets.

export const WALK = {
  stepUp: 0.3,    // m: the highest step it climbs...
  stepOver: 0.2,  // m: ...within this far
  stepDown: 0.4,  // m: the deepest drop it steps down
  slope: 55,      // degrees: the steepest slope it walks up or down...
  slopeOver: 0.6, // m: ...measured over this far
  read: 0.1,      // m: how finely a group's ground is read, to judge it
  // Nothing thin underfoot: a rock is no footing if
  thinnest: 0.03, // m: it is thinner than this anywhere,
  flattest: 0.2,  // or thinner than this share of its length (a plate, a sliver),
  sharpest: 45,   // degrees: or a top edge is sharper than this (a blade)
};

const EPS = 1e-6;

// The rock's height at (x, z), seen from above: the top of it there, or
// -Infinity where (x, z) is outside its outline. (A rock is convex: under
// a point it is one span, from its lowest face to its highest.)
export function rockTop(rock, x, z) {
  const { min, max } = rock;
  if (x < min[0] - EPS || x > max[0] + EPS || z < min[2] - EPS || z > max[2] + EPS) return -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const [nx, ny, nz, d] of rock.planes) {
    const rest = d - nx * x - nz * z; // ny * y <= rest
    if (ny > EPS) top = Math.min(top, rest / ny);
    else if (ny < -EPS) bottom = Math.max(bottom, rest / ny);
    else if (rest < -EPS) return -Infinity; // an upright face, and (x, z) beyond it
  }
  return bottom <= top + EPS ? top : -Infinity;
}

// The rock's outline from above: the hull of its corners, as [x, z] points
// round it anticlockwise (seen from above, +y), with no three in a line.
export function outlineOf(points) {
  const flat = points.map((p) => (Array.isArray(p) ? p : [p.x, p.z]));
  const sorted = flat.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= EPS) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  if (sorted.length < 3) return sorted;
  return [...half(sorted), ...half(sorted.slice().reverse())];
}

// How thin the rock is at its thinnest: of all its faces, the least
// distance from a face to the corner farthest behind it (m).
export function thinnestOf(rock) {
  let least = Infinity;
  for (const [nx, ny, nz, d] of rock.planes) {
    let deepest = 0;
    for (const c of rock.corners) deepest = Math.max(deepest, d - (nx * c.x + ny * c.y + nz * c.z));
    least = Math.min(least, deepest);
  }
  return least;
}

// How sharp the rock's sharpest top edge is: of the edges between two of
// its faces that both look up, the least angle inside the rock between
// them (degrees; 180 on a flat top). A blade is a small angle.
export function sharpestTopOf(rock) {
  const faces = rock.planes.map(([nx, ny, nz, d]) => ({ n: [nx, ny, nz], d, on: [] }));
  rock.corners.forEach((c, i) => {
    for (const f of faces) if (Math.abs(f.n[0] * c.x + f.n[1] * c.y + f.n[2] * c.z - f.d) < 1e-5) f.on.push(i);
  });
  let sharpest = 180;
  for (let a = 0; a < faces.length; a++) {
    if (faces[a].n[1] <= 0) continue;
    for (let b = a + 1; b < faces.length; b++) {
      if (faces[b].n[1] <= 0) continue;
      // (Two faces meet at an edge when they share two corners.)
      if (faces[a].on.filter((i) => faces[b].on.includes(i)).length < 2) continue;
      const cos = faces[a].n[0] * faces[b].n[0] + faces[a].n[1] * faces[b].n[1] + faces[a].n[2] * faces[b].n[2];
      sharpest = Math.min(sharpest, 180 - (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
    }
  }
  return sharpest;
}

// All a rock says to the walk. ground: the land's height function.
// - proud: how far it stands over the land, at its highest (m);
// - outline: from above, [x, z] points round it;
// - thinnest: how thin it is at its thinnest (m);
// - sharpest: its sharpest top edge (degrees inside the rock);
// - step: whether it is no more than a step proud (the walk climbs it);
// - footing: whether it is thick enough and blunt enough to stand on.
export function rockWalk(rock, ground) {
  let proud = 0;
  for (const c of rock.corners) proud = Math.max(proud, c.y - ground(c.x, c.z));
  const thinnest = thinnestOf(rock);
  const sharpest = sharpestTopOf(rock);
  return {
    proud,
    outline: outlineOf(rock.corners),
    thinnest,
    sharpest,
    step: proud <= WALK.stepUp,
    footing: thinnest >= WALK.thinnest && thinnest >= WALK.flattest * (rock.size ?? 0) && sharpest >= WALK.sharpest,
  };
}

// Whether the walk can go over these rocks where they lie: the land with
// them on it (the highest of land and rock at each point), read a little
// way past them all round, every way the walk might come. Where it would
// meet, on or against a rock, a step up past its limit, a drop past its
// limit, or a slope past its steepest, they are a wall; else ground.
// Gives { ground, why }: why, for a wall, is what the walk would meet
// first ('step', 'drop' or 'slope').
export function groundOrWall(rocks, ground) {
  const { read, stepUp, stepOver, stepDown, slope, slopeOver } = WALK;
  const steepest = Math.tan((slope * Math.PI) / 180);
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const r of rocks) [x0, x1, z0, z1] = [Math.min(x0, r.min[0]), Math.max(x1, r.max[0]), Math.min(z0, r.min[2]), Math.max(z1, r.max[2])];
  [x0, x1, z0, z1] = [x0 - slopeOver, x1 + slopeOver, z0 - slopeOver, z1 + slopeOver];
  const nx = Math.ceil((x1 - x0) / read) + 1;
  const nz = Math.ceil((z1 - z0) / read) + 1;
  const high = new Float64Array(nx * nz);
  const onRock = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, z] = [x0 + i * read, z0 + j * read];
      const land = ground(x, z);
      let top = land;
      for (const r of rocks) top = Math.max(top, rockTop(r, x, z));
      high[j * nx + i] = top;
      onRock[j * nx + i] = top > land + 1e-3 ? 1 : 0;
    }
  }
  // The eight ways along the grid and its diagonals; a step is looked for
  // within stepOver, a slope over slopeOver, each in whole cells.
  for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const cell = read * Math.hypot(di, dj);
    const near = Math.max(1, Math.round(stepOver / cell));
    const far = Math.max(1, Math.round(slopeOver / cell));
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const here = j * nx + i;
        for (const [k, look] of [[near, 'step'], [far, 'slope']]) {
          const [ti, tj] = [i + di * k, j + dj * k];
          if (ti < 0 || ti >= nx || tj < 0 || tj >= nz) continue;
          const there = tj * nx + ti;
          if (!onRock[here] && !onRock[there]) continue;
          const rise = high[there] - high[here];
          if (look === 'step') {
            if (rise > stepUp) return { ground: false, why: 'step' };
            if (-rise > stepDown) return { ground: false, why: 'drop' };
          } else if (Math.abs(rise) / (k * cell) > steepest) return { ground: false, why: 'slope' };
        }
      }
    }
  }
  return { ground: true, why: null };
}

// Each thing laid as one group, for the walk: a cluster, a block of the
// rim, a fallen rock, a strewn stone. laid: as the placer gives it (place.js
// placeSteps), each { id, part, at, rocks }; ground: the land's height
// function. One group a thing laid, in order, each:
// - id, part: the thing laid's own;
// - rocks: which rocks are its, as places in the list of every rock (the
//   placer's `rocks`, the things laid's rocks one after another);
// - outline: from above, [x, z] points round all its rocks' corners;
// - proud: how far it stands over the land, at its highest (m);
// - square: [i, j], the square of land it belongs to (its place's);
// - ground: whether the walk can go over it (groundOrWall), and why not:
//   'step', 'drop' or 'slope', or 'thin' where it could go over but a rock
//   there is no footing (nothing thin underfoot);
// - stepping: for each of its rocks, whether the walk may step on it: on
//   ground, any; on a wall, only one no more than a step proud; never one
//   that is no footing.
export function groupsOf(laid, ground, { square = SPOTS.square } = {}) {
  let next = 0;
  return laid.map((thing) => {
    const walks = thing.rocks.map((rock) => rockWalk(rock, ground));
    const rocks = thing.rocks.map(() => next++);
    const over = groundOrWall(thing.rocks, ground);
    const footing = walks.every((w) => w.footing);
    const walkable = over.ground && footing;
    const why = over.why ?? (footing ? null : 'thin');
    return {
      id: thing.id,
      part: thing.part,
      rocks,
      outline: outlineOf(thing.rocks.flatMap((rock) => rock.corners)),
      proud: Math.max(...walks.map((w) => w.proud)),
      square: [Math.floor(thing.at.x / square), Math.floor(thing.at.z / square)],
      ground: walkable,
      why,
      stepping: walks.map((w) => (walkable || w.step) && w.footing),
    };
  });
}
