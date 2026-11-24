// What the land's rock is laid with, wherever it is laid: how big its
// rocks are to start with, how small they get where a rise is low, how far
// "before the foot" and "past the top" reach, and the stones strewn over
// the land off the feet.

export const LAND_ROCK = {
  size: 3,       // m: the biggest rocks' length, to start with (smaller than on the test land: the land's rises are lower)
  smallest: 0.5, // where a rise is low its rocks are smaller: this share of the size asked, at the least
  palest: 0.25,  // ...and where no cliff stands, this share at the least
  beyond: 6,     // m: how far "before the foot" and "past the top" reach (as the test land's)
  // Strewn over the land, off the feet (with the slope's say):
  strewn: {
    cell: 5,             // m: one place for a stone, or none, to every square this wide
    comes: [0.35, 1.3],  // each place's own number: its stone is there once what shows there is past it
    counts: [0.6, 1],    // on level ground "how much shows" counts for the first share of itself; on steep, for the second
    shows: [0.3, 0.65],  // a stone's own showing: on level ground, on steep
    size: [0.35, 0.75],  // its biggest rock, as a share of the size asked
    pieces: 3,           // one to this many rocks
    off: 42,             // degrees: on ground steeper than this there is none (that is a face, with rock of its own)
    hill: 0.3,           // m: where the hills are lower than this there is none (the plain; the old way's rule)
  },
};
