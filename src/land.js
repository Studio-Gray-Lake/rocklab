import * as THREE from 'three';

// The test land: a low meadow in
// front, a steep band across it, and a high meadow behind. The band's foot
// is gently curved, and toward one end (+x) the band sinks into the meadow,
// so a formation can be seen ending.
//
// One height function, and everything reads it: the drawn ground, and every
// rock that is bedded in it. So rock and land can't disagree.
//
// x runs along the band, z toward the viewer (the low meadow is at +z), y up.

const { degToRad, radToDeg, smoothstep, clamp } = THREE.MathUtils;

export const LAND_SIZE = { x0: -24, x1: 24, z0: -16, z1: 16 }; // m
export const LAND_DEFAULTS = { steep: 60, height: 8 }; // degrees, m
export const STEEPEST = 75; // degrees: the slider's top

const FILLET = 1.2; // m: the band's foot and top rounded over this
const REPOSE = Math.tan(degToRad(35)); // where fallen rock comes to rest (its angle of repose)

// How much of the band's height stands at x: all of it, sinking to none
// toward the +x end.
export const bandShare = (x) => 1 - smoothstep(x, 8, 21);
const BEYOND = 6; // m: how far "before the foot" and "past the top" reach (placeOn)

// max(0, x), its corner rounded over r.
const bend = (x, r) => (x <= -r / 2 ? 0 : x >= r / 2 ? x : ((x + r / 2) ** 2) / (2 * r));

// The land for these settings: heightAt(x, z), normalAt(x, z), and where
// things are on it. apron, if given: (x) => m, how tall a bank of fallen
// rock lies at the band's foot there. The bank rises at 35° from the low
// meadow to that height against the face. It is part of the one height
// function, so the rocks bedded on it and the ground agree.
export function createLand({ steep = LAND_DEFAULTS.steep, height = LAND_DEFAULTS.height, apron = null } = {}) {
  const tan = Math.tan(degToRad(clamp(steep, 0, STEEPEST)));
  // The foot of the band: z there, at x.
  const foot = (x) => 3 + 1.6 * Math.sin(x / 7.5) + 0.7 * Math.sin(x / 3.1 + 1.3);
  const share = bandShare;
  // How far back the band runs from its foot to its top, at x.
  const width = (x) => (tan > 1e-6 ? (height * share(x)) / tan : 0);
  // The meadows' gentle roll.
  const roll = (x, z) => 0.12 * Math.sin(x / 5.3 + 0.7) * Math.cos(z / 4.1) + 0.07 * Math.sin(x / 2.3 + z / 3.7);

  // The band's rise at d behind its foot, at x; and the apron's.
  const bandRise = (x, d) => {
    const w = width(x);
    const r = Math.min(FILLET, Math.max(w, 1e-3));
    return tan * (bend(d, r) - bend(d - w, r));
  };
  // (The apron's height is asked at every height: worked out once along
  // the land, a tenth of a metre apart, and read between.)
  const STEP = 0.1;
  const table = apron ? Float64Array.from({ length: Math.round((LAND_SIZE.x1 - LAND_SIZE.x0) / STEP) + 2 }, (_, i) => Math.max(0, apron(LAND_SIZE.x0 + i * STEP))) : null;
  const apronAt = (x) => {
    if (!table) return 0;
    const at = Math.min(Math.max((x - LAND_SIZE.x0) / STEP, 0), table.length - 2);
    const i = Math.floor(at);
    return table[i] + (table[i + 1] - table[i]) * (at - i);
  };
  const apronRise = (x, d) => {
    const tall = apronAt(x);
    if (!(tall > 0)) return 0;
    const run = tall / REPOSE;
    const r = Math.min(0.6, run);
    return REPOSE * (bend(d + run, r) - bend(d, r));
  };

  // The higher of the band and the bank; where they meet, the line between
  // them rounded over (so the drawn facets don't saw-tooth along it). With
  // no bank it is the band alone, exactly.
  const MEET = 0.7; // m
  function heightAt(x, z) {
    const d = foot(x) - z; // how far behind the foot (up the band)
    const band = bandRise(x, d);
    const bank = apronRise(x, d);
    if (!(bank > 0)) return band + roll(x, z);
    const k = MEET * Math.min(1, bank / 0.3);
    const h = Math.max(k - Math.abs(band - bank), 0) / k;
    return Math.max(band, bank) + h * h * k * 0.25 + roll(x, z);
  }

  // How much (x, z) is on the apron, 0 to 1: 1 where the bank stands well
  // above the band, fading over the line where the two meet and at its toe.
  function onApron(x, z) {
    const d = foot(x) - z;
    const bank = apronRise(x, d);
    return smoothstep(bank, 0.02, 0.15) * smoothstep(bank - bandRise(x, d), -0.25, 0.25);
  }

  // The land's outward normal at (x, z).
  function normalAt(x, z, out = new THREE.Vector3()) {
    const E = 0.05;
    const dx = (heightAt(x + E, z) - heightAt(x - E, z)) / (2 * E);
    const dz = (heightAt(x, z + E) - heightAt(x, z - E)) / (2 * E);
    return out.set(-dx, 1, -dz).normalize();
  }

  // How steep the land is at (x, z), in degrees.
  const slopeAt = (x, z) => radToDeg(Math.acos(clamp(normalAt(x, z).y, -1, 1)));

  // A place by how far up the band it is, at x: t 0 the foot, 1 the top;
  // below 0 out on the low meadow, above 1 back on the high one.
  function placeOn(x, t) {
    const w = width(x);
    const z = t < 0 ? foot(x) - t * BEYOND : t > 1 ? foot(x) - w - (t - 1) * BEYOND : foot(x) - t * w;
    return { x, z, y: heightAt(x, z) };
  }

  return { steep, height, heightAt, normalAt, slopeAt, placeOn, foot, width, share, apronAt, onApron, repose: REPOSE };
}

// The workshop's ground colours (its src/terrain.js: the look is followed):
// a green field, a hint of earth on slopes from about 20° and of rock from
// about 35°. Past that the workshop's maps never go, so its hint stays
// slight. Here the band is steeper, and soil can't stay on ground much
// steeper than 35°, so the hint grows with the
// steepness: a 60° face is mostly bare, and rock set in it stands in bare
// ground, not in a lawn.
const FIELD = new THREE.Color('#759553');
const EARTH = new THREE.Color('#8d8352');
const ROCK = new THREE.Color('#8b857b');
const HINT = 0.3;   // on ground up to 35°, and on any ground when none of it is bare
const BARE = 0.85;  // on ground from 55°, when all of it is bare
const SCREE = new THREE.Color('#9a927c'); // the apron: broken rock and earth
const SCREE_SHARE = 0.7;

// The land as one flat-shaded mesh: `step` m to a square, each square two
// facets, each facet coloured by how steep it is. bare, 0 to 1: how bare
// the steep ground is (0: the workshop's slight hint everywhere; 1: a 60°
// face mostly bare). The page ties it to "how much shows": the more rock
// shows on the edge, the less soil lies on it.
export function landMesh(land, { step = 0.5, bare = 0 } = {}) {
  const { x0, x1, z0, z1 } = land.size ?? LAND_SIZE;
  const nx = Math.round((x1 - x0) / step);
  const nz = Math.round((z1 - z0) / step);
  const position = new Float32Array(nx * nz * 18);
  const normal = new Float32Array(nx * nz * 18);
  const color = new Float32Array(nx * nz * 18);
  const corner = (i, j) => {
    const x = x0 + i * step;
    const z = z0 + j * step;
    return [x, land.heightAt(x, z), z];
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const tint = new THREE.Color(), ground = new THREE.Color();
  let t = 0;
  const facet = (p, q, r) => {
    a.fromArray(p); b.fromArray(q); c.fromArray(r);
    n.subVectors(b, a).cross(c.sub(a)).normalize();
    const angle = radToDeg(Math.acos(clamp(Math.abs(n.y), 0, 1)));
    ground.copy(FIELD).lerp(EARTH, smoothstep(angle, 20, 32)).lerp(ROCK, smoothstep(angle, 34, 44));
    tint.copy(FIELD).lerp(ground, HINT + (BARE - HINT) * clamp(bare, 0, 1) * smoothstep(angle, 35, 55));
    if (land.onApron) tint.lerp(SCREE, SCREE_SHARE * land.onApron((p[0] + q[0] + r[0]) / 3, (p[2] + q[2] + r[2]) / 3));
    for (const v of [p, q, r]) {
      position.set(v, t * 3);
      normal.set([n.x, n.y, n.z], t * 3);
      color.set([tint.r, tint.g, tint.b], t * 3);
      t++;
    }
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p00 = corner(i, j), p10 = corner(i + 1, j), p01 = corner(i, j + 1), p11 = corner(i + 1, j + 1);
      // Cut along the flatter of its two diagonals, so the facets follow
      // the lie of the land instead of saw-toothing across a bend.
      // (Wound so the facets face up: +y.)
      if (Math.abs(p00[1] - p11[1]) <= Math.abs(p10[1] - p01[1])) {
        facet(p00, p01, p11);
        facet(p00, p11, p10);
      } else {
        facet(p00, p01, p10);
        facet(p10, p01, p11);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.name = 'land';
  mesh.receiveShadow = true;
  return mesh;
}
