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
// (free to change: nothing else reads it), its tip (a line or two the
// panel shows when the row is pointed at), what it starts at, and its
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
    { key: 'kind', name: 'kind of rock', value: 'granite', choices: { granite: 'granite', 'layered rock': 'layered' }, tabs: TEST,
      tip: 'Granite breaks into rough boxes and wears round with age. Layered rock (a warm sandstone) breaks along its beds into flat slabs. The land is always granite.' },
    { key: 'shows', name: 'how much rock shows', value: 0.8, range: [0.05, 1, 0.01],
      tip: 'The one slider that takes it from a few stones in the grass, to outcrops, to a cliff: how far each rock stands out of the ground, and how many places have rock.' },
  ] },

  // --- a stone -----------------------------------------------------------------------
  { key: 'stone', level: 'stone', title: 'each rock', rows: [
    { key: 'age', name: 'age (fresh → worn)', value: 0.15, range: [0, 1, 0.01],
      tip: 'A fresh rock has sharp corners. With age the corners go first, then the edges, then the faces, until it is a rounded lump. Its size hardly changes.' },
    { key: 'size', name: 'size of the biggest rock (m)', value: 4, range: [0.3, 6, 0.05],
      tip: 'How long the biggest rock is, in metres. A cluster\'s other rocks are smaller shares of it.' },
    { key: 'thick', name: 'thickness (share of its length)', value: 0.6, range: [0.4, 0.9, 0.01], kind: 'granite',
      tip: 'How thick a granite block is beside its length: thin slabs at the low end, near cubes at the high end.' },
    { key: 'bed', name: 'bed thickness (share of its length)', value: 0.3, range: [0.2, 0.7, 0.01], kind: 'layered',
      tip: 'How thick a slab of layered rock is beside its length: how thick the bed was that it broke from.' },
    { key: 'seed', name: 'seed (which rocks)', value: 1, range: [1, 200, 1],
      tip: 'Picks which rocks you get. The same seed and settings always give the same rocks.' },
  ] },
  // Its grain: the way the rock's cracks run, so the way it lies.
  { key: 'grain', level: 'stone', title: 'how the rock lies (its grain)', rows: [
    { key: 'slant', name: 'grain tilted (°)', value: 35, range: [0, 45, 1],
      tip: 'How far the rock\'s cracks are tilted from level, in degrees. Every rock of a cluster or a cliff shares it, so they read as one body of rock.' },
    { key: 'lean', name: 'tilted toward (°)', value: 0, range: [0, 360, 5],
      tip: 'Which way the grain tilts, round the compass, in degrees.' },
    { key: 'turn', name: 'turned (°)', value: 20, range: [0, 360, 5],
      tip: 'How far the rock is turned about the upright, in degrees.' },
  ] },
  // (To be set by eye: nobody publishes these.)
  { key: 'ground', level: 'stone', title: 'how deep in the ground', closed: true, rows: [
    { key: 'least', name: 'always buried, at least (share)', value: 0.3, range: [0.1, 0.6, 0.01],
      tip: 'The share of a rock that is buried even when "how much rock shows" is at its most. More buried hides that a cliff is made of single rocks.' },
    // (A stack of courses rests its slabs on each other by a rule of its own.)
    { key: 'under', name: 'faces this near facing the ground are buried (°)', value: 45, range: [10, 85, 1], off: ['cluster:layered'],
      tip: 'A face turned within this many degrees of facing the ground is pushed into it, so no gap shows under a rock: nothing floats.' },
  ] },

  // --- a cluster ---------------------------------------------------------------------
  { key: 'cluster', level: 'cluster', title: 'the cluster', rows: [
    { key: 'pieces', name: 'rocks in a cluster', value: 8, range: [1, 12, 1], kind: 'granite',
      tip: 'How many rocks make one cluster: one big rock that carries the shape, then rocks at its ends, on top, at its flanks and at its foot.' },
    { key: 'mix', name: 'their sizes (alike → mixed)', value: 0.5, range: [0, 1, 0.01], kind: 'granite',
      tip: 'How much the rocks of a cluster differ in size from the big one.' },
    { key: 'noise', name: 'stray (each rock off the grain)', value: 0.15, range: [0, 1, 0.01],
      tip: 'How far each rock strays from the shared grain: rock in place at 0, a loose heap lying every which way at 1.' },
    { key: 'cross', name: 'how far rocks push into each other', value: 0.35, range: [0.2, 0.5, 0.01],
      tip: 'How far the rocks of a cluster sink into each other, as a share of their size. More reads as one mass; less, as rocks piled together.' },
  ] },
  // Layered rock's cluster is a stack of courses. (Its cliff is not made
  // of stacks: its beds run the length of the face.)
  { key: 'courses', level: 'cluster', title: 'the courses (layered rock)', kind: 'layered', tabs: ['cluster'], rows: [
    { key: 'courses', name: 'courses (layers) in the stack', value: 3, range: [1, 5, 1],
      tip: 'How many beds the stack has, one on another.' },
    { key: 'slabs', name: 'slabs to a course', value: 3, range: [1, 4, 1],
      tip: 'How many slabs lie side by side in each course.' },
    { key: 'step', name: 'how far each course steps back', value: 0.45, range: [0, 0.8, 0.01],
      tip: 'How far each course is set back from the one below it, so the stack steps: a riser, a ledge, a riser.' },
  ] },

  // --- a cliff -----------------------------------------------------------------------
  { key: 'cliff', level: 'cliff', title: 'along the cliff', rows: [
    { key: 'spots', name: 'big clusters along it', value: 8, range: [3, 12, 1], kind: 'granite',
      tip: 'How many big clusters stand along the test cliff (about 41 m long); middling and small ones go with each. On the land, as many to the metre.' },
    { key: 'uneven', name: 'their spacing (even → uneven)', value: 0.6, range: [0, 1, 0.01], kind: 'granite',
      tip: 'How evenly the clusters are spaced along the cliff.' },
    { key: 'fallen', name: 'fallen rock at the foot', value: 0.6, range: [0, 1, 0.01],
      tip: 'Loose rocks on a bank at the cliff\'s foot and out past it: many small and few big, the bigger lower and farther out.' },
    { key: 'rim', name: 'rock along the top', value: 0.6, range: [0, 1, 0.01], kind: 'granite',
      tip: 'Blocks along the top edge, sunk well into the ground behind, so the skyline is rock and grass by turns.' },
    { key: 'rocky', name: 'how rocky (the clusters → rocked out)', value: 0, range: [0, 1, 0.01], kind: 'granite',
      tip: 'Fills the face between the clusters: at 0 only the clusters, with grass between; at 1 the face rocked out end to end and top to bottom.' },
  ] },
  // The noise along a cliff: a slow field, so neighbours agree.
  { key: 'noise', level: 'cliff', title: 'the noise along it', rows: [
    { key: 'patchy', name: 'patches (even → groups and gaps)', value: 0, range: [0, 1, 0.01],
      tip: 'How strongly the rock gathers in some stretches and thins in others. At 0 it is spread evenly.' },
    { key: 'patch', name: 'patch size: many small ↔ few big (m)', value: 9, range: [3, 24, 0.5], given: { patchy: 0.6 },
      tip: 'How long a stretch of more rock, or less, is, in metres: small for many short patches, big for a few long ones. Does nothing with patches at 0.' },
    { key: 'drift', name: 'the grain wanders along it', value: 0, range: [0, 1, 0.01], kind: 'granite',
      tip: 'How far the grain\'s tilt and turn wander along the cliff: neighbouring clusters agree, far ones differ.' },
  ] },

  // --- the test slope: what a stone, a cluster and a cliff stand on here -----------------
  { key: 'slope', tabs: TEST, title: 'the test slope', rows: [
    { key: 'steep', name: 'how steep (°)', value: 60, range: [0, 75, 1],
      tip: 'How steep the test slope\'s band is, in degrees. The rock is laid against it.' },
    { key: 'where', name: 'where on it (meadow → top)', value: 0.45, range: [-0.6, 1.4, 0.01], tabs: ['stone', 'cluster'],
      tip: 'Where the rock or cluster stands: out on the meadow below, on the slope, or up on the top.' },
  ] },

  // --- a land ------------------------------------------------------------------------
  { key: 'hills', level: 'land', title: 'the hills', rows: [
    { key: 'landSeed', name: 'seed (which land)', value: 1, range: [1, 200, 1],
      tip: 'Picks the hills and their beds. The same seed and settings always give the same land.' },
    { key: 'hillCount', name: 'how many hills', value: 4, range: [1, 6, 1],
      tip: 'How many hills stand on the land. The first is the big one.' },
    { key: 'hilly', name: 'how tall the hills are (m)', value: 5, range: [2, 12, 0.5],
      tip: 'How tall the big hill is before the hard beds step it, in metres.' },
  ] },
  { key: 'beds', level: 'land', title: 'the hard beds (where cliffs form)', rows: [
    { key: 'hardBeds', name: 'hard beds', value: 2, range: [1, 4, 1],
      tip: 'Layers of hard rock lying through the hills, one above another. Where a hillside reaches one it gets steep: a band where cliffs go.' },
    { key: 'bandTall', name: 'how tall a band is, at most (m)', value: 5, range: [2, 9, 0.5],
      tip: 'How tall a steep band is where its bed is at its thickest, in metres.' },
    { key: 'bandSteep', name: 'how steep a band is (°)', value: 60, range: [40, 75, 1],
      tip: 'How steep a band is on a hillside of the usual slope, in degrees.' },
    { key: 'bandUneven', name: 'bands come and go (all round → here and there)', value: 0.5, range: [0, 1, 0.01],
      tip: 'How much a bed thins from place to place: at 0 its band runs all round the hill, higher up it comes and goes, as cliffs do.' },
    { key: 'bedTilt', name: 'the beds tilted (°)', value: 0, range: [0, 12, 1],
      tip: 'How far the beds are tilted, in degrees: tilted, the bands climb across the hills.' },
    { key: 'bedToward', name: 'they rise toward (°)', value: 30, range: [0, 360, 5], given: { bedTilt: 6 },
      tip: 'Which way the tilted beds rise, round the compass, in degrees. Does nothing with the beds level.' },
  ] },
  { key: 'landRock', level: 'land', title: 'rock on the land', rows: [
    { key: 'rock', name: 'rock on the land', value: true,
      tip: 'Lay granite on the land. It takes a few seconds, and comes in a cluster at a time.' },
    { key: 'byPlace', name: 'laid by place (untick: the old way, along the lines)', value: true, extra: 'oldWay',
      tip: 'Laid by place: every rock by where it is, so any piece of land comes out the same. Untick to compare the old way, along the lines.' },
    { key: 'slopeSay', name: 'the slope decides (not at all → fully)', value: 1, range: [0, 1, 0.01],
      tip: 'How much say the land\'s steepness has: on steep ground rock stands out; on gentler ground it sits deeper; on level ground it lies flat; and a few stones are strewn over the hills.' },
  ] },

  // --- the view: what is drawn, not what is made ---------------------------------------
  { key: 'view', tabs: EVERY, title: 'the view', rows: [
    { key: 'shadows', name: 'shadows', value: true,
      tip: 'The sun\'s shadows. Off, the page is quicker on a slow computer.' },
    { key: 'labels', name: 'labels', value: true,
      tip: 'The names written beside things on the page.' },
    { key: 'workshop', name: 'one to compare, beside the row', value: true, tabs: ['stone', 'cluster'],
      tip: 'Something beside the row of ages to compare against: for layered rock, a granite one of the same size.' },
    { key: 'contours', name: 'contour lines (as on a map)', value: true, tabs: ['land'],
      tip: 'A line round the land at every metre of height, a bolder one every fifth: crowded where it is steep.' },
    { key: 'marks', name: 'the lines along the bands', value: true, tabs: ['land'],
      tip: 'A line along the foot of each steep band: dark where a cliff would stand, pale where the band is too low or too gentle.' },
    { key: 'walk', name: 'ground and wall, for the walk', value: true, tabs: ['land'],
      tip: 'Each cluster\'s outline: green where you could walk over it, orange where it is a wall you would go round.' },
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
