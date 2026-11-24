import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { inside, outside } from './granite.js';

// What RockLab hands over for each rock: its triangles' corners, their
// normals and a colour per facet, and the rock's convex corners (for
// walking on it). Plain arrays of numbers, made without drawing anything,
// so they can be made in Node as well as on the page, and the game can
// draw them however it likes. The page draws the same (src/rockLook.js).
//
// The look: flat facets, a colour a facet, no textures and nothing drawn
// on a face. Detail comes from the rocks' shapes; the dark gaps where rocks
// meet are the cracks.
//
// By age: fresh rock is clean and a touch lighter; lichen comes late, on
// the tops; moss later still, low down and turned from the sun. Toward the
// ground a rock is a little darker, and where it meets the soil it takes
// some of the soil's colour.
//
// In a cluster the rocks share one tone, each a little off it, and a facet
// is darker the nearer it is to another rock. A face wholly inside another
// rock, or well under the land, is not handed over.

const { smoothstep, clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;

// Each kind's own stone: its colour, the same a touch lighter when fresh,
// and the dark in its gaps. Granite's greys match the game's older rocks,
// so the two sit side by side without a seam. Layered rock is a warm
// sandstone. The facets of one rock stay close to each other either way:
// colour drawn facet by facet reads as pointy triangles.
const STONES = {
  granite: { stone: new THREE.Color(0x8e8d89), fresh: new THREE.Color(0xa3a29e), crevice: new THREE.Color(0x585d55) },
  layered: { stone: new THREE.Color(0xb08a62), fresh: new THREE.Color(0xc6a377), crevice: new THREE.Color(0x6b5843) },
};
const LICHEN = new THREE.Color(0xb4b6aa);
const MOSS = new THREE.Color(0x737b68);
const SOIL = new THREE.Color(0x67635d);
// Toward the sun (the page puts its light there too).
export const SUN = new THREE.Vector3(24, 16.5, 15).normalize();
const SUN_FLAT = new THREE.Vector2(SUN.x, SUN.z).normalize();

// How far from another rock a facet starts to darken, as a share of the
// cluster's size.
export const CREVICE_REACH = 0.07;
// A face this far under the land (m) at every corner is not handed over.
const UNDER = 0.25;

// A smooth pattern in space, about -1 to 1: three waves in seeded
// directions, `wavelength` m long or so. A patch then spans several facets
// instead of picking out triangles.
function pattern(random, wavelength) {
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const k = TAU / (Math.max(wavelength, 0.05) * (0.7 + 0.6 * random()));
    const d = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(k);
    waves.push([d.x, d.y, d.z, random() * TAU]);
  }
  return (x, y, z) => waves.reduce((sum, [a, b, c, p]) => sum + Math.sin(a * x + b * y + c * z + p), 0) / 3;
}

// A colour for each of the rock's triangles (the same over a facet), as a
// Float32Array, three numbers a triangle. ground: the land's height
// function. The rock carries its seed, age and size. tone: the seed and
// size its shade and patterns are drawn from (a cluster's, so its rocks
// share them; the rock's own otherwise). others: the rocks it stands among,
// for the dark in the gaps.
export function rockColors(rock, ground, { tone = { seed: rock.seed ?? 1, size: rock.size ?? 1 }, others = [] } = {}) {
  const { positions, normals, facet, areas } = rock;
  const { seed = 1, age = 0, size = 1 } = rock;
  const { stone: STONE, fresh: FRESH, crevice: CREVICE } = STONES[rock.kind] ?? STONES.granite;
  const random = mulberry32((tone.seed | 0) * 104729 + 307);
  const shade = STONE.clone().multiplyScalar(0.94 + 0.12 * random()).lerp(FRESH, 0.4 * (1 - smoothstep(age, 0, 0.5)));
  const mottle = pattern(random, tone.size * 0.6);
  const lichenPatches = pattern(random, tone.size * 0.5);
  const mossPatches = pattern(random, tone.size * 0.5);
  // Each rock a little off the shared tone.
  if (others.length) shade.multiplyScalar(0.97 + 0.06 * mulberry32((seed | 0) * 7919 + 53)());
  // Lichen grows on what's big enough to stay put, and only with age.
  const lichenShare = smoothstep(age, 0.45, 1) * smoothstep(size, 0.05, 0.6);
  const mossShare = smoothstep(age, 0.6, 1);
  const reach = CREVICE_REACH * tone.size;
  const T = facet.length;

  // Each facet's middle, normal and lowest corner over the ground.
  const facets = new Map();
  for (let i = 0; i < T; i++) {
    const f = facets.get(facet[i]) ?? facets.set(facet[i], { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, area: 0, low: Infinity }).get(facet[i]);
    const p = positions.subarray(i * 9, i * 9 + 9);
    const w = areas[i];
    f.x += w * (p[0] + p[3] + p[6]) / 3; f.y += w * (p[1] + p[4] + p[7]) / 3; f.z += w * (p[2] + p[5] + p[8]) / 3;
    f.nx += w * normals[i * 3]; f.ny += w * normals[i * 3 + 1]; f.nz += w * normals[i * 3 + 2];
    f.area += w;
    for (let v = 0; v < 3; v++) f.low = Math.min(f.low, p[v * 3 + 1] - ground(p[v * 3], p[v * 3 + 2]));
  }
  let top = 0;
  for (const p of rock.corners) top = Math.max(top, p.y - ground(p.x, p.z));
  const band = 0.04 + 0.15 * Math.max(top, 0); // the moss round the foot, m up from the ground

  const color = new THREE.Color();
  const colors = new Map();
  for (const [id, f] of facets) {
    const [x, y, z] = [f.x / f.area, f.y / f.area, f.z / f.area];
    const len = Math.hypot(f.nx, f.ny, f.nz) || 1;
    const [nx, ny, nz] = [f.nx / len, f.ny / len, f.nz / len];
    const above = y - ground(x, z);
    const sunny = nx * SUN.x + ny * SUN.y + nz * SUN.z;
    const turnedAway = -(nx * SUN_FLAT.x + nz * SUN_FLAT.y) * Math.sqrt(Math.max(0, 1 - ny * ny));
    const lichen = lichenShare * smoothstep(ny, 0.2, 0.85) * (0.6 + 0.4 * Math.max(sunny, 0)) * smoothstep(lichenPatches(x, y, z), -0.15, 0.45);
    const moss = mossShare * Math.min(1, Math.max(0, turnedAway) * 0.8 + (1 - smoothstep(above, 0, band)) * (ny > -0.2 ? 0.7 : 0.2))
      * smoothstep(mossPatches(x, y, z), -0.35, 0.35);
    color.copy(shade).multiplyScalar(1 + 0.04 * mottle(x, y, z));
    color.lerp(LICHEN, 0.6 * lichen);
    color.lerp(MOSS, 0.5 * moss);
    // Darker in the gap where another rock is near.
    if (others.length) {
      let near = Infinity;
      for (const o of others) near = Math.min(near, Math.max(0, outside(o, x, y, z)));
      color.lerp(CREVICE, 0.45 * (1 - clamp(near / reach, 0, 1)));
    }
    // A little darker toward the foot, so it sits down without a shadow.
    color.multiplyScalar(1 - 0.1 * (1 - smoothstep(above, 0, 0.35 * Math.max(top, 0.05))));
    if (f.low < 0.02) color.lerp(SOIL, above < 0 ? 0.5 : 0.18);
    colors.set(id, [clamp(color.r, 0, 1), clamp(color.g, 0, 1), clamp(color.b, 0, 1)]);
  }
  const out = new Float32Array(T * 3);
  for (let i = 0; i < T; i++) out.set(colors.get(facet[i]), i * 3);
  return out;
}

// What is handed over for these rocks, one entry a rock, in order:
//   positions: Float32Array, 9 numbers a triangle (its three corners);
//   normals:   Float32Array, 9 numbers a triangle (its facet's normal at each corner);
//   colors:    Float32Array, 9 numbers a triangle (its facet's colour at each corner, 0 to 1);
//   corners:   Float32Array, 3 numbers a corner (the rock's convex corners);
//   triangles: how many triangles.
// Only the triangles that show: not one wholly inside another of the rocks,
// nor well under the land. ground: the land's height function. tone: one
// seed and size for them all (a cluster's); without it each rock has its
// own, and no gaps are darkened.
export function rockOutput(rocks, ground, { tone = null } = {}) {
  return rocks.map((r) => {
    // (Only the rocks near enough to matter: its box and theirs within reach.)
    const reach = tone ? CREVICE_REACH * tone.size : 0;
    const near = (o) => [0, 1, 2].every((k) => o.min[k] <= r.max[k] + reach && o.max[k] >= r.min[k] - reach);
    const others = tone ? rocks.filter((o) => o !== r && near(o)) : [];
    const colors = rockColors(r, ground, tone ? { tone, others } : {});
    const p = r.positions;
    const shown = [];
    for (let i = 0; i < r.facet.length; i++) {
      const corner = (v) => [p[i * 9 + v * 3], p[i * 9 + v * 3 + 1], p[i * 9 + v * 3 + 2]];
      const buried = [0, 1, 2].every((v) => { const [x, y, z] = corner(v); return y < ground(x, z) - UNDER; });
      const swallowed = others.some((o) => [0, 1, 2].every((v) => { const [x, y, z] = corner(v); return inside(o, x, y, z, -1e-4); }));
      if (!buried && !swallowed) shown.push(i);
    }
    const T = shown.length;
    const out = {
      positions: new Float32Array(T * 9),
      normals: new Float32Array(T * 9),
      colors: new Float32Array(T * 9),
      corners: Float32Array.from(r.corners.flatMap((c) => [c.x, c.y, c.z])),
      triangles: T,
    };
    shown.forEach((i, t) => {
      out.positions.set(p.subarray(i * 9, i * 9 + 9), t * 9);
      for (let v = 0; v < 3; v++) {
        for (let k = 0; k < 3; k++) {
          out.normals[t * 9 + v * 3 + k] = r.normals[i * 3 + k];
          out.colors[t * 9 + v * 3 + k] = colors[i * 3 + k];
        }
      }
    });
    return out;
  });
}
