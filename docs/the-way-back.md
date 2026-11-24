# The way back into the game

RockLab is one of several small labs, each working on one part of how a
world is generated, apart from the others. The aim is to bring the parts
back together in the studio's game. This page says how rocks go back.

## Two layers

1. **RockLab's core,** copied unchanged into the game at a named commit,
   with a check on the game's side that the copy is still current. The
   page, the panel and the drawing stay in RockLab.
2. **Rock layouts as plain data:** kind, age, size, seed, place, turn and
   how much shows. The core turns the same data into the same rocks every
   time, so a layout is small to store and easy to check.

## What the core is

- **Pure and seeded.** It runs in Node as well as in a browser: no page,
  no GPU, no shaders, no materials. The same input always gives the same
  rocks.
- **Its output, per rock:** positions, normals and one colour per facet,
  plus the rock's convex corners for walking on it. The game draws that
  however it likes.
- **The land comes in as two functions:** height and normal at a point.
  The core never owns the land; it reads it.
- **Seeded by place, not by order.** The game loads its world in square
  chunks. The core can fill any rectangle of land, and a chunk's rocks come
  out the same whichever chunks were made before. Each cluster belongs to
  the one chunk its centre falls in.
- **Ready for walking.** Each rock or cluster is marked *ground* (it may be
  stepped on) or *wall* (it may not). Each cluster is listed as one group
  with one outline. Nothing thin is left underfoot.

## The first hand-back

A low formation that can be walked over comes first (a cluster or an
outcrop), then a granite edge: the core at a named commit, the two
layouts as data, and a one-page note.

## Today

The core is split out: it runs in Node, hands each rock over as plain
arrays, lays the land's rock by place from a land given as functions, and
marks every group ground or wall for the walk. The hand-back is next.
