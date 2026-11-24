// A slow field, along a line or over a land: a number that changes
// gradually with place, so neighbours are alike and far places differ.
//
// Everything else in Rock Lab is drawn rock by rock, each draw on its own.
// This is the one thing neighbours share. The edge uses it for where rock
// gathers and where it thins, and for how the grain's tilt drifts; the
// land of hills, for where a hard bed is thick and where it's thin.
//
// Seeded, like everything else: the same seed gives the same field.

// An integer's bits well mixed (integer arithmetic only, so it's the same
// everywhere).
function mix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

// The field's own number at a whole step along the line: -1 to 1.
const at = (seed, which, step) => (mix((mix((mix(seed | 0) + (which | 0)) >>> 0) + (step | 0)) >>> 0) / 4294967295) * 2 - 1;

// The field's own number at a whole step each way over a land: -1 to 1.
const at2 = (seed, which, i, j) => (mix((mix((mix((mix(seed | 0) + (which | 0)) >>> 0) + (i | 0)) >>> 0) + (j | 0)) >>> 0) / 4294967295) * 2 - 1;

// A slow field over a land: (x, z) => a number from -1 to 1 that takes
// about `length` m to go from one value to the next, any way you walk.
export function slowField2(seed, length, which = 0) {
  const span = Math.max(length, 0.01);
  const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);
  // (Its numbers near the middle are kept once worked out: a land asks
  // for the same few of them hundreds of thousands of times.)
  const KEPT = 24;
  const side = 2 * KEPT + 1;
  const kept = new Float64Array(side * side).fill(NaN);
  const at = (i, j) => {
    if (i < -KEPT || i > KEPT || j < -KEPT || j > KEPT) return at2(seed, which, i, j);
    const k = (j + KEPT) * side + i + KEPT;
    if (kept[k] !== kept[k]) kept[k] = at2(seed, which, i, j);
    return kept[k];
  };
  return (x, z) => {
    const fx = x / span, fz = z / span;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = ease(fx - i), v = ease(fz - j);
    const a = at(i, j), c = at(i, j + 1);
    const near = a + (at(i + 1, j) - a) * u;
    const far = c + (at(i + 1, j + 1) - c) * u;
    return near + (far - near) * v;
  };
}

// A slow field: (x) => a number from -1 to 1 that takes about `length` m
// to go from one value to the next. which: a number to tell one field of a
// seed from another (the patches' from the tilt's).
export function slowField(seed, length, which = 0) {
  const span = Math.max(length, 0.01);
  return (x) => {
    const step = Math.floor(x / span);
    const t = x / span - step;
    const ease = t * t * t * (t * (6 * t - 15) + 10); // level at each step, so no kinks
    const from = at(seed, which, step);
    return from + (at(seed, which, step + 1) - from) * ease;
  };
}
