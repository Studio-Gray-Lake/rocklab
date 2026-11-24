// RockLab's release log: what each release brought, newest first. The
// page shows it when the version beside RockLab's name is clicked
// (index.html: #log; src/main.js).
//
// One entry a release: { version, date (the day it was released,
// YYYY-MM-DD), name (what it was about, in a few words), post (its news
// post on the studio's website, or null if it has none), changes (short
// lines, one a feature) }.
//
// Only what has been released is here. A release adds its entry at the
// top; tests/changelog.test.js holds the top entry to the version in
// package.json, so a release can't go out without one.

// The studio's news, where RockLab's posts are.
export const NEWS = 'https://studiograylake.com/news.html';

export const RELEASES = [
  {
    version: '0.2.1',
    date: '2026-11-24',
    name: 'RockLab, in one word',
    post: null,
    changes: [
      'RockLab is one word now, as on the studio’s website',
      'A line in the page for the website to stamp its build in',
    ],
  },
  {
    version: '0.2',
    date: '2026-11-24',
    name: 'How rocky, a faster page, and a clearer panel',
    post: null,
    changes: [
      "How rocky: fill a cliff's face between its clusters, from grass between them to rocked out end to end",
      'Download the rocks on show as a 3D model (.glb), with the list of rocks that makes them again',
      'Faster: a cliff remade in about half the time, a land in under half, with the same rocks',
      "Ticking a box of the view no longer lays the land's rock again",
      'The panel in colour, a part at a time, with a tooltip on every row and plainer names',
      "The version beside RockLab's name, and this log behind it",
      'A welcome card on a first visit',
    ],
  },
  {
    version: '0.1',
    date: '2026-11-24',
    name: 'Rocks, clusters, cliffs and a land of hills',
    post: null,
    changes: [
      'Granite, young to old: one rock, a cluster, and clusters along a steep edge from stones in the grass to a cliff',
      'Layered rock: slabs, a cluster laid in courses, and a cliff of beds running the length of the face',
      'Fallen rock at a cliff\'s foot and rock along its top; patches of more rock and less; a grain that wanders',
      'A small land of hills stepped by hard beds, with granite laid by place where its hillsides get steep',
      'Every cluster marked ground or wall for a walk, with nothing too thin or sharp to stand on',
    ],
  },
];
