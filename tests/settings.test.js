import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRANITE } from '../src/granite.js';
import { LAYERED } from '../src/layered.js';
import { BED } from '../src/bed.js';
import { CLUSTER } from '../src/cluster.js';
import { COURSES } from '../src/courses.js';
import { EDGE } from '../src/edge.js';
import { LAND_DEFAULTS, STEEPEST } from '../src/land.js';
import { HILLS } from '../src/hills.js';
import { LAND_ROCK } from '../src/landRock.js';
import { FIRST_TAB, GROUPS, ROWS, STARTS, TABS, TAB_KEYS, defaultSettings, keysOn, kindOn, panelOf, rowOf, showsOn, sizeOn } from '../src/settings.js';
import { cliffsOf, madeOn, sharedOf } from '../src/make.js';
import { rowsAmiss } from '../scripts/rows.js';

// The page's settings in one table (src/settings.js), and its four tabs:
// Stone, Cluster, Cliff, Land. A tab shows
// its own level's rows and, folded away, those of the levels it is made
// of; never a row of a level above it.

const KINDS = ['granite', 'layered'];
const level = (tab) => TAB_KEYS.indexOf(tab);

test('the tabs are the four levels, small to big, and the page opens on the cliff as it always has', () => {
  assert.deepEqual(TAB_KEYS, ['stone', 'cluster', 'cliff', 'land']);
  assert.equal(FIRST_TAB, 'cliff');
  for (const tab of TABS) assert.ok(tab.name && tab.made, `the ${tab.key} tab has no name or no line saying what it is`);
});

test('every row has a key of its own, a name, and a start inside its slider', () => {
  const keys = ROWS.map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length, 'two rows share a key');
  for (const row of ROWS) {
    assert.ok(row.name.length > 0 && row.name.length <= 60, `"${row.key}" has no name, or one too long for a row`);
    if (row.range) {
      const [least, most, step] = row.range;
      assert.ok(least < most && step > 0, `"${row.key}": its slider is [${row.range}]`);
      assert.ok(row.value >= least && row.value <= most, `"${row.key}" starts at ${row.value}, outside its slider`);
      const steps = (row.value - least) / step;
      assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `"${row.key}" starts at ${row.value}, between two steps of its slider`);
    } else if (row.choices) {
      assert.ok(Object.values(row.choices).includes(row.value), `"${row.key}" starts at a choice it doesn't offer`);
    } else {
      assert.equal(typeof row.value, 'boolean', `"${row.key}" is no slider, no list and no tick`);
    }
  }
  // (two rows of one folder never have one name)
  for (const group of GROUPS) assert.equal(new Set(group.rows.map((row) => row.name)).size, group.rows.length, `two rows of "${group.key}" share a name`);
});

test('every row has a tip: a line or two, saying what it changes', () => {
  for (const row of ROWS) {
    assert.ok(typeof row.tip === 'string' && row.tip.length >= 30 && row.tip.length <= 240, `"${row.key}" has no tip, or one too short or too long (${row.tip?.length})`);
    assert.ok(/[.!?]$/.test(row.tip), `"${row.key}": its tip doesn't end a sentence`);
  }
});

test('the table starts every setting where its maker does: nothing has moved', () => {
  const s = defaultSettings();
  const makers = {
    thick: GRANITE.thick, bed: LAYERED.bed, least: BED.least, under: BED.under,
    pieces: CLUSTER.pieces, mix: CLUSTER.mix, noise: CLUSTER.noise, cross: CLUSTER.cross,
    courses: COURSES.courses, slabs: COURSES.slabs, step: COURSES.step,
    spots: EDGE.spots, uneven: EDGE.uneven, rocky: EDGE.rocky, fallen: EDGE.fallen, rim: EDGE.rim, patchy: EDGE.patchy, patch: EDGE.patch, drift: EDGE.drift,
    steep: LAND_DEFAULTS.steep,
    hillCount: HILLS.count, hilly: HILLS.hilly, hardBeds: HILLS.beds, bandTall: HILLS.tall, bandSteep: HILLS.steep,
    bandUneven: HILLS.uneven, bedTilt: HILLS.tilt, bedToward: HILLS.toward,
  };
  for (const [key, value] of Object.entries(makers)) assert.equal(s[key], value, `"${key}" starts at ${s[key]} in the table, ${value} in its maker`);
  const ranges = {
    size: GRANITE.size, thick: GRANITE.thickRange, bed: LAYERED.bedRange,
    pieces: [1, CLUSTER.roles.length], courses: COURSES.coursesRange, slabs: COURSES.slabsRange,
    spots: EDGE.spotsRange, patch: EDGE.patchRange, steep: [0, STEEPEST],
    hillCount: HILLS.countRange, hilly: HILLS.hillyRange, hardBeds: HILLS.bedsRange, bandTall: HILLS.tallRange,
    bandSteep: HILLS.steepRange, bedTilt: HILLS.tiltRange,
  };
  for (const [key, [least, most]] of Object.entries(ranges)) assert.deepEqual(rowOf(key).range.slice(0, 2), [least, most], `"${key}": its slider is not its maker's`);
  assert.deepEqual(GRANITE.size, LAYERED.size);
  assert.equal(STARTS.land.size, LAND_ROCK.size);
  // The starting settings, as the page opened before the table.
  assert.deepEqual(s, {
    kind: 'granite', shows: 0.8, age: 0.15, size: 4, thick: 0.6, bed: 0.3, seed: 1, slant: 35, lean: 0, turn: 20, least: 0.3, under: 45,
    pieces: 8, mix: 0.5, noise: 0.15, cross: 0.35, courses: 3, slabs: 3, step: 0.45,
    spots: 8, uneven: 0.6, fallen: 0.6, rim: 0.6, rocky: 0, patchy: 0, patch: 9, drift: 0, steep: 60, where: 0.45,
    landSeed: 1, hillCount: 4, hilly: 5, hardBeds: 2, bandTall: 5, bandSteep: 60, bandUneven: 0.5, bedTilt: 0, bedToward: 30,
    rock: true, byPlace: true, slopeSay: 1, shadows: true, labels: true, workshop: true, contours: true, marks: true, walk: true,
  });
  assert.deepEqual(STARTS, { granite: { slant: 35, size: 4 }, layered: { slant: 15, size: 2.4 }, land: { size: 3 } });
  assert.equal(sizeOn('land', 'layered'), 3);
  assert.equal(sizeOn('cliff', 'layered'), 2.4);
});

test('a tab shows its own level\'s rows open, the levels it is made of folded under their names, and nothing of a level above', () => {
  for (const tab of TAB_KEYS) {
    for (const kind of KINDS) {
      const panel = panelOf(tab, kind);
      const shown = keysOn(tab, kind);
      assert.equal(new Set(shown).size, shown.length, `${tab}, ${kind}: a row is shown twice`);
      // nothing of a level above it
      for (const key of shown) {
        const { group } = rowOf(key);
        if (group.level) assert.ok(level(group.level) <= level(tab), `the ${tab} tab shows "${key}", a ${group.level}'s row`);
      }
      // its own level: every group of it, a folder of its own
      const own = GROUPS.filter((group) => group.level === tab && ROWS.some((row) => row.group === group && showsOn(row, tab, kind)));
      assert.ok(own.length > 0, `the ${tab} tab has no rows of its own for ${kind}`);
      for (const group of own) {
        const section = panel.find((s) => s.key === group.key);
        assert.ok(section && section.open === !group.closed, `the ${tab} tab does not show "${group.title}" as its own`);
      }
      // each level below it: one folder, folded, named for what it is made of; the nearest first
      const below = panel.filter((section) => section.key.startsWith('below '));
      assert.deepEqual(below.map((section) => section.title), TABS.slice(0, level(tab)).reverse().map((t) => t.below), `${tab}, ${kind}: the levels it is made of`);
      for (const section of below) assert.equal(section.open, false, `the ${tab} tab shows "${section.title}" unfolded`);
      // the first rows first, the view last
      assert.equal(panel[0].key, 'top');
      assert.equal(panel[0].title, undefined);
      assert.equal(panel.at(-1).key, 'view');
      for (const section of panel) assert.ok((section.rows ?? section.parts).length > 0, `${tab}, ${kind}: "${section.title}" is an empty folder`);
    }
  }
});

test('the rows are for the kind of rock on show; the land\'s rock is granite whichever is picked', () => {
  assert.equal(kindOn('land', 'layered'), 'granite');
  assert.equal(kindOn('cliff', 'layered'), 'layered');
  assert.deepEqual(keysOn('land', 'layered'), keysOn('land', 'granite'));
  assert.ok(!keysOn('land', 'granite').includes('kind'), 'the land has a "kind" row, and one kind of rock');
  for (const tab of ['stone', 'cluster', 'cliff']) {
    assert.ok(keysOn(tab, 'granite').includes('thick') && !keysOn(tab, 'granite').includes('bed'));
    assert.ok(keysOn(tab, 'layered').includes('bed') && !keysOn(tab, 'layered').includes('thick'));
  }
  // layered rock's cluster is a stack of courses; its cliff is not made of stacks
  assert.ok(keysOn('cluster', 'layered').includes('courses') && !keysOn('cluster', 'granite').includes('courses'));
  assert.ok(!keysOn('cliff', 'layered').includes('courses'));
  // the test slope is under a stone, a cluster and a cliff, not under the land
  assert.ok(keysOn('cliff', 'granite').includes('steep') && !keysOn('land', 'granite').includes('steep'));
  assert.ok(keysOn('stone', 'granite').includes('where') && !keysOn('cliff', 'granite').includes('where'));
});

test('every setting is shown on some tab, and what a level is handed is its own settings and those under it', () => {
  for (const row of ROWS) {
    assert.ok(TAB_KEYS.some((tab) => KINDS.some((kind) => showsOn(row, tab, kind))), `"${row.key}" is shown nowhere`);
  }
  // (angles go to the makers in radians; the land's cliffs are granite, with granite's thickness)
  const s = { ...defaultSettings(), kind: 'layered' };
  assert.equal(sharedOf(s).thick, s.bed);
  assert.ok(Math.abs(sharedOf(s).slant - (s.slant * Math.PI) / 180) < 1e-12);
  assert.equal(cliffsOf(s).kind, 'granite');
  assert.equal(cliffsOf(s).thick, s.thick);
  assert.equal(cliffsOf(s).slope, s.slopeSay);
});

// Every slider at its least, its most and a third of the way between
// (scripts/rows.js). The Cliff tab is checked the same way by hand,
// `npm run check:rows`: a cliff takes a second to make.
for (const tab of ['stone', 'cluster']) {
  for (const kind of KINDS) {
    test(`the ${tab} tab, ${kind}: every slider it shows changes what is made, at either end, and no slider it hides does`, () => {
      const { amiss } = rowsAmiss(tab, kind);
      assert.deepEqual(amiss.map(({ key, what }) => `"${key}" ${what}`), []);
    });
  }
}

test('one stone is one rock, lying on its grain exactly: a cluster\'s first rock, before the cluster strays it', () => {
  for (const kind of KINDS) {
    const s = { ...defaultSettings(), kind, ...STARTS[kind] };
    const stone = madeOn('stone', s).made;
    assert.equal(stone.rocks.length, 1);
    assert.equal(stone.rocks[0].kind, kind);
    // (a cluster's rows change nothing of it)
    assert.deepEqual(madeOn('stone', { ...s, noise: 1, pieces: 12, mix: 1, cross: 0.5 }).made.list, stone.list);
  }
  // granite: the cluster of one, with no stray, is the stone
  const s = defaultSettings();
  assert.deepEqual(madeOn('cluster', { ...s, pieces: 1, noise: 0 }).made.list, madeOn('stone', s).made.list);
});

test('the land of hills is made from the land\'s own rows, and from none of the rock\'s', () => {
  const s = defaultSettings();
  const heights = (land) => {
    const out = [];
    for (let x = land.size.x0; x <= land.size.x1; x += 8) for (let z = land.size.z0; z <= land.size.z1; z += 8) out.push(land.heightAt(x, z));
    return out;
  };
  const base = heights(madeOn('land', s).land);
  const mine = ROWS.filter((row) => row.group.level === 'land' && row.range && row.key !== 'slopeSay');
  assert.equal(mine.length, 9);
  for (const row of mine) {
    const given = { ...s, ...(row.given ?? {}) };
    const [least, most, step] = row.range;
    const third = least + Math.round((most - least) / 3 / step) * step;
    const [a, b, c] = [least, most, third].map((value) => heights(madeOn('land', { ...given, [row.key]: value }).land));
    assert.ok(JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(a) !== JSON.stringify(c), `"${row.key}" changes nothing of the land`);
  }
  for (const row of ROWS.filter((r) => r.group.level && r.group.level !== 'land' && r.range)) {
    assert.deepEqual(heights(madeOn('land', { ...s, [row.key]: row.range[1] }).land), base, `"${row.key}", a ${row.group.level}'s row, changes the land`);
  }
});
