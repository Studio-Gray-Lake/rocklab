import * as THREE from 'three';
import { entryOf } from './cluster.js';

// The rocks on show as a 3D model (.glb), as they stand: each drawing of
// rocks (src/rockLook.js drawRocks, which marks its mesh with its rocks)
// one mesh of flat facets in their own colours, where it stands in the
// world. The list of rocks that makes them again (each rock's kind, seed,
// size, age, thickness, place and turn), the settings, which tab and which
// Rock Lab ride along in the scene's extras. The file is the viewer's to
// use for anything: CC0, as LICENSE says.

export const MODEL_LICENCE = 'CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/';

// The model, as a three.js scene: one mesh a drawing of rocks. meshes:
// the drawn meshes to take (each with userData.rocks); about: { version,
// tab, settings }. Gives { root, rocks, triangles }.
export function modelOf(meshes, about = {}) {
  const root = new THREE.Group();
  root.name = 'Rock Lab';
  const material = new THREE.MeshStandardMaterial({ name: 'rock', vertexColors: true, roughness: 0.92, flatShading: true });
  const list = [];
  let triangles = 0;
  meshes.forEach((drawn, i) => {
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) geometry.setAttribute(name, drawn.geometry.getAttribute(name).clone());
    drawn.updateWorldMatrix(true, false);
    geometry.applyMatrix4(drawn.matrixWorld);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `rocks ${i + 1}`;
    root.add(mesh);
    triangles += geometry.getAttribute('position').count / 3;
    for (const rock of drawn.userData.rocks ?? []) list.push(entryOf(rock));
  });
  root.userData = { rocklab: { ...about, rocks: list, licence: MODEL_LICENCE } };
  return { root, rocks: list.length, triangles };
}

// The same, written as a .glb file (in the browser). Gives { blob, rocks,
// triangles }.
export async function exportModel(meshes, about = {}) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { root, rocks, triangles } = modelOf(meshes, about);
  const glb = await new GLTFExporter().parseAsync(root, { binary: true });
  return { blob: new Blob([glb], { type: 'model/gltf-binary' }), rocks, triangles };
}
