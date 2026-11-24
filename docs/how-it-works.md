# How RockLab works

RockLab makes rocks, and from rocks, clusters, outcrops and cliffs. It
works bottom-up: every big thing is made of small parts that each look
right on their own, put together by a few simple rules you can adjust.
Nothing is carved from one big shape.

## Four levels

| Level | What it is |
|---|---|
| **Stone** | One whole rock: convex, low-poly, flat-faced. It has a place, a turn, a size, a kind and a seed. |
| **Cluster** | A handful of rocks pushed into each other so they read as one mass: one big rock, a few middling ones against it, small ones at its foot. All lean with one grain. |
| **Cliff** | Clusters laid along steep ground. One slider, *how much shows*, takes it from a few stones in the grass, to outcrops, to a rock face. |
| **Land** | A small land of hills. The land decides where rock stands: along every steep band, with the steepness deciding how far it stands out. |

Each level is a tab on the page. Every setting is one row of a single
table (`src/settings.js`), and each tab shows the rows of its own level.

## The rules every rock keeps

- **Whole rocks only.** A formation is a list of whole convex rocks. No
  rock is ever sliced by another rock or by the ground. That is what keeps
  thin slivers out.
- **Seeded.** The same seed and settings always give the same rocks. All
  randomness comes from one small seeded generator, never `Math.random`.
- **Steady sliders.** Every number a rock needs is drawn first, in a fixed
  order, keyed on the seed, the cluster and the rock. The settings only
  scale, turn and hide. So moving one slider never reshuffles the rest,
  and raising *how much shows* only adds rocks.
- **Nothing floats.** Each rock is bedded into the land and into its
  neighbours: no thin wedge of air may show under or behind it, and enough
  of it must be inside the ground. A rock that fails is pushed in, square
  to the ground, until it passes; if too little would then show, it is
  left out.
- **Nothing thin.** Each shape is checked when it is made (thick enough
  for its length, no edge too sharp), and so is what shows of it above the
  ground.
- **No drawn cracks.** Detail comes from the rocks' own shapes and one
  colour per facet. The dark gaps where rocks meet are the cracks.

## Kinds and age

A rock's **kind** is how it breaks. Two kinds are built:

- **Granite** breaks into rough boxes. Fresh, it is a sharp clean block;
  with **age** its corners go first, then its edges, then its faces.
- **Layered rock** (a warm sandstone) breaks into slabs. Its clusters are
  laid in courses, and its cliff runs the same few beds the length of the
  face.

## Along the edge

A cliff is placed along a band of steep ground:

1. Spots are drawn along the band and up it, unevenly spaced, each with a
   rank: big, middling or small.
2. Big rocks go first and carry the outline. Middling ones go against
   them, small ones at the foot and on the ledges, with quiet gaps between
   groups.
3. Each rock takes a shape from its kind, a size from its rank, and the
   grain plus a little noise of its own, then is bedded.
4. Fallen rock gathers at the foot, and a rim of rock at the top.

A slow seeded field along the edge makes it patchy: where rock shows more
or less, and how the grain drifts.

## On the land

On the land of hills, granite is laid by place. The land is read only at
points: how steep it is, which way is up, how tall the rise above a point
is and how bare its rock. The feet of the steep ground are traced on a
grid fixed to the world, spots for clusters are drawn along them a cell of
the world at a time, each from its own seed, and every rock is bedded
against what ranks before it nearby. So any rectangle of land comes out
the same, made alone or among its neighbours. One slider sets how much
say the land's steepness has: on steep ground rock stands out; on gentler
ground it sits deeper in the grass; on level ground it lies as flat
slabs; and a few stones are strewn over the hills.

For the walk, every cluster, rim block, fallen rock and strewn stone is
one group with one outline, marked ground (it can be walked over) or wall
by the walk's own limits: a step up of 30 cm, a drop of 40 cm, slopes to
55 degrees. Nothing too thin or sharp is ever stepped on.

## The code

The makers (`src/granite.js`, `src/layered.js`, `src/cluster.js`,
`src/courses.js`, `src/edge.js`, `src/layers.js`, and for the land
`src/place.js` with `src/landIn.js`, `src/feet.js`, `src/spots.js` and
`src/walk.js`) only compute. What is handed over for each rock is made in
`src/output.js`; drawing lives in `src/rockLook.js` and the page in
`src/main.js`.
The checks run in Node with `npm test`.
