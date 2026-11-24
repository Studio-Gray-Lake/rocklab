// The same rocks: a fingerprint of every level at its starting settings,
// so a change that should leave the rocks alone can show it did.
// tests/same-rocks.test.js holds the fingerprints as recorded; run this
// file to print them afresh:
//   node --import ./tests/hooks.js scripts/same-rocks.js
//
// A fingerprint is FNV-1a (32 bit) over each rock in order: its triangles'
// corners and normals, bit for bit, and its line in the list (kind, seed,
// size, age, thickness, place and turn).

import { STARTS, defaultSettings } from '../src/settings.js';
import { cliffsOf, madeOn } from '../src/make.js';
import { bandsOf } from '../src/hills.js';
import { placeOn } from '../src/place.js';
import { EXTRAS } from '../src/extras.js';
import { drawRocks } from '../src/rockLook.js';

function fnv(hash, bytes) {
  let h = hash;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const text = new TextEncoder();
const bytesOf = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

export function fingerprintOf(made) {
  let h = 0x811c9dc5;
  made.rocks.forEach((rock, i) => {
    h = fnv(h, bytesOf(rock.positions));
    h = fnv(h, bytesOf(rock.normals));
    h = fnv(h, text.encode(JSON.stringify(made.list[i])));
  });
  return { rocks: made.rocks.length, hash: h.toString(16).padStart(8, '0') };
}

// Each level at its starting settings, as the page opens it.
export const LEVELS = {
  'granite stone': () => madeOn('stone', settingsFor('granite')).made,
  'layered stone': () => madeOn('stone', settingsFor('layered')).made,
  'granite cluster': () => madeOn('cluster', settingsFor('granite')).made,
  'layered cluster': () => madeOn('cluster', settingsFor('layered')).made,
  'granite cliff': () => madeOn('cliff', settingsFor('granite')).made,
  'layered cliff': () => madeOn('cliff', settingsFor('layered')).made,
  'land': () => {
    const s = { ...defaultSettings(), size: STARTS.land.size };
    const land = madeOn('land', s).land;
    // (Laid by place, as the page opens it; the old way, along the lines, if untick.)
    if (s.byPlace || !EXTRAS.oldWay) return placeOn(land, land.size, cliffsOf(s));
    return EXTRAS.oldWay.makeCliffs(land, bandsOf(land), cliffsOf(s));
  },
};

function settingsFor(kind) {
  return { ...defaultSettings(), kind, ...STARTS[kind] };
}

// What the page draws of a cluster or a cliff, as its tab does: every
// triangle shown, with its corners, normals and colours, bit for bit.
export const DRAWN = {
  'granite cluster': () => drawnOf('cluster', 'granite'),
  'layered cluster': () => drawnOf('cluster', 'layered'),
  'granite cliff': () => drawnOf('cliff', 'granite'),
  'layered cliff': () => drawnOf('cliff', 'layered'),
};

function drawnOf(tab, kind) {
  const s = settingsFor(kind);
  const { land, made } = madeOn(tab, s);
  return drawRocks(made.rocks, land.heightAt, { tone: { seed: s.seed, size: s.size } });
}

export function drawnFingerprintOf(mesh) {
  let h = 0x811c9dc5;
  for (const name of ['position', 'normal', 'color']) h = fnv(h, bytesOf(mesh.geometry.getAttribute(name).array));
  return { triangles: mesh.userData.triangles, hash: h.toString(16).padStart(8, '0') };
}

export function fingerprints() {
  return {
    rocks: Object.fromEntries(Object.entries(LEVELS).map(([name, make]) => [name, fingerprintOf(make())])),
    drawn: Object.fromEntries(Object.entries(DRAWN).map(([name, draw]) => [name, drawnFingerprintOf(draw())])),
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}`) {
  console.log(JSON.stringify(fingerprints(), null, 2));
}
