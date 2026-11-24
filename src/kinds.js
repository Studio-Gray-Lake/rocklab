import { GRANITE, shapeGranite } from './granite.js';
import { LAYERED, shapeLayered } from './layered.js';

// The kinds of rock (a kind is how a rock breaks): each with its maker, its thickness slider, and how thin a piece of it may be.

export const KINDS = {
  granite: {
    name: 'granite',
    shape: shapeGranite,
    thick: GRANITE.thick,
    thickRange: GRANITE.thickRange,
    thin: 0.25, // at least a quarter as thick as long
  },
  layered: {
    name: 'layered rock',
    shape: shapeLayered,
    thick: LAYERED.bed,
    thickRange: LAYERED.bedRange,
    thin: LAYERED.thin,
  },
};

// The maker of a kind's rocks: ({ seed, size, age, thick }) => a shape.
export function shapeOf(kind = 'granite') {
  if (!KINDS[kind]) throw new Error(`no kind of rock "${kind}"`);
  return KINDS[kind].shape;
}
