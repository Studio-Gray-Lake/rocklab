import * as THREE from 'three';

// Contour lines, as on a map: a line round the land at every metre of
// height, a bolder one at every fifth. Far apart where the ground is gentle, crowded where it
// is steep: so the land's shape reads at a glance, and the crowded places
// can be checked against the marked bands.
//
// They are cut from the drawn ground's own facets, so every line lies on
// the ground as drawn.

export const CONTOURS = {
  every: 1,    // m of height between lines
  bold: 5,     // every this many lines, a bolder one
  lift: 0.05,  // m: how far above the ground they're drawn
};

// The contour lines of a ground mesh (land.js landMesh): each a pair of
// points at one height. Gives { thin, bold }, each a flat list of numbers
// (x, y, z for one end, then the other), and how many heights have a line.
export function contoursOf(ground, { every = CONTOURS.every, bold = CONTOURS.bold } = {}) {
  const position = ground.geometry.attributes.position.array;
  const lines = { thin: [], bold: [] };
  const heights = new Set();
  const cut = (a, b, y) => {
    const t = (y - position[a + 1]) / (position[b + 1] - position[a + 1]);
    return [position[a] + (position[b] - position[a]) * t, y, position[a + 2] + (position[b + 2] - position[a + 2]) * t];
  };
  for (let i = 0; i < position.length; i += 9) {
    const corners = [i, i + 3, i + 6];
    const ys = corners.map((c) => position[c + 1]);
    const [low, high] = [Math.min(...ys), Math.max(...ys)];
    // Every height of a line that passes through this facet. (The plain,
    // at nothing, has none.)
    for (let n = Math.max(1, Math.floor(low / every) + 1); n * every < high; n++) {
      const y = n * every;
      const ends = [];
      for (let e = 0; e < 3; e++) {
        const [a, b] = [corners[e], corners[(e + 1) % 3]];
        if ((position[a + 1] > y) !== (position[b + 1] > y)) ends.push(cut(a, b, y));
      }
      if (ends.length !== 2) continue;
      (n % bold === 0 ? lines.bold : lines.thin).push(...ends[0], ...ends[1]);
      heights.add(n);
    }
  }
  return { ...lines, heights: heights.size };
}

// The lines drawn: thin ones faint, bold ones dark.
export function contourLines(ground, { every = CONTOURS.every, bold = CONTOURS.bold, lift = CONTOURS.lift } = {}) {
  const made = contoursOf(ground, { every, bold });
  const group = new THREE.Group();
  group.name = 'contours';
  for (const [name, opacity] of [['thin', 0.4], ['bold', 0.9]]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(made[name], 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x3f2f1f, transparent: true, opacity }));
    lines.position.y = lift;
    lines.name = name;
    group.add(lines);
  }
  group.userData.heights = made.heights;
  return group;
}
