import * as THREE from 'three';
import { SUN, rockOutput } from './output.js';

// How the page draws rocks: what src/output.js hands over, as one mesh,
// flat shaded, a colour a facet. Nothing about the look is decided here.
export { SUN };

// One mesh for these rocks. tone: one seed and size for them all (a
// cluster's); without it each rock has its own. The mesh keeps how many
// triangles it draws (userData.triangles), and its rocks (userData.rocks:
// a download of the model lists them, src/exportModel.js).
export function drawRocks(rocks, ground, { tone = null } = {}) {
  const out = rockOutput(rocks, ground, { tone });
  const T = out.reduce((sum, o) => sum + o.triangles, 0);
  const position = new Float32Array(T * 9);
  const normal = new Float32Array(T * 9);
  const color = new Float32Array(T * 9);
  let at = 0;
  for (const o of out) {
    position.set(o.positions, at);
    normal.set(o.normals, at);
    color.set(o.colors, at);
    at += o.triangles * 9;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  mesh.name = 'granite';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.triangles = T;
  mesh.userData.rocks = rocks;
  return mesh;
}
