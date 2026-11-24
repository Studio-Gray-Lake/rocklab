// The one seeded random number generator: every rock is drawn from it, so
// the same seed always gives the same rocks. Nothing else random is used.
//
// mulberry32: a small, well-known 32-bit generator. random() gives a
// number in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
