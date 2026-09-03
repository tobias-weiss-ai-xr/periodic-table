// =========================================================================
//  room.js — a single element's own LEARNING LAB (docs/rooms/NNN-name.html).
//  window.ROOM_ELEMENT is injected by the generated page.
//
//  Learning design (why it looks like this):
//   - Segmenting principle (Mayer): five numbered, learner-paced stations
//     instead of one wall of text. Click a station disc to glide there.
//   - Multimedia + dual coding: each room shows an honest 3D model of the
//     element's real crystal/molecular structure next to its caption.
//   - Spatial contiguity: every explanation floats beside what it explains.
//   - Signalling: consistent station colours across all 118 rooms.
//   - Retrieval practice (testing effect): an interactive quiz with
//     immediate feedback, generated from the element data itself.
//   - Coherence: short lines only — the panel holds the details.
// =========================================================================
import * as THREE from 'three';

import { buildAtom, buildDoor, buildLattice, makeLabel, makeStarDust, orbitAtom } from './lib/primitives.js';
import { catColor, catHex, catLabel, elementDetailHTML } from './lib/theme.js';
import { createFreeFlight } from './lib/controls.js';
import { setupXrButton, createVrRig } from './lib/xr.js';
import { buildRoomShell } from './lib/shell.js';
import { createCardSprite, paintElementCard, paintTextCard } from './lib/infocard.js';
import { buildQuizPanel, makeStation, paintAnswer, paintQuestion, paintVerdict } from './lib/learn.js';
import { clamp, easeInOutCubic } from './lib/util.js';

const el = window.ROOM_ELEMENT;

// ---------------------------------------------------------------------------
//  Room parameters — a grand airy hall: monument in the middle, five
//  learning stations on a circle around it.
// ---------------------------------------------------------------------------
const W = 54, D = 46, H = 30;            // room extents (walls ±W/2, ±D/2, top H)
const ATOM_SCALE = 3.0;                  // how big the atom is in here
const ATOM_Y = 12.5;                     // atom centre height
const STATION_R = 18;                    // learning-station ring radius
const CAT = catHex(el.cat);

// ---------------------------------------------------------------------------
//  Scene, camera, renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById('room');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 36, 115);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 240);
camera.rotation.order = 'YXZ';
camera.position.set(0, 9, 21);
camera.lookAt(0, 10.5, 0);

scene.add(new THREE.AmbientLight(0x44506e, 0.9));
scene.add(new THREE.HemisphereLight(0x9fc2ff, 0x140f08, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(4, 14, 8);
scene.add(dir);
const accent = new THREE.PointLight(parseInt(CAT.slice(1), 16) || 0x3fe0ff, 1500, 80);
accent.position.set(0, ATOM_Y, 6);
scene.add(accent);
const rim = new THREE.PointLight(0x3fe0ff, 600, 90);
rim.position.set(-14, 23, -11);
scene.add(rim);

// ---------------------------------------------------------------------------
//  Room shell + monumental backdrop
// ---------------------------------------------------------------------------
scene.add(buildRoomShell({
  width: W, depth: D, height: H,
  grid: { size: D - 1, divisions: 12, color: 0x16203a, center: 0x0c1424 },
  walls: [
    [-W / 2, H / 2, 0, Math.PI / 2, D, H],          // left
    [W / 2, H / 2, 0, Math.PI / 2, D, H],           // right
    [0, H / 2, -D / 2, 0, W, H],                    // back
    [0, H / 2, D / 2, 0, W, H],                     // front
  ],
  ceiling: [0, H, 0, Math.PI / 2, W, D],
  labels: [
    { text: `${el.name}`, sub: `atomic number ${el.n} · ${catLabel(el.cat)} · ${el.s}`,
      color: '#dfe8ff', size: 56, scale: 0.009, position: [0, H - 3.4, -D / 2 + 0.6] },
  ],
}));

// monumental element symbol on the back wall, like gallery lettering
const watermark = makeLabel(el.s, { color: catHex(el.cat), size: 220, scale: 0.045 });
watermark.material.opacity = 0.13;
watermark.material.depthTest = true;
watermark.position.set(0, 19.5, -D / 2 + 0.6);
scene.add(watermark);

// two-tier pedestal under the atom
const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x0a0f1c, roughness: 0.7, metalness: 0.3, emissive: catColor(el.cat), emissiveIntensity: 0.08,
});
const pedestalBase = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.8, 1.0, 64), pedestalMat);
pedestalBase.position.set(0, 0.5, 0);
scene.add(pedestalBase);
const pedestalTop = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.4, 1.9, 64), pedestalMat);
pedestalTop.position.set(0, 1.95, 0);
scene.add(pedestalTop);

// floor mandala — concentric category-coloured rings radiating from the monument
[[9, 0.35], [12.5, 0.22], [16, 0.12]].forEach(([r, op], i) => {
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.05, r + 0.05, 96),
    new THREE.MeshBasicMaterial({ color: catColor(el.cat), transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.03 + i * 0.004;
  scene.add(ringMesh);
});

// guide ring linking the five stations (wayfinding without signage clutter)
const guide = new THREE.Mesh(
  new THREE.TorusGeometry(STATION_R, 0.02, 6, 128),
  new THREE.MeshBasicMaterial({ color: 0x44507a, transparent: true, opacity: 0.35 })
);
guide.rotation.x = Math.PI / 2;
guide.position.y = 0.015;
scene.add(guide);

// stardust — every element was forged in a star
const dust = makeStarDust({ count: 520, area: { x: W / 2 - 1.5, y: H - 3, z: D / 2 - 1.5 }, color: 0xaec6ff, size: 0.1, opacity: 0.5 });
scene.add(dust);

// the giant Bohr atom
const atom = buildAtom(el);
atom.scale.setScalar(ATOM_SCALE);
atom.position.set(0, ATOM_Y, 0);
scene.add(atom);

// ---------------------------------------------------------------------------
//  Overview cards (pre-training / advance organiser): facts + summary
// ---------------------------------------------------------------------------
const factCard = createCardSprite({ width: 760, height: 300, scale: [5.6, 2.2, 1] });
paintElementCard(factCard, el);
factCard.position.set(14, 18.5, 4);
scene.add(factCard);

function wrap(text, n) {
  const lines = [];
  let cur = '';
  for (const word of String(text).split(' ')) {
    if ((cur + ' ' + word).length > n) { lines.push(cur.trim()); cur = word; }
    else cur += ' ' + word;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

let sumCard = null;
if (el.sum) {
  sumCard = createCardSprite({ width: 620, height: 300, scale: [4.7, 2.3, 1] });
  paintTextCard(sumCard, { title: `about ${el.name}`, titleColor: '#3fe0ff', lines: wrap(el.sum, 54) });
  sumCard.position.set(20, 13, -2);
  scene.add(sumCard);
}

// ---------------------------------------------------------------------------
//  The five learning stations (segmenting principle: learner-paced tour)
// ---------------------------------------------------------------------------
const STATION_DEFS = [
  { key: 'model',      title: 'CRYSTAL & MOLECULE',      color: '#3fe0ff', angle: 210 },
  { key: 'uses',       title: 'WHERE YOU MEET IT',       color: '#ffcf5c', angle: 330 },
  { key: 'history',    title: 'WHO FOUND IT',            color: '#b18cff', angle: 150 },
  { key: 'experiment', title: 'THE CLASSIC EXPERIMENT',  color: '#5cff9d', angle: 30 },
  { key: 'quiz',       title: 'TEST YOURSELF',           color: '#ff5c8a', angle: 180 },
];

const stations = [];
const stationExtras = [];   // content sprites/meshes that belong to a station
const quizPanel = buildQuizPanel({ color: '#ff5c8a', position: [0, 8, 0] });

STATION_DEFS.forEach((def, i) => {
  const rad = (def.angle * Math.PI) / 180;
  const pos = [Math.sin(rad) * STATION_R, 0, Math.cos(rad) * STATION_R];
  const st = makeStation(i + 1, { color: def.color, position: pos, title: def.title });
  st.disc.userData.stationIdx = i;
  scene.add(st.g);
  const entry = { ...def, pos, disc: st.disc, g: st.g };

  if (def.key === 'model') {
    // a raised stand carrying the real lattice / molecular model
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 3.4, 32), pedestalMat);
    stand.position.set(pos[0], 1.7, pos[2]);
    stand.userData.stationIdx = i;
    stationExtras.push(stand);
    scene.add(stand);
    const lattice = buildLattice({ type: el.mo.t, color: '#' + el.c, extent: 2.6, radius: 0.3 });
    lattice.position.set(pos[0], 5.6, pos[2]);
    lattice.userData.stationIdx = i;
    stationExtras.push(lattice);
    scene.add(lattice);
    entry.model = lattice;
    const capCard = createCardSprite({ width: 640, height: 200, scale: [4.8, 1.5, 1] });
    paintTextCard(capCard, { title: `how ${el.s} arranges`, titleColor: def.color, lines: [el.mo.c] });
    capCard.position.set(pos[0], 9.0, pos[2]);
    capCard.userData.stationIdx = i;
    stationExtras.push(capCard);
    scene.add(capCard);
  } else if (def.key === 'quiz') {
    quizPanel.g.position.set(pos[0], 8, pos[2]);
    scene.add(quizPanel.g);
  } else {
    // slim glowing column + content card
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.38, 6.9, 16),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.7, metalness: 0.3, emissive: new THREE.Color(def.color), emissiveIntensity: 0.25 })
    );
    col.position.set(pos[0], 3.45, pos[2]);
    col.userData.stationIdx = i;
    stationExtras.push(col);
    scene.add(col);
    const card = createCardSprite({ width: 700, height: 380, scale: [5.2, 2.8, 1] });
    let lines;
    if (def.key === 'uses') lines = el.u.map((u) => `-  ${u}`);
    else if (def.key === 'history') lines = wrap(el.pn, 46);
    else lines = wrap(el.xp, 46);
    paintTextCard(card, { title: def.title, titleColor: def.color, lines });
    card.position.set(pos[0], 8.6, pos[2]);
    card.userData.stationIdx = i;
    stationExtras.push(card);
    scene.add(card);
  }
  stations.push(entry);
});

// ---------------------------------------------------------------------------
//  Quiz — retrieval practice with immediate feedback, generated from data
// ---------------------------------------------------------------------------
const CAT_POOL = ['alkali metal', 'noble gas', 'transition metal', 'halogen', 'alkaline earth metal', 'metalloid', 'diatomic nonmetal', 'post-transition metal'];
const rotate = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);
const CORRECT = (arr) => arr.indexOf(true);

function buildQuestions() {
  const n = el.n;
  const shells = el.sh.length;
  const phase = (el.phase || 'Solid').toLowerCase();
  const phaseOpts = ['solid', 'liquid', 'gas'];
  const myCat = catLabel(el.cat);
  const others = CAT_POOL.filter((c) => c !== el.cat).slice(0, 2).map(catLabel);
  const catOpts = [myCat, ...others];
  const numOpts = [String(n), String(n + 1), String(n > 2 ? n - 2 : n + 5)];
  const shOpts = [String(shells), String(shells + 1), String(shells > 1 ? shells - 1 : shells + 2)];
  return [
    { q: `What is the atomic number of ${el.name}?`, opts: numOpts, correct: 0 },
    { q: `Which family does ${el.name} (${el.s}) belong to?`, opts: catOpts, correct: 0 },
    { q: `How many electron shells does a neutral ${el.name} atom have?`, opts: shOpts, correct: 0 },
    { q: `At room temperature, ${el.name} is a ...`, opts: phaseOpts, correct: phaseOpts.indexOf(phase) >= 0 ? phaseOpts.indexOf(phase) : 0 },
  ].map((question, qIdx) => {
    // deterministic shuffle so the correct answer is not always option A
    const flags = question.opts.map((_, k) => k === question.correct);
    const order = rotate(flags, (el.n + qIdx) % 3);
    return { q: question.q, opts: question.opts, correct: CORRECT(order) };
  });
}
const questions = buildQuestions();
const quizState = { i: 0, score: 0, answered: false, finished: false };

function showQuestion() {
  const question = questions[quizState.i];
  quizState.answered = false;
  paintQuestion(quizPanel, question.q);
  question.opts.forEach((opt, k) => paintAnswer(quizPanel, k, opt, 'idle'));
  paintVerdict(quizPanel, '');
  quizPanel.nextBox.visible = false;
  quizPanel.nextLabel.visible = false;
}

function quizPick(idx) {
  if (quizState.answered || quizState.finished) return;
  const question = questions[quizState.i];
  quizState.answered = true;
  const ok = idx === question.correct;
  if (ok) quizState.score++;
  question.opts.forEach((opt, k) => paintAnswer(quizPanel, k, opt,
    k === question.correct ? 'correct' : (k === idx ? 'wrong' : 'idle')));
  paintVerdict(quizPanel, ok ? `Correct!  ${quizState.score} / ${questions.length} so far` : `Not quite — the answer is ${question.opts[question.correct]}`);
  quizPanel.nextBox.visible = true;
  quizPanel.nextLabel.visible = true;
}

function quizNext() {
  if (!quizState.answered && !quizState.finished) return;
  if (quizState.i + 1 < questions.length) {
    quizState.i++;
    showQuestion();
  } else if (!quizState.finished) {
    quizState.finished = true;
    paintQuestion(quizPanel, `Quiz complete: ${quizState.score} / ${questions.length}!`);
    ['done', '', ''].forEach((t, k) => paintAnswer(quizPanel, k, t || '-', 'idle'));
    paintVerdict(quizPanel, quizState.score === questions.length ? 'Flawless. You know your element.' : 'Walk the stations once more and retry.');
    quizPanel.nextBox.visible = true;
    quizPanel.nextLabel.visible = true;
  } else {
    quizState.i = 0;
    quizState.score = 0;
    quizState.finished = false;
    showQuestion();
  }
}
showQuestion();

// ---------------------------------------------------------------------------
//  The return door — walk through / click it to go back to the gallery
// ---------------------------------------------------------------------------
const door = buildDoor({
  text: 'PERIODIC TABLE ROOM',
  sub: '<- return to the 118-element gallery',
  color: '#3fe0ff', scale: 2.2, opacity: 0.9,
});
door.position.set(-17, 7.4, -D / 2 + 1.4);
scene.add(door);
door.traverse((o) => { if (o.isSprite) o.raycast = () => {}; });

const doorTag = makeLabel(`EXIT - GALLERY`, { color: '#5d6884', size: 26, scale: 0.008 });
doorTag.position.set(-17, 11.6, -D / 2 + 1.6);
scene.add(doorTag);

// ---------------------------------------------------------------------------
//  Free flight + XR (shared)
// ---------------------------------------------------------------------------
const vrRig = createVrRig({
  renderer, scene,
  onSelect: (obj) => { routePick(obj); },
});
const controls = createFreeFlight({
  renderer, camera,
  bounds: { xMin: -W / 2 + 1, xMax: W / 2 - 1, zMin: -D / 2 + 1, zMax: D / 2 - 1 },
  yMin: 1, yMax: H - 1,
  getControllers: () => vrRig.controllers,
});

// ---------------------------------------------------------------------------
//  Picking: stations > door > quiz > atom (door wins over the monument)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const pickTargets = () => [atom, door, ...stations.map((s) => s.disc), ...stationExtras, ...quizPanel.boxes, quizPanel.nextBox];
const priorityTargets = () => [...stationExtras, quizPanel.nextBox, ...quizPanel.boxes, ...stations.map((s) => s.disc), door];

function partOf(obj, group) {
  let p = obj;
  while (p && p !== group) p = p.parent;
  return p === group;
}

function pick(e) {
  if (controls.locked || renderer.xr.isPresenting) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  // station content wins, then the exit door, then the rest — so a click on
  // a station card never "falls through" to the door behind it
  const extras = raycaster.intersectObjects(stationExtras, true);
  if (extras.length) return extras[0].object;
  const doorHits = raycaster.intersectObject(door, true);
  if (doorHits.length) return doorHits[0].object;
  const hits = raycaster.intersectObjects(pickTargets(), true);
  return hits.length ? hits[0].object : null;
}

function routePick(hit) {
  if (!hit) { if (!controls.locked && !renderer.xr.isPresenting) controls.requestLock(); return; }
  if (hit.userData.quizAnswer != null) { quizPick(hit.userData.quizAnswer); return; }
  if (hit.userData.quizNext) { quizNext(); return; }
  // station discs and station content (lattice children too): climb to the
  // tagged ancestor, then glide to that station
  for (let p = hit; p; p = p.parent) {
    if (p.userData.isStation || p.userData.stationIdx != null) {
      focusStation(p.userData.stationIdx);
      return;
    }
  }
  if (partOf(hit, door)) { location.href = '../index.html'; return; }
  if (partOf(hit, atom)) { focusAtom(); return; }
}

function focusAtom() {
  tweenTo(
    new THREE.Vector3(0, ATOM_Y - 1.5, 13),
    new THREE.Vector3(0, ATOM_Y, 0)
  );
  showPanel();
}

function focusStation(i) {
  const st = stations[i];
  if (!st) return;
  const outward = new THREE.Vector3(st.pos[0], 0, st.pos[2]).normalize();
  const eye = new THREE.Vector3(st.pos[0], 8, st.pos[2]).add(outward.multiplyScalar(8.5));
  tweenTo(eye, new THREE.Vector3(st.pos[0], 8, st.pos[2]));
}

function showPanel() {
  document.getElementById('panel-body').innerHTML =
    elementDetailHTML(el) +
    `<a class="room-link" href="../index.html">&larr; Back to the Periodic Table Room</a>`;
  document.getElementById('panel').classList.remove('hidden');
}
function hidePanel() {
  document.getElementById('panel').classList.add('hidden');
}

renderer.domElement.addEventListener('click', (e) => {
  routePick(pick(e));
});

// ---------------------------------------------------------------------------
//  XR session
// ---------------------------------------------------------------------------
const xrBtn = document.getElementById('xr');
const xrHint = document.getElementById('xr-hint');
const hint = document.getElementById('hint');

function onSessionStart() {
  xrBtn.textContent = 'Exit XR';
  xrBtn.disabled = false;
  xrHint.classList.remove('hidden');
  hint.classList.add('hidden');
  camera.position.set(0, 1.6, 15);
  camera.lookAt(0, 10, 0);
}
function onSessionEnd() {
  xrBtn.textContent = 'Enter XR';
  xrHint.classList.add('hidden');
  hint.classList.remove('hidden');
}
setupXrButton({ renderer, btn: xrBtn, onSessionStart, onSessionEnd });

// ---------------------------------------------------------------------------
//  Animation loop
// ---------------------------------------------------------------------------
const fpsEl = document.getElementById('fps');
const loadingEl = document.getElementById('loading');
const clock = new THREE.Clock();
let tween = null;   // camera glide
let frames = 0, fpsClock = performance.now();
const _lookTarget = new THREE.Vector3(0, ATOM_Y, 0);
const _tmpDir = new THREE.Vector3();

function getLookAt() { return _lookTarget; }

function tweenTo(eye, look, dur = 0.9) {
  tween = {
    from: camera.position.clone(), to: eye,
    fromLook: getLookAt().clone(), toLook: look,
    t: 0, dur,
  };
}

function stepCamera(dt) {
  if (tween) {
    tween.t += dt / tween.dur;
    const s = easeInOutCubic(clamp(tween.t, 0, 1));
    camera.position.lerpVectors(tween.from, tween.to, s);
    _lookTarget.lerpVectors(tween.fromLook, tween.toLook, s);
    camera.lookAt(_lookTarget);
    if (tween.t >= 1) tween = null;
    return;
  }
  controls.step(dt, renderer.xr.isPresenting);
  camera.getWorldDirection(_tmpDir);
  _lookTarget.copy(camera.position).add(_tmpDir.multiplyScalar(20));
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  orbitAtom(atom, dt);
  dust.rotation.y += dt * 0.012;
  if (quizPanel.g.children[0]) quizPanel.g.rotation.y = Math.sin(performance.now() * 0.0003) * 0.06;
  stepCamera(dt);
  vrRig.pick(pickTargets, priorityTargets);
  if (renderer.xr.isPresenting) hint.classList.add('hidden');

  frames++;
  const now = performance.now();
  if (now - fpsClock > 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsClock))} fps`;
    frames = 0; fpsClock = now;
  }
  renderer.render(scene, camera);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

document.getElementById('panel-close').addEventListener('click', hidePanel);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !controls.locked) hidePanel(); });
window.addEventListener('blur', () => controls.keys.clear());

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
loadingEl.classList.add('hidden');
setTimeout(() => loadingEl.remove(), 900);
renderer.setAnimationLoop(animate);
resize();

// hooks for headless verification
window.RPRoom = {
  element: { n: el.n, s: el.s, name: el.name },
  cat: el.cat,
  shellsDrawn: () => atom.children.length,
  camPos: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  cameraIdle: () => !tween && !controls.locked,
  doorPresent: () => !!door,
  backAnchor: () => document.getElementById('back')?.getAttribute('href') || null,
  focusAtom: () => { focusAtom(); },
  focusStation: (i) => { focusStation(i); },
  projectDoor: () => {
    const v = door.position.clone().project(camera);
    if (v.z > 1) return null;
    return {
      x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
      y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    };
  },
  roomSize: () => ({ w: W, d: D, h: H }),
  // coarse 3D AABB overlap test across all wall/floating content — keeps the
  // "cards colliding" bug (e.g. about-Indium vs experiment card) from returning
  overlaps: () => {
    const boxes = [
      { id: 'factCard', p: factCard.position, hw: 2.8, hh: 1.15 },
      ...(sumCard ? [{ id: 'sumCard', p: sumCard.position, hw: 2.4, hh: 1.2 }] : []),
      { id: 'door', p: door.position, hw: 2.6, hh: 3.6 },
      { id: 'watermark', p: watermark.position, hw: 5.5, hh: 5.5 },
    ];
    stations.forEach((st, i) => {
      if (st.key === 'quiz') boxes.push({ id: 'quizPanel', p: quizPanel.g.position, hw: 5.2, hh: 4.6 });
      else if (st.key === 'model') boxes.push({ id: 'modelCard', p: new THREE.Vector3(st.pos[0], 9.0, st.pos[2]), hw: 2.4, hh: 0.8 });
      else boxes.push({ id: `card-${st.key}`, p: new THREE.Vector3(st.pos[0], 8.6, st.pos[2]), hw: 2.6, hh: 1.45 });
    });
    const bad = [];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a], B = boxes[b];
        if (Math.abs(A.p.x - B.p.x) < A.hw + B.hw
          && Math.abs(A.p.y - B.p.y) < A.hh + B.hh
          && Math.abs(A.p.z - B.p.z) < A.hw + B.hw) {
          bad.push([A.id, B.id]);
        }
      }
    }
    return bad;
  },
  stations: () => stations.length,
  stationInfo: () => stations.map((s) => ({ key: s.key, color: s.color })),
  model: () => ({ type: el.mo.t, caption: el.mo.c }),
  quizState: () => ({
    i: quizState.i, score: quizState.score, answered: quizState.answered,
    finished: quizState.finished, total: questions.length,
    correctIdx: questions[quizState.i].correct,
  }),
  quizPick: (i) => { quizPick(i); },
  quizNext: () => { quizNext(); },
};
