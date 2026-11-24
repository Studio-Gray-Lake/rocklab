# Rock Lab

A generator for rocks, and from rocks, clusters, outcrops and cliffs.
Everything is made of whole, convex, low-poly rocks, seeded, so the same
settings always give the same rocks.

The rule: **build big things from small parts that each look right, put
together by simple adjustable rules.** Nothing is generated top-down.

Rock Lab is one of the studio's small labs, each working on one part of
world generation on its own, to be brought back together in the studio's
game.

- [How it works](docs/how-it-works.md): the four levels, the rules every
  rock keeps, and the code.
- [The way back into the game](docs/the-way-back.md): what goes back, and
  in what form.

## What is built

- **Granite**, young to old: one rock, a cluster, and clusters along a
  steep edge, from stones to outcrops to a cliff, with fallen rock at the
  foot and a rim at the top. A slow field along the edge makes it patchy.
- **Layered rock**, a warm sandstone: one slab, a cluster laid in
  courses, and its cliff, the same few beds running the length of the
  face.
- **The land decides:** a small land of hills stepped by hard beds, with
  contour lines, and granite on it. One slider sets how much say the
  land's steepness has.
- **Laid by place:** the land's rock is laid by where it is, not by the
  order it was made in, so any rectangle of land comes out the same,
  made alone or among its neighbours, in 80 m squares or all at once. A
  land is handed over as two functions (its height and its normal) and,
  if it has one, a third: how bare its rock is, and which kind.
- **For the walk:** every cluster, rim block, fallen rock and strewn
  stone is one group with one outline, marked ground (it can be walked
  over) or wall, by a walk's own limits; nothing too thin or sharp is
  stepped on.
- **Download** the rocks on show as a 3D model (.glb), with the list of
  rocks that makes them again inside it.
- **The core** runs without a page: each rock is handed over as plain
  arrays (its triangles, normals, a colour per facet and its convex
  corners), made in Node as well as in the browser.
- **The page**, in four tabs, **Stone, Cluster, Cliff, Land**, each with
  its own camera, and every setting one row of a single table.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5211. It opens on the Cliff; a link opens
another tab: `/#stone`, `/#cluster`, `/#cliff`, `/#land`.

```bash
npm test
```

`npm test` includes two records: every level's rocks at its starting
settings, rock for rock (`node --import ./tests/hooks.js
scripts/same-rocks.js` prints them), and what a square of land costs
(`scripts/cost.js` prints it, with how long each stage takes).

```bash
npm run check:rows
```

`npm run check:rows` puts every slider of the Cliff tab at both its ends
and makes the cliff each time. It takes about a minute and a half of one
core, so it is run by hand after a change to the settings table or a
maker.

## Tools

three.js `^0.186.1`, plain ES modules, Vite, lil-gui, flat-shaded facets,
tests with `node --test`.

## The layout

| Path | What it is |
|---|---|
| `index.html`, `src/main.js` | The page: four tabs, each with its own camera, and the panel built from the settings table |
| `src/settings.js` | The one table of settings: every row's key, name, start and slider, its level, and what each tab shows |
| `src/make.js` | What each tab makes from the settings, with nothing drawn |
| `src/random.js`, `src/corners.js` | The seeded random numbers; a rock's corners from its faces |
| `src/granite.js`, `src/layered.js` | The two kinds of rock, young to old |
| `src/kinds.js` | The kinds of rock: each with its maker and its thinness rule |
| `src/bed.js` | Bedding: how a rock is set into the land and its neighbours, so nothing floats |
| `src/cluster.js`, `src/courses.js` | A granite cluster; a layered cluster in courses |
| `src/edge.js`, `src/layers.js` | Clusters along a steep band; layered rock's cliff |
| `src/field.js` | A slow seeded field, along a line or over a land |
| `src/land.js` | The test land: a meadow, a steep band, a meadow |
| `src/hills.js`, `src/contours.js` | The land of hills and its contour lines |
| `src/landIn.js`, `src/feet.js`, `src/spots.js`, `src/place.js`, `src/landRock.js` | The land's rock, laid by place: the land as handed over, the feet of its steep ground, the spots along them, the placer, and what it lays with |
| `src/walk.js` | What the rock says to a walk: ground or wall, each group with one outline |
| `src/output.js`, `src/rockLook.js`, `src/exportModel.js` | What is handed over for each rock; its colours and its mesh; the rocks on show as a 3D model |
| `scripts/` | The records of the rocks and of a square's cost; the by-hand check of the Cliff tab's sliders |
| `tests/` | The checks (`npm test`) |
| `docs/` | How it works, and the way back |

## Licence

Rock Lab's code is under the [PolyForm Noncommercial License 1.0.0](LICENSE): use it, change it and share it for anything noncommercial, but don't sell it or use it commercially.

**What you make with Rock Lab is yours.** The rocks, rock lists, images and settings you export are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): use them for anything, commercial or not, no credit needed.

three.js and lil-gui are under the MIT licence, and keep it.
