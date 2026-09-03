// =========================================================================
//  room.js — a single element's own room (docs/rooms/NNN-name.html).
//  window.ROOM_ELEMENT is injected by the generated page. Everything else is
//  reused from ./lib/* — the same atoms, portals, free-flight controls, XR
//  rig, room shell and fact cards the main gallery room uses.
// =========================================================================
import * as THREE from 'three';

import { buildAtom, buildDoor, makeLabel, orbitAtom } from './lib/primitives.js';
import { catColor, catHex, catLabel, elementDetailHTML } from './lib/theme.js';
import { createFreeFlight } from './lib/controls.js';
import { setupXrButton, createVrRig } from './lib/xr.js';
import { buildRoomShell } from './lib/shell.js';
import { createCardSprite, paintElementCard, paintTextCard } from './lib/infocard.js';
import { clamp, easeInOutCubic } from './lib/util.js';

const el = window.ROOM_ELEMENT;

// ---------------------------------------------------------------------------
//  Room parameters (a small chamber, customised per element)
// ---------------------------------------------------------------------------
const W = 26, D = 22, H = 18;            // room extents
const ATOM_SCALE = 2.0;                  // how big the atom is in here
const ATOM_Y = 9.0;                      // atom centre height
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
scene.fog = new THREE.Fog(0x05060a, 18, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
camera.rotation.order = 'YXZ';
camera.position.set(0, 5.5, 9.5);
camera.lookAt(0, ATOM_Y - 1, 0);

scene.add(new THREE.AmbientLight(0x44506e, 0.9));
scene.add(new THREE.HemisphereLight(0x9fc2ff, 0x140f08, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(4, 14, 8);
scene.add(dir);
const accent = new THREE.PointLight(parseInt(CAT.slice(1), 16) || 0x3fe0ff, 900, 60);
accent.position.set(0, ATOM_Y, 5);
scene.add(accent);

// ---------------------------------------------------------------------------
//  Room shell + door + atom pedestal + holograms
// ---------------------------------------------------------------------------
scene.add(buildRoomShell({
  width: W, depth: D, height: H,
  grid: { size: D - 1, divisions: 10, color: 0x16203a, center: 0x0c1424 },
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

// pedestal under the atom
const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 3.2, 2.2, 48),
  new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.7, metalness: 0.3, emissive: catColor(el.cat), emissiveIntensity: 0.08 })
);
pedestal.position.set(0, 1.1, 0);
scene.add(pedestal);

// the giant Bohr atom
const atom = buildAtom(el);
atom.scale.setScalar(ATOM_SCALE);
atom.position.set(0, ATOM_Y, 0);
scene.add(atom);

// holographic fact cards floating around the atom
const factCard = createCardSprite({ width: 760, height: 300, scale: [4.9, 1.95, 1] });
paintElementCard(factCard, el);
factCard.position.set(3.2, ATOM_Y + 1.2, 3.0);
scene.add(factCard);

const extraCard = createCardSprite({ width: 560, height: 340, scale: [3.5, 2.1, 1] });
paintTextCard(extraCard, {
  title: `${el.s} — data`,
  titleColor: CAT,
  lines: [
    `mass               ${el.m != null ? el.m + ' u' : '—'}`,
    `shells             ${(el.sh || []).join('  ')}`,
    `config             ${el.esem || '—'}`,
    `phase              ${el.phase || '—'}`,
    `melt / boil        ${el.melt != null ? (el.melt - 273.15).toFixed(1) + '°C' : '—'} / ${el.boil != null ? (el.boil - 273.15).toFixed(1) + '°C' : '—'}`,
    `density            ${el.dens != null ? el.dens + ' g/cm³' : '—'}`,
  ],
});
extraCard.position.set(-4.6, ATOM_Y - 1.2, 2.4);
scene.add(extraCard);

// summary card (short lead paragraph)
if (el.sum) {
  const sumCard = createCardSprite({ width: 620, height: 300, scale: [4.0, 1.95, 1] });
  const lines = [];
  let cur = '';
  for (const word of el.sum.split(' ')) {
    if ((cur + ' ' + word).length > 54) { lines.push(cur.trim()); cur = word; }
    else cur += ' ' + word;
  }
  if (cur.trim()) lines.push(cur.trim());
  paintTextCard(sumCard, { title: `about ${el.name}`, titleColor: '#3fe0ff', lines });
  sumCard.position.set(1.2, ATOM_Y - 3.6, 0.6);
  scene.add(sumCard);
}

// the return door — walk through / click it to go back to the gallery
const door = buildDoor({
  text: 'PERIODIC TABLE ROOM',
  sub: '← return to the 118-element gallery',
  color: '#3fe0ff', scale: 2.0, opacity: 0.9,
});
door.position.set(0, 7.6, -D / 2 + 1.0);
scene.add(door);

// a small "room" name sign hanging over the door
const doorTag = makeLabel(`EXIT — HOME`, { color: '#5d6884', size: 26, scale: 0.008 });
doorTag.position.set(0, 12.4, -D / 2 + 0.8);
scene.add(doorTag);

// ---------------------------------------------------------------------------
//  Free flight + XR (shared)
// ---------------------------------------------------------------------------
const vrRig = createVrRig({
  renderer, scene,
  onSelect: (obj) => {
    if (isPartOf(obj, door)) { location.href = '../index.html'; return; }
    if (isPartOf(obj, atom)) focusAtom();
  },
});
const controls = createFreeFlight({
  renderer, camera,
  bounds: { xMin: -W / 2, xMax: W / 2, zMin: -D / 2, zMax: D / 2 },
  yMin: 1, yMax: H - 1,
  getControllers: () => vrRig.controllers,
});

// ---------------------------------------------------------------------------
//  Picking: atom (focus) vs door (return)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const pickTargets = () => [atom, door];

function partOf(group, obj) {
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
  const hits = raycaster.intersectObjects(pickTargets(), true);
  return hits.length ? hits[0].object : null;
}

function focusAtom() {
  const eye = new THREE.Vector3(0, ATOM_Y - 1.5, 6.2);
  const look = new THREE.Vector3(0, ATOM_Y, 0);
  tween = {
    from: camera.position.clone(), to: eye,
    fromLook: getLookAt(), toLook: look,
    t: 0, dur: 0.9,
  };
  showPanel();
}

function showPanel() {
  document.getElementById('panel-body').innerHTML =
    elementDetailHTML(el) +
    `<a class="room-link" href="../index.html">← Back to the Periodic Table Room</a>`;
  document.getElementById('panel').classList.remove('hidden');
}
function hidePanel() {
  document.getElementById('panel').classList.add('hidden');
}

renderer.domElement.addEventListener('click', (e) => {
  const hit = pick(e);
  if (hit && partOf(hit, door)) { location.href = '../index.html'; return; }
  if (hit && partOf(hit, atom)) { focusAtom(); return; }
  if (!controls.locked) controls.requestLock();
});

document.addEventListener('pointerlockchange', () => {
  hint.classList.toggle('faded', controls.locked);
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
  camera.position.set(0, 1.6, 7);
  camera.lookAt(0, ATOM_Y, 0);
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
  stepCamera(dt);
  vrRig.pick(pickTargets);
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
};
