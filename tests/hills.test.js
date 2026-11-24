import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HILLS, bandMarks, bandsOf, createHills } from '../src/hills.js';
import { landMesh } from '../src/land.js';

// The land of hills (src/hills.js): a few rounded hills in a plain, by a
// seed; hard beds through them, each making a steep band where a hillside
// reaches it; and the bands traced along their feet, with where a cliff
// would stand. The land is gentle everywhere but on its bands; a band
// begins on its bed's flat sheet (or on the band below, where two beds
// lie too near to part them); on a usual hillside it is as steep as
// asked; and it comes and goes as its bed thickens and thins.

const half = HILLS.size / 2;
const SEEDS = [1, 2, 3, 5, 6];
const lands = SEEDS.map((seed) => createHills({ seed }));
const banded = lands.map((land) => bandsOf(land));
const even = SEEDS.map((seed) => createHills({ seed, uneven: 0 }));

// Every place on a grid over the land.
function over(step, each) {
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) each(x, z);
}
const highest = (land) => {
  let most = 0;
  over(2, (x, z) => { most = Math.max(most, land.heightAt(x, z)); });
  return most;
};
const total = (bands, what) => bands.reduce((sum, band) => sum + band[what], 0);
const tan = (degrees) => Math.tan((degrees * Math.PI) / 180);

test('the same seed makes the same land and the same bands; another seed, another land', () => {
  const [a, b, c] = [createHills({ seed: 4 }), createHills({ seed: 4 }), createHills({ seed: 7 })];
  let differs = 0;
  over(5, (x, z) => {
    assert.equal(a.heightAt(x, z), b.heightAt(x, z));
    if (Math.abs(a.heightAt(x, z) - c.heightAt(x, z)) > 0.5) differs++;
  });
  assert.ok(differs > 10, `seeds 4 and 7 differ at ${differs} places`);
  assert.deepEqual(bandsOf(a), bandsOf(b));
});

test('the hills stand inside the land: its edge is flat plain, with the beds level or tilted', () => {
  for (const settings of [{}, { count: 6 }, { tilt: 12 }, { tilt: 12, toward: 200 }, { tilt: 6, toward: 110, beds: 4 }]) {
    for (const seed of SEEDS) {
      const land = createHills({ seed, ...settings });
      for (let t = -half; t <= half; t += 1) {
        for (const [x, z] of [[t, -half], [t, half], [-half, t], [half, t]]) {
          assert.ok(Math.abs(land.heightAt(x, z)) < 1e-9, `seed ${seed} ${JSON.stringify(settings)}: ${land.heightAt(x, z)} m at the edge (${x}, ${z})`);
        }
      }
    }
  }
});

test('out on the plain there is no step, however the beds are tilted', () => {
  for (const toward of [0, 90, 200, 300]) {
    const land = createHills({ seed: 1, tilt: 12, toward });
    over(2, (x, z) => {
      if (land.hillsAt(x, z) === 0) assert.equal(land.heightAt(x, z), 0, `toward ${toward}: a step on the plain at (${x}, ${z})`);
    });
  }
});

test('one more hill leaves the others where they were; there are from one to six', () => {
  for (const seed of SEEDS) {
    const six = createHills({ seed, count: 6 }).hills;
    assert.equal(six.length, 6);
    for (const count of [1, 3, 4]) assert.deepEqual(createHills({ seed, count }).hills, six.slice(0, count));
    assert.equal(createHills({ seed, count: 0 }).hills.length, 1);
    assert.equal(createHills({ seed, count: 99 }).hills.length, 6);
    // the first is the big one
    for (const hill of six.slice(1)) assert.ok(hill.long < six[0].long);
  }
});

test('before their steps the hills are gentle everywhere: nothing steep goes unmarked', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const land = createHills({ seed, count: 6 });
    const E = 0.2;
    let most = 0;
    over(1, (x, z) => {
      most = Math.max(most, Math.hypot(land.hillsAt(x + E, z) - land.hillsAt(x - E, z), land.hillsAt(x, z + E) - land.hillsAt(x, z - E)) / (2 * E));
    });
    assert.ok(most < tan(HILLS.cliff), `seed ${seed}: a hillside of ${most.toFixed(2)} before its steps`);
  }
});

test('the land is mostly gentle: steep ground is a small share of it, and there is some', () => {
  lands.forEach((land, i) => {
    let steep = 0, all = 0;
    over(2, (x, z) => { all++; if (land.slopeAt(x, z) >= HILLS.cliff) steep++; });
    assert.ok(steep / all > 0.02 && steep / all < 0.2, `seed ${SEEDS[i]}: ${(100 * steep / all).toFixed(0)}% of the land is steep`);
  });
});

// How far the ground at each point of a band's foot stands above the
// bed's sheet: nothing, or a little (the band's rounded foot); and for a
// bed above the lowest, more where it stands on the band below.
function feetOnSheets(land, name) {
  const heights = [];
  for (const band of bandsOf(land)) {
    const on = [];
    let all = 0;
    for (const run of band.runs) {
      for (const [x, z] of run.points) {
        assert.ok(Math.abs(land.aboveFoot(band.bed, x, z)) < 0.02, `${name} bed ${band.bed}: a point of the line is off the foot`);
        const above = land.heightAt(x, z) - land.bedAt(band.bed, x, z);
        assert.ok(above > -0.03, `${name} bed ${band.bed}: the foot is ${(-above).toFixed(2)} m under its sheet`);
        all++;
        if (above < 0.07 * land.tall + 0.03) on.push(land.heightAt(x, z));
        else assert.ok(band.bed > 0, `${name}: the lowest band's foot is ${above.toFixed(2)} m above its sheet`);
      }
    }
    assert.ok(on.length >= 0.7 * all, `${name} bed ${band.bed}: ${on.length} of ${all} points of the foot are on its sheet`);
    heights.push(on);
  }
  return heights;
}

test('a band begins on its bed: its foot lies on one flat sheet, but where it stands on the band below', () => {
  [...lands, ...even].forEach((land) => {
    // level beds: a level foot
    for (const on of feetOnSheets(land, `seed ${land.seed}`)) if (on.length) assert.ok(Math.max(...on) - Math.min(...on) < 0.07 * land.tall + 0.06);
  });
});

test('tilted, a bed is still one sheet, and its band climbs across the hills', () => {
  let climbs = 0;
  for (const seed of SEEDS) {
    for (const on of feetOnSheets(createHills({ seed, tilt: 8, uneven: 0 }), `seed ${seed}, tilted`)) if (on.length && Math.max(...on) - Math.min(...on) > 1) climbs++;
  }
  assert.ok(climbs >= SEEDS.length, `${climbs} bands climb more than a metre`);
});

test('where two bands meet they stand as one, no steeper: nowhere is the land much steeper than asked', () => {
  for (const [steep, most] of [[45, 58], [60, 70], [75, 82]]) {
    for (const seed of SEEDS) {
      for (const beds of [2, 4]) {
        const land = createHills({ seed, steep, beds, uneven: 0 });
        let steepest = 0;
        over(1, (x, z) => { steepest = Math.max(steepest, land.slopeAt(x, z)); });
        assert.ok(steepest < most, `seed ${seed}, ${beds} beds, asked ${steep}°: the land gets ${steepest.toFixed(0)}° steep`);
      }
    }
  }
});

test('where a cliff would stand, the band is about as steep as asked, and tall and long enough', () => {
  for (const steep of [45, 60, 75]) {
    for (const seed of [1, 3]) {
      const land = createHills({ seed, steep });
      const bands = bandsOf(land);
      const steeps = [];
      for (const band of bands) {
        for (const run of band.runs) {
          run.stands.forEach((stands, i) => {
            if (!stands) return;
            steeps.push(run.steep[i]);
            assert.ok(run.steep[i] >= HILLS.cliff);
            assert.ok(run.tall[i] >= HILLS.lowest);
          });
        }
        for (const stretch of band.stretches) assert.ok(stretch.length >= HILLS.shortest);
      }
      steeps.sort((a, b) => a - b);
      const middle = steeps[Math.floor(steeps.length / 2)];
      assert.ok(steeps.length > 20 && Math.abs(middle - steep) < 10, `seed ${seed}, asked ${steep}°: the bands are ${middle?.toFixed(0)}° steep`);
    }
  }
});

test('a steeper band is asked for: the land gets steeper there', () => {
  const steepest = (land) => {
    let most = 0;
    over(1, (x, z) => { most = Math.max(most, land.slopeAt(x, z)); });
    return most;
  };
  assert.ok(steepest(createHills({ seed: 1, steep: 45 })) < steepest(createHills({ seed: 1, steep: 60 })));
  assert.ok(steepest(createHills({ seed: 1, steep: 60 })) < steepest(createHills({ seed: 1, steep: 75 })));
});

test('the runs join up: unbroken lines inside the land, rings closed, and the lengths add up', () => {
  banded.forEach((bands, n) => {
    assert.ok(total(bands, 'cliff') > 30, `seed ${SEEDS[n]}: ${total(bands, 'cliff').toFixed(0)} m of cliff`);
    for (const band of bands) {
      let length = 0;
      for (const run of band.runs) {
        assert.equal(run.steep.length, run.points.length - 1);
        assert.equal(run.stands.length, run.points.length - 1);
        for (let i = 0; i < run.points.length; i++) {
          const [x, z] = run.points[i];
          assert.ok(Math.abs(x) <= half && Math.abs(z) <= half);
          // (a piece crosses one square of the tracing's grid)
          if (i) assert.ok(Math.hypot(x - run.points[i - 1][0], z - run.points[i - 1][1]) < 1.42);
        }
        if (run.ring) assert.deepEqual(run.points[0], run.points.at(-1));
        // (level beds, hills inside the land: every run is a ring)
        assert.ok(run.ring);
        length += run.length;
      }
      assert.ok(Math.abs(length - band.cliff - band.gentle) < 1e-6);
      assert.ok(Math.abs(band.stretches.reduce((sum, stretch) => sum + stretch.length, 0) - band.cliff) < 1e-6);
      for (const stretch of band.stretches) {
        for (let i = 1; i < stretch.points.length; i++) {
          assert.ok(Math.hypot(stretch.points[i][0] - stretch.points[i - 1][0], stretch.points[i][1] - stretch.points[i - 1][1]) < 1.42);
        }
      }
    }
  });
});

test('bands come and go: an even bed is as thick everywhere; the more uneven, the thinner', () => {
  for (const seed of SEEDS) {
    const [none, some, more, most] = [0, 0.3, 0.6, 1].map((uneven) => createHills({ seed, uneven }));
    over(4, (x, z) => {
      for (let k = 0; k < none.feet.length; k++) {
        assert.equal(none.thickAt(k, x, z), none.tall);
        assert.ok(some.thickAt(k, x, z) <= none.tall);
        assert.ok(more.thickAt(k, x, z) <= some.thickAt(k, x, z));
        assert.ok(most.thickAt(k, x, z) <= more.thickAt(k, x, z));
      }
    });
    const cliff = (land) => total(bandsOf(land), 'cliff');
    // even: a cliff all the way round, wherever there's a band
    assert.equal(total(bandsOf(none), 'gentle'), 0);
    assert.ok(cliff(most) < 0.35 * cliff(none), `seed ${seed}: ${cliff(most).toFixed(0)} m of cliff at the most uneven, ${cliff(none).toFixed(0)} m even`);
  }
  // as it starts, the big hill of seed 1 has cliff on this side and none on that
  assert.ok(banded[0][0].cliff > 30 && banded[0][0].gentle > 30);
});

test('more hard beds make more bands and a land at least as high; a taller band or taller hills, a higher land', () => {
  for (const seed of SEEDS) {
    let before = 0;
    for (const beds of [1, 2, 3, 4]) {
      const land = createHills({ seed, beds, uneven: 0 });
      assert.equal(bandsOf(land).length, beds);
      assert.ok(highest(land) >= before - 1e-9);
      before = highest(land);
    }
    assert.ok(highest(createHills({ seed, tall: 3, uneven: 0 })) < highest(createHills({ seed, tall: 7, uneven: 0 })));
    assert.ok(highest(createHills({ seed, hilly: 3 })) < highest(createHills({ seed, hilly: 9 })));
  }
});

test('the beds lie one above another, the same ones whatever their number', () => {
  for (const seed of SEEDS) {
    for (const beds of [2, 3, 4]) {
      const { feet, tall } = createHills({ seed, beds });
      for (let k = 1; k < feet.length; k++) assert.ok(feet[k] > feet[k - 1] + tall, `seed ${seed}, ${beds} beds: bed ${k} begins inside the one below`);
    }
  }
});

test('the page can draw it: the ground as facets, and a mark along every piece of every band', () => {
  const land = lands[0];
  const ground = landMesh(land, { step: 2, bare: 1 });
  assert.equal(ground.geometry.attributes.position.count, (HILLS.size / 2) ** 2 * 6);
  const marks = bandMarks(land, banded[0]);
  const pieces = banded[0].reduce((sum, band) => sum + band.runs.reduce((n, run) => n + run.points.length - 1, 0), 0);
  assert.equal(marks.geometry.attributes.position.count, pieces * 12);
  for (const mesh of [ground, marks]) for (const v of mesh.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
});
