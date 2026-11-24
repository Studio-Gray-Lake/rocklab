import * as THREE from 'three';
import { createLand } from './land.js';
import { makeCluster } from './cluster.js';
import { makeCourses } from './courses.js';
import { apronFor, makeEdge } from './edge.js';
import { makeLayers } from './layers.js';
import { createHills } from './hills.js';
import { kindOn } from './settings.js';

// From the page's settings (src/settings.js) to what each tab makes: a
// stone, a cluster, a cliff, a land. Nothing is drawn here, so the checks
// can make what the page makes (tests/settings.test.js).
//
// Each level is handed only its own settings and those of the levels it
// is made of: a stone doesn't know what cluster it is in, a cluster what
// cliff, a cliff what land.

const { degToRad } = THREE.MathUtils;

// Where along the test slope's band the one stone, or the one cluster, sits (m).
export const SPOT_X = -8;

// What every rock of a kind is handed: the stone's own settings and the
// cluster's, as the makers want them (angles in radians).
export function sharedOf(s, kind = s.kind) {
  return {
    kind, seed: s.seed, size: s.size, age: s.age, thick: kind === 'layered' ? s.bed : s.thick,
    pieces: s.pieces, mix: s.mix, noise: s.noise, cross: s.cross,
    slant: degToRad(s.slant), lean: degToRad(s.lean), turn: degToRad(s.turn),
    shows: s.shows, least: s.least, under: s.under,
  };
}

// One stone: a cluster's first rock, alone, and lying on its grain
// exactly (how far a rock strays off the grain is the cluster's to say).
export function stoneOf(land, s, over = {}, kind = s.kind) {
  return makeCluster(land, { ...sharedOf(s, kind), pieces: 1, noise: 0, ...over });
}

// One cluster: granite's heap, or layered rock's stack of courses.
export function clusterOf(land, s, over = {}, kind = s.kind) {
  return kind === 'layered'
    ? makeCourses(land, { ...sharedOf(s, kind), courses: s.courses, slabs: s.slabs, step: s.step, ...over })
    : makeCluster(land, { ...sharedOf(s, kind), ...over });
}

// What the stone's tab and the cluster's show at a place: thingOf(tab)(land, s, over, kind).
export const thingOf = (tab) => (tab === 'stone' ? stoneOf : clusterOf);

// The cliff on the test slope: granite's is clusters along the band;
// layered rock's is its beds running the length of the face.
export function cliffOf(land, s) {
  return s.kind === 'layered'
    ? makeLayers(land, { ...sharedOf(s), fallen: s.fallen, patchy: s.patchy, patch: s.patch })
    : makeEdge(land, {
      ...sharedOf(s), spots: s.spots, uneven: s.uneven, fallen: s.fallen, rim: s.rim,
      patchy: s.patchy, patch: s.patch, drift: s.drift,
    });
}

// The test slope a tab stands on. (Under a cliff it has its bank of
// fallen rock at the foot.)
export function testLandOf(s, tab) {
  return createLand({
    steep: s.steep,
    apron: tab === 'cliff' ? apronFor({ shows: s.shows, fallen: s.fallen, seed: s.seed, patchy: s.patchy, patch: s.patch }) : null,
  });
}

// The land of hills.
export function hillsOf(s) {
  return createHills({
    seed: s.landSeed, count: s.hillCount, hilly: s.hilly, beds: s.hardBeds, tall: s.bandTall,
    steep: s.bandSteep, uneven: s.bandUneven, tilt: s.bedTilt, toward: s.bedToward,
  });
}

// What the land's rock is laid with (src/place.js placerFor): granite.
export function cliffsOf(s) {
  return {
    ...sharedOf(s, kindOn('land', s.kind)), spots: s.spots, uneven: s.uneven, fallen: s.fallen, rim: s.rim,
    patchy: s.patchy, patch: s.patch, drift: s.drift, slope: s.slopeSay,
  };
}

// What a tab makes from the settings, whole: its land, and (on the test
// slope) the thing on it. The land's own rock is not made here: it takes
// seconds, and the page lays it a thing at a time (src/place.js).
export function madeOn(tab, s) {
  if (tab === 'land') return { land: hillsOf(s) };
  const land = testLandOf(s, tab);
  if (tab === 'cliff') return { land, made: cliffOf(land, s) };
  const at = land.placeOn(SPOT_X, s.where);
  return { land, at, made: thingOf(tab)(land, s, { x: at.x, z: at.z }) };
}
