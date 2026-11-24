import * as THREE from 'three';

// The land as Rock Lab's placer reads it. A land is handed over as two
// functions, its height and its normal at a point, and a third if it has
// one: how bare the rock is at a point, and which kind. Each is read at a
// point, from world coordinates alone, so any rectangle of land reads the
// same, whichever was asked for first.
//
// - heightAt(x, z): m.
// - normalAt(x, z, out): the ground's up, a unit vector (written into
//   `out` when one is given; a plain [x, y, z] is taken too).
// - rockAt(x, z), if the land has it: { bare, kind }. bare runs from 0
//   (under soil) to 1 (bare rock); kind is the rock's own name. Rock Lab
//   makes two kinds, granite and layered; a rock that lies in beds
//   (basalt, marble, sandstone) is made as layered. A land may name its
//   rock either way, so a land that knows the bed's own kind can say it.
//
// A land without rockAt is read from its slope alone: the rock is bare
// where the ground gets steep, and of the kind the settings ask for.

const { clamp, radToDeg, smoothstep } = THREE.MathUtils;

export const LAND_IN = {
  bare: [25, 35], // degrees: on ground gentler than the first no rock is bare; from the second on, all of it
  // A rise, as read from a point (at):
  ease: 25,       // degrees: it is walked up until the ground is gentler than this,
  drop: 20,       // degrees: or this much gentler than the steepest it has been (a steep hillside above a band is not the band)
  steep: 35,      // degrees: it is a rise only if it is somewhere at least this steep
  lead: 2,        // m: from a foot, how far up gentler ground the walk looks for it to begin
  widest: 15,     // m: no rise is taken to be wider than this
  stride: 0.25,   // m: the walk's step
};
export const KINDS = ['granite', 'layered'];
// The names a land may give its rock, and the kind each is made as.
export const NAMES = { granite: 'granite', layered: 'layered', basalt: 'layered', marble: 'layered', sandstone: 'layered' };
const kindOf = (name) => (typeof name === 'string' ? NAMES[name.toLowerCase()] : undefined);

// The land, read the one way. kind: the kind of rock where the land
// doesn't say. It gives { heightAt, normalAt, rockAt, at, says }: says is
// whether the land itself told where its rock is bare.
//
// at(x, z) is all a placer needs to know of a point, read there and
// nowhere else:
// - steep: how steep the ground is, in degrees;
// - up: which way is uphill, [x, z], a unit length (or [0, 0] on the flat);
// - rise, wide: how tall the rise above the point is and how far back it
//   runs, m. It is walked up in a straight line, the way uphill from the
//   point, until the ground eases (gentler than a rise, or well gentler
//   than the steepest it has been); from a foot the walk looks a little
//   way up gentler ground for it to begin. A rise nowhere steep is none
//   (0, 0). Read from a band's foot, it is the band's height;
// - steepest: the most it climbs on the way, in degrees;
// - bare, kind: as rockAt says.
export function landIn(land, { kind = 'granite' } = {}) {
  if (typeof land?.heightAt !== 'function' || typeof land?.normalAt !== 'function') {
    throw new TypeError('a land needs heightAt(x, z) and normalAt(x, z)');
  }
  const asked = KINDS.includes(kind) ? kind : KINDS[0];

  function normalAt(x, z, out = new THREE.Vector3()) {
    const up = land.normalAt(x, z, out);
    if (Array.isArray(up)) out.set(up[0], up[1], up[2]);
    else if (up && up !== out) out.set(up.x, up.y, up.z);
    return out;
  }

  // From the slope alone.
  const up = new THREE.Vector3();
  function fromSlope(x, z) {
    normalAt(x, z, up);
    const steep = radToDeg(Math.acos(clamp(up.y, -1, 1)));
    return { bare: smoothstep(steep, LAND_IN.bare[0], LAND_IN.bare[1]), kind: asked };
  }
  // As the land says, kept in range.
  function fromLand(x, z) {
    const said = land.rockAt(x, z) ?? {};
    const bare = Number.isFinite(said.bare) ? clamp(said.bare, 0, 1) : 0;
    return { bare, kind: kindOf(said.kind) ?? asked };
  }

  const says = typeof land.rockAt === 'function';
  const rockAt = says ? fromLand : fromSlope;

  const degrees = (normal) => radToDeg(Math.acos(clamp(normal.y, -1, 1)));
  function at(x, z) {
    const here = normalAt(x, z, new THREE.Vector3());
    const flat = Math.hypot(here.x, here.z);
    const way = flat > 1e-9 ? [-here.x / flat, -here.z / flat] : [0, 0];
    // (Read straight up from here: a walk that turned with the ground would
    // drift along a band toward where it is taller.)

    // The rise above it: climbed a stride at a time, its steepness the
    // climb's own (ground that falls away sideways is not a rise).
    const { ease, steep, lead, widest, stride } = LAND_IN;
    let [px, pz] = [x, z];
    const start = land.heightAt(x, z);
    let height = start;
    let walked = 0;
    let begun = false;
    let steepest = 0;
    while (flat > 1e-9 && walked < widest) {
      const [nx, nz] = [px + way[0] * stride, pz + way[1] * stride];
      const next = land.heightAt(nx, nz);
      const climb = radToDeg(Math.atan2(next - height, stride));
      if (climb >= Math.max(ease, steepest - LAND_IN.drop)) {
        begun = true;
        steepest = Math.max(steepest, climb);
      } else if (begun || walked >= lead) break;
      [px, pz, height] = [nx, nz, next];
      walked += stride;
    }
    const risen = steepest >= steep;
    return {
      steep: degrees(here), up: way,
      rise: risen ? height - start : 0, wide: risen ? walked : 0,
      steepest, ...rockAt(x, z),
    };
  }

  return { heightAt: land.heightAt, normalAt, rockAt, at, says };
}
