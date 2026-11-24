import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { landMesh } from './land.js';
import { measure } from './granite.js';
import { KINDS } from './kinds.js';
import { SUN, drawRocks } from './rockLook.js';
import { HILLS, bandMarks, bandsOf } from './hills.js';
import { CONTOURS, contourLines } from './contours.js';
import { EXTRAS } from './extras.js';
import { placeSteps, placerFor } from './place.js';
import { groupsOf } from './walk.js';
import { FIRST_TAB, STARTS, TABS, TAB_KEYS, defaultSettings, kindOn, panelOf, sizeOn } from './settings.js';
import { SPOT_X, cliffOf, cliffsOf, hillsOf, stoneOf, testLandOf, thingOf } from './make.js';

// The page.
//
// Four tabs, one for each level Rock Lab builds in, each made only of the
// one before it and a rule:
//
// "Stone": one rock on the test slope, a row of it at five ages, and
// the workshop's amorphous boulder beside the row.
//
// "Cluster": one cluster of rocks on the slope, and its row. Layered
// rock's cluster is a stack of courses.
//
// "Cliff": clusters of granite along the test slope's steep band, and one
// slider, "how much shows", taking it from stones in the grass, to
// outcrops, to a cliff; fallen rock on a bank at its foot, and rock at its
// rim. Layered rock's cliff is the same few beds running the length of the
// face, laid with slabs.
//
// "Land": a small land of hills, stepped by hard beds, with a line along
// the foot of each steep band: dark where a cliff would stand, pale where
// the band is too gentle; and granite on the land, laid by place (or the
// old way, along every dark line), a thing at a time so the page stays
// alive; and, for the walk, each group's outline, ground or wall.
//
// Every setting is a row of one table (src/settings.js), and the panel is
// built from it: a tab shows its own level's rows, and under them, folded
// away, the rows of the levels it is made of. What each tab makes from the
// settings is in src/make.js. Each tab keeps its own camera.
//
// It draws only when something changes (a slider, the camera), so it sits
// idle otherwise. One stone or cluster follows a slider as it moves; the
// row, and the cliff (a hundred rocks and more), follow a moment after it
// stops.

const settings = defaultSettings();
// The tab on show. (Not a setting: it is where the visitor is looking.)
let tab = FIRST_TAB;
const layered = () => kindOn(tab, settings.kind) === 'layered';
const onEdge = () => tab === 'cliff';
const onLand = () => tab === 'land';
const HILLS_STEP = 0.5; // m: a square of the hills' drawn ground
const ROW_MOST = 1.6;  // the row shows the cluster with its biggest rock at most this long (m)
const ROW_AGES = [0, 0.25, 0.5, 0.75, 1];
const ROW_NAMES = ['age 0 (young)', '¼', '½', '¾', 'age 1 (old)'];
const WAIT = 250;      // ms: the row and the cliff follow a slider this long after it stops
const WAIT_LAND = 60;  // ms: the land of hills follows nearly at once

// --- The scene ---------------------------------------------------------------------

const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.append(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
view.append(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd3e6);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1;
controls.maxDistance = 170;

scene.add(new THREE.HemisphereLight(0xe3edf7, 0x6b7a55, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e2, 2.3);
sun.position.copy(SUN).multiplyScalar(70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 5, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
// How far from the middle the shadows reach (m): the test land's, or the
// land of hills'.
function shadowsReach(reach) {
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach });
  sun.shadow.camera.updateProjectionMatrix();
}

// Draws once, on the next frame. (A hidden window gets no frames: then
// after a moment it's drawn anyway, so the picture is never stale.)
let frame = 0;
let late = 0;
function drawNow() {
  cancelAnimationFrame(frame);
  clearTimeout(late);
  frame = 0;
  late = 0;
  renderer.render(scene, camera);
  labels.render(scene, camera);
}
function draw() {
  if (frame) return;
  frame = requestAnimationFrame(drawNow);
  late = setTimeout(drawNow, 150);
}
controls.addEventListener('change', draw);
function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  draw();
}
window.addEventListener('resize', resize);

// --- What's on the land --------------------------------------------------------------

let land = null;
let ground = null;                  // the land's mesh
const edge = new THREE.Group();     // the edge, and its marker
const slope = new THREE.Group();    // the one cluster on the slope, and its marker
const row = new THREE.Group();      // the row on the meadow
const hills = new THREE.Group();    // the land of hills' lines, names and marker
const cliffs = new THREE.Group();   // the land of hills' rock: its finished stretches
const coming = new THREE.Group();   // and the rock of the stretch being made, as it comes
const walkMarks = new THREE.Group(); // each group's outline: green where the walk goes over it, orange where it's a wall
scene.add(edge, slope, row, hills, cliffs, coming, walkMarks);
const stats = { edge: {}, slope: {}, row: {}, land: {} };
const said = document.getElementById('readout');

// A man-high marker, 1.8 m.
function marker(x, z) {
  const figure = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.2, 4, 10), material);
  body.position.y = 0.77;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), material);
  head.position.y = 1.67;
  figure.add(body, head);
  figure.traverse((o) => { o.castShadow = true; });
  figure.position.set(x, land.heightAt(x, z), z);
  return figure;
}

function label(text, x, y, z, head = false) {
  const el = document.createElement('div');
  el.className = head ? 'label head' : 'label';
  el.textContent = text;
  const object = new CSS2DObject(el);
  object.position.set(x, y, z);
  object.visible = settings.labels;
  return object;
}

function clear(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse?.((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
      if (o.isCSS2DObject) o.element.remove();
    });
  }
}

function buildLand() {
  if (ground) {
    scene.remove(ground);
    ground.geometry.dispose();
    ground.material.dispose();
  }
  if (onLand()) {
    // The land of hills: its steep bands bare, grass elsewhere; and it
    // shades itself, so its steps read.
    land = hillsOf(settings);
    ground = landMesh(land, { step: HILLS_STEP, bare: 1 });
    ground.castShadow = true;
  } else {
    // (Under a cliff the test slope has its bank of fallen rock at the foot.)
    land = testLandOf(settings, tab);
    ground = landMesh(land, { bare: bareness() });
  }
  scene.add(ground);
}

// How bare the steep ground is: under a cliff, the more rock shows, the
// less soil lies on it. (One stone or cluster stands in the workshop's own
// grassy look.)
const bareness = () => (onEdge() ? THREE.MathUtils.smoothstep(settings.shows, 0.15, 0.7) : 0);

// The thing the tab on show is about, at a place on the test slope: one
// stone, or one cluster (src/make.js).
const thing = (over, kind = settings.kind) => thingOf(tab)(land, settings, over, kind);
// How many rocks it was asked for.
const asked = () => (tab === 'stone' ? 1 : settings.pieces);
const f = (n, d = 2) => n.toFixed(d);
const pct = (n) => f(100 * n, 0);
const average = (list) => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : 0);

// --- The cliff, on the test slope ------------------------------------------------------

function buildEdge() {
  const started = performance.now();
  // (The bank at the foot and the bare ground follow the sliders: the land
  // is made again with the edge.)
  buildLand();
  clear(edge);
  // Granite's cliff is clusters along the slope; layered rock's is its
  // beds running the length of the face.
  const made = cliffOf(land, settings);
  const mesh = drawRocks(made.rocks, land.heightAt, { tone: { seed: settings.seed, size: settings.size } });
  edge.add(mesh);
  const below = land.placeOn(-2, -0.75);
  edge.add(marker(below.x, below.z));
  Object.assign(stats.edge, {
    spots: made.spots, beds: made.beds, rocks: made.rocks.length, left: made.left,
    face: made.face, lip: made.lip ?? 0, loose: made.loose,
    buried: average(made.rocks.map((r) => r.buried)),
    stands: made.rocks.length ? Math.max(...made.rocks.map((r) => r.stands)) : 0,
    biggest: made.rocks.length ? Math.max(...made.rocks.map((r) => r.size)) : 0,
    triangles: mesh.userData.triangles,
    ms: performance.now() - started,
    list: made.list,
  });
  readout();
  draw();
}

// --- The land of hills ---------------------------------------------------------------

// Where a man stands at the foot of a band, and the way from there to a
// camera looking up at it (the camera's "near" aims there).
const bandSpot = new THREE.Vector3();
const bandFrom = new THREE.Vector3(14, 6, 18);

// (The land is made again only when one of its own sliders moved: the
// rock's sliders leave it as it is.)
let landKey = '';
let landBands = [];
function buildHills(anew = true) {
  const s = settings;
  const key = JSON.stringify([s.landSeed, s.hillCount, s.hilly, s.hardBeds, s.bandTall, s.bandSteep, s.bandUneven, s.bedTilt, s.bedToward, s.contours, s.marks, s.labels]);
  if (anew || key !== landKey) {
    landKey = key;
    buildHillsLand();
  }
  buildCliffs(landBands);
}
function buildHillsLand() {
  const started = performance.now();
  buildLand();
  clear(hills);
  const bands = bandsOf(land);
  landBands = bands;
  if (settings.marks) hills.add(bandMarks(land, bands));
  // Contour lines, as on a map.
  const contours = settings.contours ? contourLines(ground) : null;
  if (contours) hills.add(contours);

  // Each band is named at the middle of its longest stretch where a cliff
  // would stand. A man stands at the foot of the longest of all.
  let most = null;
  bands.forEach((band, k) => {
    const longest = band.stretches.reduce((best, stretch) => (!best || stretch.length > best.length ? stretch : best), null);
    if (!longest) return;
    const [x, z] = longest.points[Math.floor(longest.points.length / 2)];
    hills.add(label(`band ${k + 1}: a cliff along ${f(band.cliff, 0)} m`, x, land.heightAt(x, z) + settings.bandTall + 2, z));
    if (!most || longest.length > most.length) most = { length: longest.length, x, z };
  });
  if (most) {
    // (The land's normal leans downhill: the marker stands 4 m out from the foot,
    // clear of the fallen rock.)
    const n = land.normalAt(most.x, most.z);
    const flat = Math.hypot(n.x, n.z) || 1;
    const [dx, dz] = [n.x / flat, n.z / flat];
    const [x, z] = [most.x + 4 * dx, most.z + 4 * dz];
    hills.add(marker(x, z));
    bandSpot.set(most.x, land.heightAt(most.x, most.z) + 0.5 * settings.bandTall, most.z);
    bandFrom.set(dx, 0, dz).multiplyScalar(20).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).setY(5);
  } else {
    bandSpot.set(0, land.heightAt(0, 0), 0);
    bandFrom.set(14, 6, 18);
  }

  let rises = 0, steep = 0, all = 0;
  for (let x = land.size.x0; x <= land.size.x1; x += 2) {
    for (let z = land.size.z0; z <= land.size.z1; z += 2) {
      rises = Math.max(rises, land.heightAt(x, z));
      all++;
      if (land.slopeAt(x, z) >= HILLS.cliff) steep++;
    }
  }
  Object.assign(stats.land, {
    rises, steep: steep / all,
    hills: land.hills.length,
    contours: contours ? contours.userData.heights : 0,
    bands: bands.map((band) => ({ cliff: band.cliff, gentle: band.gentle, stretches: band.stretches.length })),
    cliff: bands.reduce((sum, band) => sum + band.cliff, 0),
    gentle: bands.reduce((sum, band) => sum + band.gentle, 0),
    triangles: ground.geometry.attributes.position.count / 3,
    ms: performance.now() - started,
  });
  readout();
  draw();
}

// Granite along the land's dark lines, the old way: the edge, laid along
// every stretch where a cliff would stand, the longest first. A cluster
// at a time, in short turns, so the page stays alive while it fills in;
// the rock is drawn as it comes, and a stretch once it's whole.
let cliffRun = 0;   // (a newer build stops an older one)
const TURN = 24;    // ms of work before the page gets its turn
// Whether the land's rock is laid by place: always, where there is no old
// way to compare (the public copy).
const byPlace = () => settings.byPlace || !EXTRAS.oldWay;

function buildCliffs(bands) {
  const run = ++cliffRun;
  clear(cliffs);
  clear(coming);
  clear(walkMarks);
  walkGroups = [];
  if (byPlace()) {
    buildByPlace(run);
    return;
  }
  const dark = bands.reduce((sum, band) => sum + band.stretches.length, 0);
  // (With the slope's say: the pale lengths too, and the stones strewn over the hills.)
  const stretches = dark + (settings.slopeSay > 0 ? bands.reduce((sum, band) => sum + EXTRAS.oldWay.fadesOf(band).length, 0) + 1 : 0);
  const rock = { on: settings.rock, rocks: 0, face: 0, lip: 0, loose: 0, left: 0, buried: 0, triangles: 0, dark, pale: 0, strewn: 0, stretches, finished: 0, soFar: 0, ms: 0, building: settings.rock && stretches > 0 };
  stats.land.rock = rock;
  if (!rock.building) {
    readout();
    draw();
    return;
  }
  const tone = { seed: settings.seed, size: settings.size };
  const steps = EXTRAS.oldWay.cliffSteps(land, bands, cliffsOf(settings));
  const fresh = [];   // the rocks placed since the last drawing
  const turn = () => {
    if (run !== cliffRun) return;
    const began = performance.now();
    while (rock.building && performance.now() - began < TURN) {
      const step = steps.next();
      if (step.done) {
        rock.building = false;
      } else if (step.value.rocks) {
        fresh.push(...step.value.rocks);
        rock.soFar += step.value.rocks.length;
      } else {
        // A stretch is whole: one mesh for it, in place of the rock drawn as it came.
        clear(coming);
        fresh.length = 0;
        const { made } = step.value;
        const mesh = drawRocks(made.rocks, land.heightAt, { tone });
        cliffs.add(mesh);
        rock.rocks += made.rocks.length;
        if (step.value.pale) rock.pale += made.rocks.length;
        if (step.value.strewn) rock.strewn += made.rocks.length;
        rock.face += made.face;
        rock.lip += made.lip;
        rock.loose += made.loose;
        rock.left += made.left;
        rock.buried += made.rocks.reduce((sum, r) => sum + r.buried, 0);
        rock.triangles += mesh.userData.triangles;
        rock.finished++;
      }
    }
    if (fresh.length) coming.add(drawRocks(fresh.splice(0), land.heightAt, { tone }));
    rock.ms += performance.now() - began;
    readout();
    draw();
    if (rock.building) setTimeout(turn, 0);
  };
  turn();
}

// The same rock laid by place (src/place.js): over the whole land, a
// thing at a time, drawn as it comes and as one mesh once it's all laid.
function buildByPlace(run) {
  const dark = landBands.reduce((sum, band) => sum + band.stretches.length, 0);
  const rock = { on: settings.rock, rocks: 0, face: 0, lip: 0, loose: 0, left: 0, buried: 0, triangles: 0, dark, pale: 0, strewn: 0, stretches: 1, finished: 0, soFar: 0, ms: 0, building: settings.rock, byPlace: true };
  stats.land.rock = rock;
  if (!rock.building) {
    readout();
    draw();
    return;
  }
  const tone = { seed: settings.seed, size: settings.size };
  const { x0, x1, z0, z1 } = land.size;
  const steps = placeSteps(placerFor(land, cliffsOf(settings)), { x0, x1, z0, z1 });
  const fresh = [];
  const turn = () => {
    if (run !== cliffRun) return;
    const began = performance.now();
    while (rock.building && performance.now() - began < TURN) {
      const step = steps.next();
      if (!step.done) {
        const { rocks, part, pale } = step.value;
        fresh.push(...rocks);
        rock.soFar += rocks.length;
        if (pale) rock.pale += rocks.length;
        if (part === 'face') rock.face += rocks.length;
        else if (part === 'rim') rock.lip += rocks.length;
        else if (part === 'fallen') rock.loose += rocks.length;
        else rock.strewn += rocks.length;
        continue;
      }
      rock.building = false;
      clear(coming);
      fresh.length = 0;
      const made = step.value;
      const mesh = drawRocks(made.rocks, land.heightAt, { tone });
      cliffs.add(mesh);
      rock.rocks = made.rocks.length;
      rock.left = made.left;
      rock.buried = made.rocks.reduce((sum, r) => sum + r.buried, 0);
      rock.triangles = mesh.userData.triangles;
      rock.finished = 1;
      // For the walk: each group ground or wall.
      walkGroups = groupsOf(made.laid, land.heightAt);
      rock.walk = { ground: walkGroups.filter((g) => g.ground).length, wall: walkGroups.filter((g) => !g.ground).length };
      drawWalk();
    }
    if (fresh.length) coming.add(drawRocks(fresh.splice(0), land.heightAt, { tone }));
    rock.ms += performance.now() - began;
    readout();
    draw();
    if (rock.building) setTimeout(turn, 0);
  };
  turn();
}

// Each group's outline on the land, for the walk: green where the walk
// goes over it, orange where it is a wall. (Only for the rock laid by place.)
let walkGroups = [];
function drawWalk() {
  clear(walkMarks);
  if (!settings.walk || !byPlace()) return;
  const [GROUND_LINE, WALL_LINE] = [new THREE.LineBasicMaterial({ color: 0x2fb344 }), new THREE.LineBasicMaterial({ color: 0xe8590c })];
  for (const g of walkGroups) {
    const points = g.outline.map(([x, z]) => new THREE.Vector3(x, land.heightAt(x, z) + 0.08, z));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), g.ground ? GROUND_LINE : WALL_LINE);
    walkMarks.add(line);
  }
}

// --- One stone, or one cluster -----------------------------------------------------------

// Where the stone or the cluster is, and its row (the camera's buttons aim there).
const slopeSpot = new THREE.Vector3();
const rowSpot = new THREE.Vector3();

function buildSlope() {
  const started = performance.now();
  clear(slope);
  const at = land.placeOn(SPOT_X, settings.where);
  const cluster = thing({ x: at.x, z: at.z });
  slopeSpot.set(at.x, at.y + 0.3 * settings.size, at.z);
  const mesh = drawRocks(cluster.rocks, land.heightAt, { tone: { seed: settings.seed, size: settings.size } });
  slope.add(mesh);
  // (A man at the foot of the slope, beside it: nearer to one stone than to a cluster.)
  const below = land.placeOn(SPOT_X + (tab === 'stone' ? 0.8 : 1.6) * settings.size + 1.4, -0.2);
  slope.add(marker(below.x, below.z));

  const { rocks } = cluster;
  const big = rocks[0];
  Object.assign(stats.slope, {
    rocks: rocks.length,
    left: cluster.left,
    courses: new Set(rocks.map((r) => r.course)).size,
    big: big ? { ...measure(big), length: big.length, width: big.width, thick: big.thick * big.size } : null,
    buried: rocks.length ? [Math.min(...rocks.map((r) => r.buried)), Math.max(...rocks.map((r) => r.buried))] : [0, 0],
    stands: rocks.length ? Math.max(...rocks.map((r) => r.stands)) : 0,
    pushed: rocks.length ? Math.max(...rocks.map((r) => r.pushed)) : 0,
    triangles: mesh.userData.triangles,
    ms: performance.now() - started,
    steep: land.slopeAt(at.x, at.z),
    list: cluster.list,
  });
  readout();
  draw();
}

// The row on the low meadow: the same stone or cluster at five ages, on
// level ground with no slant, and the workshop's amorphous boulder beside
// it.
function buildRow() {
  const started = performance.now();
  clear(row);
  const size = Math.min(settings.size, ROW_MOST);
  const gap = 3.3 * size;
  // (Something beside the row to compare: Rock Lab's own granite beside
  // layered rock; beside granite, the workshop's boulder, where this copy has it.)
  const comparing = settings.workshop && (layered() || !!EXTRAS.workshop);
  const places = ROW_AGES.length + (comparing ? 1 : 0);
  const span = (places - 1 + (comparing ? 0.3 : 0)) * gap;
  const rowX = (i) => -span / 2 + i * gap + (i >= ROW_AGES.length ? 0.3 * gap : 0) - 1;
  const rowZ = (x) => land.foot(x) + 7 + 1.2 * size;
  const high = 1.6 * size + 0.7;
  let rocks = 0;
  let triangles = 0;
  ROW_AGES.forEach((age, i) => {
    const x = rowX(i);
    const z = rowZ(x);
    const cluster = thing({ x, z, size, age, slant: 0, lean: 0, turn: 0.6, shows: 1 });
    const mesh = drawRocks(cluster.rocks, land.heightAt, { tone: { seed: settings.seed, size } });
    row.add(mesh);
    rocks += cluster.rocks.length;
    triangles += mesh.userData.triangles;
    row.add(label(ROW_NAMES[i], x, land.heightAt(x, z + 1.5 * size) + 0.05, z + 1.5 * size));
  });
  const mid = rowX(2);
  rowSpot.set(mid, land.heightAt(mid, rowZ(mid)) + 0.4 * size, rowZ(mid));
  row.add(label(layered() && tab !== 'stone' ? 'layered rock in courses, Rock Lab' : `${KINDS[settings.kind].name}${asked() > 1 ? ' cluster' : ''}, Rock Lab`, mid, land.heightAt(mid, rowZ(mid)) + high, rowZ(mid), true));

  // Beside the row, to compare: for layered rock, a granite stone or
  // cluster of the same size and age; for granite, the workshop's own
  // merged boulder, about as big as a cluster.
  if (comparing && layered()) {
    const x = rowX(ROW_AGES.length);
    const z = rowZ(x);
    // (Granite's own cluster is a heap, whichever kind is on show.)
    const cluster = (tab === 'stone' ? stoneOf : thingOf('cluster'))(land, settings, { x, z, size, slant: 0, lean: 0, turn: 0.6, shows: 1 }, 'granite');
    const mesh = drawRocks(cluster.rocks, land.heightAt, { tone: { seed: settings.seed, size } });
    row.add(mesh);
    rocks += cluster.rocks.length;
    triangles += mesh.userData.triangles;
    row.add(label('granite', x, land.heightAt(x, z + 1.5 * size) + 0.05, z + 1.5 * size));
    row.add(label('to compare', x, land.heightAt(x, z) + high, z, true));
  } else if (comparing) {
    const x = rowX(ROW_AGES.length);
    const z = rowZ(x);
    const made = EXTRAS.workshop.createRocks([{ kind: 'amorphous boulder', size: 'normal', across: 2 * size, x, z, seed: settings.seed, turn: 0.6 }], land.heightAt);
    const mesh = EXTRAS.workshop.drawRocks(made.rocks);
    row.add(mesh);
    rocks += made.rocks.length;
    triangles += mesh.geometry.attributes.position.count / 3;
    row.add(label('amorphous boulder', x, land.heightAt(x, z + 1.5 * size) + 0.05, z + 1.5 * size));
    row.add(label("the workshop's", x, land.heightAt(x, z) + high, z, true));
  }
  const end = rowX(0) - 0.6 * gap;
  row.add(marker(end, rowZ(end)));

  Object.assign(stats.row, { rocks, triangles, ms: performance.now() - started });
  readout();
  draw();
}

// --- The readout ---------------------------------------------------------------------

function readout() {
  if (onLand()) {
    const l = stats.land;
    if (!l.bands) return;
    const n = l.bands.length;
    const r = l.rock;
    said.textContent = [
      `The land: ${HILLS.size} m across, ${l.hills} ${l.hills > 1 ? 'hills' : 'hill'}, rising ${f(l.rises, 1)} m · ${n} hard ${n > 1 ? 'beds lie' : 'bed lies'} through ${l.hills > 1 ? 'them' : 'it'}, each making one steep band`,
      `Dark lines, where a cliff would stand: ${f(l.cliff, 0)} m in all · pale lines, where the band is too low or too gentle for one: ${f(l.gentle, 0)} m · ${pct(l.steep)}% of the land is steeper than ${HILLS.cliff}°`,
      !r?.on ? 'No rock on the land (tick "rock on the land").'
        : !r.stretches ? 'No rock on the land: there is no dark line to lay it along.'
          : r.building && r.byPlace ? `Granite, laid by place: ${r.soFar} rocks so far …`
          : r.building ? `Granite: placing rock, ${r.soFar} so far, on part ${Math.min(r.finished + 1, r.stretches)} of ${r.stretches} …`
            : `Granite${r.byPlace ? ', laid by place' : ', the old way'}: ${r.rocks - r.pale - r.strewn} rocks along the dark lines${r.pale ? `, ${r.pale} along the pale ones` : ''}${r.strewn ? `, ${r.strewn} strewn over the hills` : ''} · ${r.face} in the faces, ${r.lip} at the rims, ${r.loose} fallen at the feet${r.left ? ` (${r.left} left out)` : ''} · ${pct(r.rocks ? r.buried / r.rocks : 0)}% buried on average`,
      r?.walk && settings.walk ? `For the walk: ${r.walk.ground} groups of rock the walk can go over (green), ${r.walk.wall} walls (orange)` : null,
      `On the page:${l.contours ? ` a contour line every ${CONTOURS.every} m of height, a bolder one every ${CONTOURS.every * CONTOURS.bold} m ·` : ''} ${l.triangles + (r?.triangles ?? 0)} triangles drawn · the land built in ${f(l.ms, 0)} ms${r?.on && r.stretches ? `, the rock in ${f(r.ms / 1000, 1)} s${r.building ? ' so far' : ''}` : ''}`,
    ].filter((line) => line !== null).join('\n');
    return;
  }
  if (onEdge()) {
    const e = stats.edge;
    if (!e.spots && !e.beds) return;
    said.textContent = [
      layered()
        ? `The cliff (layered rock): ${e.face} slabs in ${e.beds.showing} of its ${e.beds.all} hard beds, ${e.loose} fallen at its foot${e.left ? ` (${e.left} more not kept)` : ''} · the longest ${f(e.biggest)} m`
        : `The cliff (granite): rock at ${e.spots.placed} of its ${e.spots.all} spots · ${e.face} rocks in the face, ${e.loose} fallen at its foot, ${e.lip} at its rim${e.left ? ` (${e.left} left out)` : ''} · the biggest ${f(e.biggest)} m long`,
      e.rocks ? `In the ground: ${pct(e.buried)}% buried on average · stands ${f(e.stands)} m out at most` : 'No rock shows yet.',
      `On the page: ${e.rocks} rocks · ${e.triangles} triangles drawn · built in ${f(e.ms, 0)} ms`,
    ].join('\n');
    return;
  }
  const s = stats.slope;
  const r = stats.row;
  const b = s.big;
  said.textContent = (b ? [
    tab === 'stone'
      ? `The stone (${KINDS[settings.kind].name}): ${f(b.length)} × ${f(b.width)} × ${f(b.thick)} m, ${b.faces} faces, sharpest edge ${f(b.sharpest, 0)}°`
      : layered()
        ? `The stack (layered rock): ${s.rocks} ${s.rocks > 1 ? 'slabs' : 'slab'} in ${s.courses} ${s.courses > 1 ? 'courses' : 'course'}${s.left ? ` (${s.left} more not kept: in the hill, or with nothing under them)` : ''} · its first slab ${f(b.length)} × ${f(b.width)} × ${f(b.thick)} m, sharpest edge ${f(b.sharpest, 0)}°`
        : `${s.rocks > 1 ? 'The cluster' : 'The rock'}: ${s.rocks} ${s.rocks > 1 ? 'rocks' : 'rock'}${s.left ? ` (${s.left} left out)` : ''} · the big one ${f(b.length)} × ${f(b.width)} × ${f(b.thick)} m, ${b.faces} faces, sharpest edge ${f(b.sharpest, 0)}°`,
    layered() && tab !== 'stone'
      ? `In the ground: ${pct(s.buried[0])}${s.rocks > 1 ? `–${pct(s.buried[1])}` : ''}% buried · stands ${f(s.stands)} m out at most · every slab rests on the land or the slabs under it · the land here is ${f(s.steep, 0)}° steep`
      : `In the ground: ${pct(s.buried[0])}${s.rocks > 1 ? `–${pct(s.buried[1])}` : ''}% buried · stands ${f(s.stands)} m out at most${tab === 'stone' ? '' : ` · pushed up to ${f(s.pushed)} m further in so nothing floats`} · the land here is ${f(s.steep, 0)}° steep`,
    `On the page: ${s.rocks + (r.rocks ?? 0)} rocks · ${s.triangles + (r.triangles ?? 0)} triangles drawn · ${tab === 'stone' ? 'the stone' : 'the cluster'} built in ${f(s.ms, 1)} ms${r.ms === undefined ? '' : `, the row in ${f(r.ms, 0)} ms`}`,
  ] : [`Left out: too little of the ${tab === 'stone' ? 'stone' : 'big rock'} would show here.`]).join('\n');
}

// --- Building, as the sliders move -------------------------------------------------------

// Everything, now.
let waiting = 0;
function buildAll() {
  clearTimeout(waiting);
  const edgeView = onEdge();
  const landView = onLand();
  edge.visible = edgeView;
  slope.visible = !edgeView && !landView;
  row.visible = !edgeView && !landView;
  hills.visible = landView;
  cliffs.visible = landView;
  coming.visible = landView;
  walkMarks.visible = landView;
  shadowsReach(landView ? HILLS.size / 2 + 20 : 32);
  if (!landView) {
    // (Any rock still being laid on the land of hills stops.)
    cliffRun++;
    clear(cliffs);
    clear(coming);
  }
  if (landView) {
    clear(edge);
    clear(slope);
    clear(row);
    buildHills();
  } else if (edgeView) {
    clear(hills);
    clear(slope);
    clear(row);
    buildEdge();
  } else {
    clear(hills);
    clear(edge);
    buildLand();
    buildSlope();
    buildRow();
  }
}

// A slider moved: one stone or cluster follows it now and its row a moment
// after; the cliff a moment after it stops.
function build() {
  clearTimeout(waiting);
  if (onLand()) {
    waiting = setTimeout(() => buildHills(false), WAIT_LAND);
  } else if (onEdge()) {
    waiting = setTimeout(buildEdge, WAIT);
  } else {
    buildSlope();
    waiting = setTimeout(buildRow, WAIT);
  }
}

// --- The camera ----------------------------------------------------------------------

function aim(target, from) {
  controls.target.copy(target);
  camera.position.copy(target).add(from);
  controls.update();
  draw();
}

const look = {
  all() {
    if (onLand()) aim(new THREE.Vector3(0, 4, 3), new THREE.Vector3(14, 46, 78));
    else aim(new THREE.Vector3(-1.5, 2.5, 4), new THREE.Vector3(2, 11, 30));
  },
  near() {
    if (onLand()) aim(bandSpot, bandFrom);
    else if (onEdge()) aim(new THREE.Vector3(-6, 3.4, 0.5), new THREE.Vector3(11, 1.2, 16));
    // (One stone is looked at from nearer than a cluster of the same size.)
    else aim(slopeSpot, new THREE.Vector3(5, 2.6, 9.5).multiplyScalar(Math.max(0.7, settings.size / (tab === 'stone' ? 2 : 1.5))));
  },
  side() {
    if (onLand()) aim(new THREE.Vector3(0, 6, 0), new THREE.Vector3(86, 10, 22));
    else if (onEdge()) aim(new THREE.Vector3(-4, 3.5, 0), new THREE.Vector3(-22, 4, 9));
    else aim(rowSpot, new THREE.Vector3(1, 8, 19));
  },
};

// Each tab keeps its own camera: where it was left; or, the first time,
// where the tab opens (a stone and a cluster from near, a cliff and a land
// whole).
const OPENS = { stone: 'near', cluster: 'near', cliff: 'all', land: 'all' };
const cameras = new Map();
function keepCamera() {
  cameras.set(tab, { at: camera.position.clone(), target: controls.target.clone() });
}
function showCamera() {
  const kept = cameras.get(tab);
  if (!kept) {
    look[OPENS[tab]]();
    return;
  }
  camera.position.copy(kept.at);
  controls.target.copy(kept.target);
  controls.update();
  draw();
}

// --- The panel, built from the settings table (src/settings.js) ------------------------------

const gui = new GUI({ title: 'Rock Lab' });

// What follows a row's change, where that isn't the usual (build).
const AFTER = {
  // (Each kind starts at the slant and the size that suit it; the sliders
  // are the visitor's from there. Its rows differ, and so does where the tab opens.)
  kind(kind) {
    Object.assign(settings, STARTS[kind]);
    cameras.delete(tab);
    fillPanel();
    buildAll();
    showCamera();
  },
  steep() {
    buildLand();
    build();
  },
  shadows(on) {
    sun.castShadow = on;
    draw();
  },
  workshop: buildAll,
  labels: buildAll,
  walk() {
    drawWalk();
    draw();
  },
};

// Which folders the visitor has folded or unfolded, on each tab. (Theirs,
// for this visit: not a setting.)
const unfolded = new Map();
const folderKey = (path) => `${tab}/${path}`;
function keepFolds() {
  for (const folder of gui.foldersRecursive()) if (folder.userData) unfolded.set(folder.userData, !folder._closed);
}

// The panel shows the tab on show: its own rows, then the rows of the
// levels it is made of, folded away.
function fillPanel() {
  keepFolds();
  for (const child of [...gui.children]) child.destroy();
  const addRow = (folder, row) => {
    if (row.extra && !EXTRAS[row.extra]) return; // (a row for what this copy hasn't)
    const control = row.choices ? folder.add(settings, row.key, row.choices)
      : row.range ? folder.add(settings, row.key, ...row.range)
        : folder.add(settings, row.key);
    control.name(row.name).onChange(AFTER[row.key] ?? build);
    control.domElement.dataset.row = row.key;
  };
  const addFolder = (parent, section, path) => {
    const folder = parent.addFolder(section.title);
    folder.userData = folderKey(path);
    if (!(unfolded.get(folder.userData) ?? section.open)) folder.close();
    return folder;
  };
  for (const section of panelOf(tab, settings.kind)) {
    if (!section.title) {
      section.rows.forEach((row) => addRow(gui, row));
      continue;
    }
    const folder = addFolder(gui, section, section.key);
    if (section.parts) {
      for (const part of section.parts) {
        const inner = addFolder(folder, part, `${section.key}/${part.key}`);
        part.rows.forEach((row) => addRow(inner, row));
      }
    } else {
      section.rows.forEach((row) => addRow(folder, row));
    }
    if (section.key === 'view') {
      folder.add(look, 'all').name('look at it all');
      folder.add(look, 'near').name('look from near');
      folder.add(look, 'side').name(onEdge() || onLand() ? 'look along it' : 'look at the row');
    }
  }
}

// --- The tabs ------------------------------------------------------------------------

const tabButtons = new Map();
const tabSays = document.getElementById('says');
for (const { key, name, made } of TABS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.title = made;
  button.setAttribute('role', 'tab');
  button.addEventListener('click', () => go(key));
  document.getElementById('tabs').append(button);
  tabButtons.set(key, button);
}
function showTab() {
  for (const [key, button] of tabButtons) {
    button.classList.toggle('on', key === tab);
    button.setAttribute('aria-selected', String(key === tab));
  }
  tabSays.textContent = TABS.find((t) => t.key === tab).made;
}

// The page put on another tab (nothing built yet). The rock's size goes
// to the one that suits the tab, where that differs from the tab left
// (the land's bands are lower than the test slope): otherwise the
// settings are carried over as they are, so a stone set on its own tab is
// the stone of the cluster and of the cliff.
function toTab(next) {
  keepCamera();
  const was = sizeOn(tab, settings.kind);
  tab = next;
  if (sizeOn(tab, settings.kind) !== was) settings.size = sizeOn(tab, settings.kind);
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  showTab();
}

// To another tab: its rows, what it makes, and its own camera.
function go(next) {
  if (!TAB_KEYS.includes(next) || next === tab) return;
  toTab(next);
  fillPanel();
  buildAll();
  showCamera();
}
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

// --- Go ------------------------------------------------------------------------------

// (A link can open a tab: http://localhost:5211/#land.)
if (TAB_KEYS.includes(location.hash.slice(1))) tab = location.hash.slice(1);
settings.size = sizeOn(tab, settings.kind);
showTab();
fillPanel();
buildAll();
resize();
showCamera();

// A picture of the scene as it is, saved by the dev server as
// .scratch/stills/name.png (vite.config.js): for looking at the page when
// its window isn't on screen. Not in a built page.
async function still(name = 'still', width = 1200, height = 675) {
  if (!import.meta.env.DEV) return null;
  const was = renderer.getSize(new THREE.Vector2());
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const picture = await (await fetch(renderer.domElement.toDataURL('image/png'))).blob();
  renderer.setSize(was.x, was.y, false);
  resize();
  const saved = await fetch(`./__still?name=${encodeURIComponent(name)}`, { method: 'POST', body: picture });
  return saved.text();
}

// Settings set at once, and the tab with them if one is named (for trying
// things from the console): set({ tab: 'land', shows: 0.5 }).
function set(values = {}) {
  const { tab: next, ...rest } = values;
  const moved = TAB_KEYS.includes(next) && next !== tab;
  if (moved) toTab(next);
  Object.assign(settings, rest);
  fillPanel();
  buildAll();
  if (moved) showCamera();
}

// (For looking into the page from the console.)
window.rocklab = {
  settings, stats, look, aim, set, go, still, rowSpot, slopeSpot, bandSpot, rebuild: buildAll,
  get tab() { return tab; },
  // Where the camera is, and what it looks at.
  eye: () => ({ at: camera.position.toArray().map((v) => Number(v.toFixed(2))), target: controls.target.toArray().map((v) => Number(v.toFixed(2))) }),
  // The rows the panel shows now, folder by folder.
  panel: () => panelOf(tab, settings.kind).map((section) => ({
    title: section.title ?? '',
    rows: section.parts ? section.parts.map((part) => ({ title: part.title, rows: part.rows.map((r) => r.name) })) : section.rows.map((r) => r.name),
  })),
};
