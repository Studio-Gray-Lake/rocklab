// The page's settings, in one table.
//
// Rock Lab builds in four levels, each made only of the one before it and
// a rule: a stone; a cluster of stones; a cliff of clusters; a land of
// cliffs. The page has a tab for each (TABS).
//
// Every setting is a row of this table, and every row is in a group. A
// group belongs to a level, and shows:
//   - on its own level's tab, open;
//   - on the tabs of the levels above it, folded away under a name that
//     says what that level is made of ("its clusters", "its stones");
//   - never on a tab below it: a stone doesn't know what cluster it is in.
// A few groups belong to no level (the first rows, the test slope, the
// view): they list the tabs they show on.
//
// A row is: its key (what the code calls it), the name the page shows
// (free to change: nothing else reads it), what it starts at, and its
// slider's [least, most, step]; or its list of choices; or, starting at
// true or false, a tick. And where it shows, where that is narrower than
// its group's:
//   kind:  only for this kind of rock;
//   tabs:  only on these tabs;
//   off:   never on these ('tab:kind'): it does nothing there;
//   given: what else must be set for it to do anything (a patch's size
//          means nothing with no patchiness). The checks use it.
//
// The numbers are the makers' own (each maker's file has them as what it
// falls back on); tests/settings.test.js fails if one moves without the
// other. The page (src/main.js) builds its panel from panelOf().

// The tabs, small to big. `made`: what the level is, in a line. `below`:
// what a level above calls its rows.
export const TABS = [
  { key: 'stone', name: 'Stone', made: 'one rock', below: 'its stones' },
  { key: 'cluster', name: 'Cluster', made: 'a handful of stones, as one mass', below: 'its clusters' },
  { key: 'cliff', name: 'Cliff', made: 'clusters along one steep band, with its foot and its rim', below: 'its cliffs' },
  { key: 'land', name: 'Land', made: 'hills, with cliffs along their steep bands and stones between' },
];
export const TAB_KEYS = TABS.map((tab) => tab.key);
// The tab the page opens on (as it always has: the cliff).
export const FIRST_TAB = 'cliff';
const levelOf = (tab) => TAB_KEYS.indexOf(tab);

const EVERY = TAB_KEYS;
const TEST = ['stone', 'cluster', 'cliff'];   // the tabs that stand on the test slope

// What a kind of rock starts at, and the land. (Each kind has the slant
// and the size that suit it: granite 35° with 4 m blocks;
// layered rock gentler and finer, so its beds read as layers. The land's
// bands are lower than the test slope, so its rock is smaller.)
export const STARTS = {
  granite: { slant: 35, size: 4 },
  layered: { slant: 15, size: 2.4 },
  land: { size: 3 },
};
// The kind of rock a tab shows: the land's rock is granite.
export const kindOn = (tab, kind) => (tab === 'land' ? 'granite' : kind);
// The size of rock a tab starts at, for a kind.
export const sizeOn = (tab, kind) => (tab === 'land' ? STARTS.land.size : STARTS[kind].size);

export const GROUPS = [
  // --- the first rows, in no folder --------------------------------------------------
  { key: 'top', tabs: EVERY, rows: [
    { key: 'kind', name: 'kind', value: 'granite', choices: { granite: 'granite', 'layered rock': 'layered' }, tabs: TEST },
    { key: 'shows', name: 'how much shows', value: 0.8, range: [0.05, 1, 0.01] },
  ] },

  // --- a stone -----------------------------------------------------------------------
  { key: 'stone', level: 'stone', title: 'the stone', rows: [
    { key: 'age', name: 'age (young → old)', value: 0.15, range: [0, 1, 0.01] },
    { key: 'size', name: 'size of the biggest (m)', value: 4, range: [0.3, 6, 0.05] },
    { key: 'thick', name: 'how thick (share of length)', value: 0.6, range: [0.4, 0.9, 0.01], kind: 'granite' },
    { key: 'bed', name: 'bed thickness (share of length)', value: 0.3, range: [0.2, 0.7, 0.01], kind: 'layered' },
    { key: 'seed', name: 'seed', value: 1, range: [1, 200, 1] },
  ] },
  // Its grain: the way the rock's cracks run, so the way it lies.
  { key: 'grain', level: 'stone', title: 'how it lies', rows: [
    { key: 'slant', name: 'slant (°)', value: 35, range: [0, 45, 1] },
    { key: 'lean', name: 'leans toward (°)', value: 0, range: [0, 360, 5] },
    { key: 'turn', name: 'turn (°)', value: 20, range: [0, 360, 5] },
  ] },
  // (To be set by eye: nobody publishes these.)
  { key: 'ground', level: 'stone', title: 'in the ground', closed: true, rows: [
    { key: 'least', name: 'always buried (share)', value: 0.3, range: [0.1, 0.6, 0.01] },
    // (A stack of courses rests its slabs on each other by a rule of its own.)
    { key: 'under', name: 'bury faces within (°) of the ground', value: 45, range: [10, 85, 1], off: ['cluster:layered'] },
  ] },

  // --- a cluster ---------------------------------------------------------------------
  { key: 'cluster', level: 'cluster', title: 'the cluster', rows: [
    { key: 'pieces', name: 'pieces', value: 8, range: [1, 12, 1], kind: 'granite' },
    { key: 'mix', name: 'size mix (small → big)', value: 0.5, range: [0, 1, 0.01], kind: 'granite' },
    { key: 'noise', name: 'stray (each rock off the grain)', value: 0.15, range: [0, 1, 0.01] },
    { key: 'cross', name: 'how far they cross', value: 0.35, range: [0.2, 0.5, 0.01] },
  ] },
  // Layered rock's cluster is a stack of courses. (Its cliff is not made
  // of stacks: its beds run the length of the face.)
  { key: 'courses', level: 'cluster', title: 'the courses', kind: 'layered', tabs: ['cluster'], rows: [
    { key: 'courses', name: 'courses', value: 3, range: [1, 5, 1] },
    { key: 'slabs', name: 'slabs to a course', value: 3, range: [1, 4, 1] },
    { key: 'step', name: 'how far each steps back', value: 0.45, range: [0, 0.8, 0.01] },
  ] },

  // --- a cliff -----------------------------------------------------------------------
  { key: 'cliff', level: 'cliff', title: 'the cliff', rows: [
    { key: 'spots', name: 'big clusters along it', value: 8, range: [3, 12, 1], kind: 'granite' },
    { key: 'uneven', name: 'uneven spacing', value: 0.6, range: [0, 1, 0.01], kind: 'granite' },
    { key: 'fallen', name: 'fallen rock (at the foot)', value: 0.6, range: [0, 1, 0.01] },
    { key: 'rim', name: 'the rim (at the top)', value: 0.6, range: [0, 1, 0.01], kind: 'granite' },
    { key: 'patchy', name: 'patchiness (even → groups and gaps)', value: 0, range: [0, 1, 0.01] },
    { key: 'patch', name: 'patch size (m)', value: 9, range: [3, 24, 0.5], given: { patchy: 0.6 } },
    { key: 'drift', name: 'tilt drift (along the cliff)', value: 0, range: [0, 1, 0.01], kind: 'granite' },
  ] },

  // --- the test slope: what a stone, a cluster and a cliff stand on here -----------------
  { key: 'slope', tabs: TEST, title: 'the test slope', rows: [
    { key: 'steep', name: 'steepness (°)', value: 60, range: [0, 75, 1] },
    { key: 'where', name: 'where on it (meadow → top)', value: 0.45, range: [-0.6, 1.4, 0.01], tabs: ['stone', 'cluster'] },
  ] },

  // --- a land ------------------------------------------------------------------------
  { key: 'hills', level: 'land', title: 'the hills', rows: [
    { key: 'landSeed', name: 'seed', value: 1, range: [1, 200, 1] },
    { key: 'hillCount', name: 'hills', value: 4, range: [1, 6, 1] },
    { key: 'hilly', name: 'how tall the hills are (m)', value: 5, range: [2, 12, 0.5] },
  ] },
  { key: 'beds', level: 'land', title: 'the hard beds', rows: [
    { key: 'hardBeds', name: 'hard beds', value: 2, range: [1, 4, 1] },
    { key: 'bandTall', name: 'how tall a steep band is, at most (m)', value: 5, range: [2, 9, 0.5] },
    { key: 'bandSteep', name: 'how steep a band is (°)', value: 60, range: [40, 75, 1] },
    { key: 'bandUneven', name: 'bands come and go (all round → here and there)', value: 0.5, range: [0, 1, 0.01] },
    { key: 'bedTilt', name: "the beds' tilt (°)", value: 0, range: [0, 12, 1] },
    { key: 'bedToward', name: 'they rise toward (°)', value: 30, range: [0, 360, 5], given: { bedTilt: 6 } },
  ] },
  { key: 'landRock', level: 'land', title: 'rock on the land', rows: [
    { key: 'rock', name: 'rock on the land', value: true },
    { key: 'byPlace', name: 'laid by place (untick: the old way, along the lines)', value: true, extra: 'oldWay' },
    { key: 'slopeSay', name: 'the slope decides (not at all → fully)', value: 1, range: [0, 1, 0.01] },
  ] },

  // --- the view: what is drawn, not what is made ---------------------------------------
  { key: 'view', tabs: EVERY, title: 'the view', rows: [
    { key: 'shadows', name: 'shadows', value: true },
    { key: 'labels', name: 'labels', value: true },
    { key: 'workshop', name: 'one to compare, beside the row', value: true, tabs: ['stone', 'cluster'] },
    { key: 'contours', name: 'contour lines (as on a map)', value: true, tabs: ['land'] },
    { key: 'marks', name: 'the lines along the bands', value: true, tabs: ['land'] },
    { key: 'walk', name: 'ground and wall, for the walk', value: true, tabs: ['land'] },
  ] },
];

// Every row, each with its group.
export const ROWS = GROUPS.flatMap((group) => group.rows.map((row) => ({ ...row, group })));
export const rowOf = (key) => ROWS.find((row) => row.key === key);

// Every setting at what it starts at.
export function defaultSettings() {
  return Object.fromEntries(ROWS.map((row) => [row.key, row.value]));
}

// Whether a row shows on a tab, for a kind of rock (the kind picked: the
// land's own rock is granite whatever is picked).
export function showsOn(row, tab, kind = 'granite') {
  const { group } = row;
  const here = kindOn(tab, kind);
  for (const part of [group, row]) {
    if (part.kind && part.kind !== here) return false;
    if (part.tabs && !part.tabs.includes(tab)) return false;
    if (part.off?.includes(`${tab}:${here}`)) return false;
  }
  return !group.level || levelOf(group.level) <= levelOf(tab);
}

// What the panel shows on a tab, top to bottom, for a kind of rock:
//   { rows }                    the first rows, in no folder;
//   { title, open, rows }       a folder of rows;
//   { title, open, parts }      a folder of folders: a level below, with
//                               more than one group.
// The tab's own groups come first, open; then each level below it, the
// nearest first, folded; then the test slope; then the view.
export function panelOf(tab, kind = 'granite') {
  const rowsOf = (group) => ROWS.filter((row) => row.group === group && showsOn(row, tab, kind));
  const folder = (group) => ({ key: group.key, title: group.title, open: !group.closed, rows: rowsOf(group) });
  const full = (section) => section.rows.length > 0;
  const groupsOf = (level) => GROUPS.filter((group) => group.level === level).map(folder).filter(full);
  const named = (key) => GROUPS.filter((group) => group.key === key).map(folder).filter(full);

  const panel = [{ key: 'top', rows: rowsOf(GROUPS.find((group) => group.key === 'top')) }, ...groupsOf(tab)];
  for (let level = levelOf(tab) - 1; level >= 0; level--) {
    const parts = groupsOf(TAB_KEYS[level]);
    const { below, key } = TABS[level];
    if (parts.length === 1) panel.push({ key: `below ${key}`, title: below, open: false, rows: parts[0].rows });
    else if (parts.length) panel.push({ key: `below ${key}`, title: below, open: false, parts });
  }
  panel.push(...named('slope'), ...named('view'));
  return panel;
}

// The keys of the rows a tab shows, for a kind (in the panel's order).
export function keysOn(tab, kind = 'granite') {
  return panelOf(tab, kind).flatMap((section) => (section.parts ? section.parts.flatMap((part) => part.rows) : section.rows)).map((row) => row.key);
}
