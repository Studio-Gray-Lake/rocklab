import * as THREE from 'three';

// The corners of a convex solid given as planes: each plane is
// [nx, ny, nz, d], and the solid is where n · p <= d for every plane.
// A corner is where three planes meet, inside all the others.
//
// A box round it (±1.4) bounds the solid where the planes alone wouldn't
// close it. closed: the planes close it themselves, so the box is only
// added if a corner reaches it. Otherwise the box touches nothing, and the
// corners, and their order, are the same without it, found in about half
// the time.
export function cornersOf(cuts, closed = false) {
  if (closed) {
    const corners = cornersAmong(cuts);
    const inBox = (p) => Math.abs(p.x) < 1.4 - 1e-6 && Math.abs(p.y) < 1.4 - 1e-6 && Math.abs(p.z) < 1.4 - 1e-6;
    if (corners.length >= 4 && corners.every(inBox)) return corners;
  }
  return cornersAmong([...cuts, ...BOUNDS]);
}

const BOUNDS = [[1, 0, 0, 1.4], [-1, 0, 0, 1.4], [0, 1, 0, 1.4], [0, -1, 0, 1.4], [0, 0, 1, 1.4], [0, 0, -1, 1.4]];

function cornersAmong(cuts) {
  const L = Float64Array.from(cuts.flat()); // 4 numbers a plane
  const P = L.length / 4;
  const found = new Map();
  for (let i = 0; i < P * 4; i += 4) {
    for (let j = i + 4; j < P * 4; j += 4) {
      // n_i × n_j
      const ijx = L[i + 1] * L[j + 2] - L[i + 2] * L[j + 1];
      const ijy = L[i + 2] * L[j] - L[i] * L[j + 2];
      const ijz = L[i] * L[j + 1] - L[i + 1] * L[j];
      for (let k = j + 4; k < P * 4; k += 4) {
        const det = L[k] * ijx + L[k + 1] * ijy + L[k + 2] * ijz;
        if (Math.abs(det) < 1e-9) continue; // two of them parallel
        // p = (d_i (n_j × n_k) + d_j (n_k × n_i) + d_k (n_i × n_j)) / det
        const jkx = L[j + 1] * L[k + 2] - L[j + 2] * L[k + 1];
        const jky = L[j + 2] * L[k] - L[j] * L[k + 2];
        const jkz = L[j] * L[k + 1] - L[j + 1] * L[k];
        const kix = L[k + 1] * L[i + 2] - L[k + 2] * L[i + 1];
        const kiy = L[k + 2] * L[i] - L[k] * L[i + 2];
        const kiz = L[k] * L[i + 1] - L[k + 1] * L[i];
        const x = (L[i + 3] * jkx + L[j + 3] * kix + L[k + 3] * ijx) / det;
        const y = (L[i + 3] * jky + L[j + 3] * kiy + L[k + 3] * ijy) / det;
        const z = (L[i + 3] * jkz + L[j + 3] * kiz + L[k + 3] * ijz) / det;
        let m = 0;
        while (m < P * 4 && L[m] * x + L[m + 1] * y + L[m + 2] * z <= L[m + 3] + 1e-9) m += 4;
        if (m < P * 4) continue; // outside one of them
        // (Where more than three meet, one corner.)
        const key = `${Math.round(x * 1e7)},${Math.round(y * 1e7)},${Math.round(z * 1e7)}`;
        if (!found.has(key)) found.set(key, new THREE.Vector3(x, y, z));
      }
    }
  }
  return [...found.values()];
}
