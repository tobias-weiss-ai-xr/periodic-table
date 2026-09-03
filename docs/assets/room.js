// =========================================================================
//  room.js — a single element's own room (docs/rooms/NNN-name.html).
//  window.ROOM_ELEMENT is injected by the generated page. Everything else is
//  reused from ./lib/* — the same atoms, portals, free-flight controls, XR
//  rig, room shell and fact cards the main gallery room uses.
// =========================================================================
import * as THREE from 'three';

import { buildAtom, buildDoor, makeLabel, makeStarDust, orbitAtom } from './lib/primitives.js';
import { catColor, catHex, catLabel, elementDetailHTML } from './lib/theme.js';
import { createFreeFlight } from './lib/controls.js';
import { setupXrButton, createVrRig } from './lib/xr.js';
import { buildRoomShell } from './lib/shell.js';
import { createCardSprite, paintElementCard, paintTextCard } from './lib/infocard.js';
import { clamp, easeInOutCubic } from './lib/util.js';

const el = window.ROOM_ELEMENT;

// ---------------------------------------------------------------------------
//  Room parameters — a grand, airy chamber built around one monument
// ---------------------------------------------------------------------------
const W = 36, D = 30, H = 24;            // room extents (walls ±W/2, ±D/2, top H)
const ATOM_SCALE = 2.6;                  // how big the atom is in here
const ATOM_Y = 12;                       // atom centre height
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
scene.fog = new THREE.Fog(0x05060a, 26, 85);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
camera.position.set(0, 7, 13.5);
camera.lookAt(0, 10.5, 0);

scene.add(new THREE.AmbientLight(0x44506e, 0.9));
scene.add(new THREE.HemisphereLight(0x9fc2ff, 0x140f08, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(4, 14, 8);
scene.add(dir);
const accent = new THREE.PointLight(parseInt(CAT.slice(1), 16) || 0x3fe0ff, 1100, 70);
accent.position.set(0, ATOM_Y, 6);
scene.add(accent);
const rim = new THREE.PointLight(0x3fe0ff, 500, 80);
rim.position.set(-12, 21, -9);
scene.add(rim);

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

// ---------------------------------------------------------------------------
//  Art direction — watermark symbol, tiered pedestal, floor mandala, stardust
// ---------------------------------------------------------------------------

// monumental element symbol on the back wall, like gallery lettering
const watermark = makeLabel(el.s, { color: catHex(el.cat), size: 220, scale: 0.045 });
watermark.material.opacity = 0.13;
watermark.material.depthTest = true;    // let the atom float in front of it
watermark.position.set(0, 15.2, -D / 2 + 0.6);
scene.add(watermark);

// two-tier pedestal under the atom
const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x0a0f1c, roughness: 0.7, metalness: 0.3, emissive: catColor(el.cat), emissiveIntensity: 0.08,
});
const pedestalBase = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.0, 0.9, 64), pedestalMat);
pedestalBase.position.set(0, 0.45, 0);
scene.add(pedestalBase);
const pedestalTop = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 1.7, 64), pedestalMat);
pedestalTop.position.set(0, 1.75, 0);
scene.add(pedestalTop);

// floor mandala — concentric category-coloured rings radiating from the monument
[[6.8, 0.35], [9.2, 0.22], [11.6, 0.12]].forEach(([r, op], i) => {
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(r - 0.05, r + 0.05, 96),
    new THREE.MeshBasicMaterial({ color: catColor(el.cat), transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.03 + i * 0.004;
  scene.add(ringMesh);
});

// stardust — every element was forged in a star
const dust = makeStarDust({ count: 380, area: { x: W / 2 - 1.5, y: H - 3, z: D / 2 - 1.5 }, color: 0xaec6ff, size: 0.1, opacity: 0.5 });
scene.add(dust);

// the giant Bohr atom
const atom = buildAtom(el);
atom.scale.setScalar(ATOM_SCALE);
atom.position.set(0, ATOM_Y, 0);
scene.add(atom);

// holographic fact cards floating like satellites around the monument
const factCard = createCardSprite({ width: 760, height: 300, scale: [5.6, 2.2, 1] });
paintElementCard(factCard, el);
factCard.position.set(10, 14.2, 6);
scene.add(factCard);

const extraCard = createCardSprite({ width: 560, height: 340, scale: [4.1, 2.5, 1] });
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
extraCard.position.set(-10.2, 11.6, 4.5);
scene.add(extraCard);

// summary card (short lead paragraph)
if (el.sum) {
  const sumCard = createCardSprite({ width: 620, height: 300, scale: [4.7, 2.3, 1] });
  const lines = [];
  let cur = '';
  for (const word of el.sum.split(' ')) {
    if ((cur + ' ' + word).length > 54) { lines.push(cur.trim()); cur = word; }
    else cur += ' ' + word;
  }
  if (cur.trim()) lines.push(cur.trim());
  paintTextCard(sumCard, { title: `about ${el.name}`, titleColor: '#3fe0ff', lines });
  sumCard.position.set(3.6, 7.2, 11);
  scene.add(sumCard);
}

// the return door — walk through / click it to go back to the gallery.
// Offset to the left so the atom monument never stands in its way.
const door = buildDoor({
  text: 'PERIODIC TABLE ROOM',
  sub: '← return to the 118-element gallery',
  color: '#3fe0ff', scale: 2.2, opacity: 0.9,
});
door.position.set(-9.5, 7.2, -D / 2 + 1.4);
scene.add(door);
// only the door's ring/disc are click targets — its glow + labels must not
// intercept rays aimed past it
door.traverse((o) => { if (o.isSprite) o.raycast = () => {}; });

// a small sign hanging over the door
const doorTag = makeLabel(`EXIT — GALLERY`, { color: '#5d6884', size: 26, scale: 0.008 });
doorTag.position.set(-9.5, 11.3, -D / 2 + 1.6);
scene.add(doorTag);

// ---------------------------------------------------------------------------
//  Free flight + XR (shared)
// ---------------------------------------------------------------------------
const vrRig = createVrRig({
  renderer, scene,
  onSelect: (obj) => {
    if (partOf(obj, door)) { location.href = '../index.html'; return; }
    if (partOf(obj, atom)) focusAtom();
  },
});
const controls = createFreeFlight({
  renderer, camera,
  bounds: { xMin: -W / 2 + 1, xMax: W / 2 - 1, zMin: -D / 2 + 1, zMax: D / 2 - 1 },
  yMin: 1, yMax: H - 1,
  getControllers: () => vrRig.controllers,
});

// ---------------------------------------------------------------------------
//  Picking: atom (focus) vs door (return)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const pickTargets = () => [atom, door];

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
  // the return door wins over the atom hologram that may float in front of it
  const doorHits = raycaster.intersectObject(door, true);
  if (doorHits.length) return doorHits[0].object;
  const atomHits = raycaster.intersectObject(atom, true);
  return atomHits.length ? atomHits[0].object : null;
}

function focusAtom() {
  const eye = new THREE.Vector3(0, ATOM_Y - 1.5, 12);
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
  camera.position.set(0, 1.6, 11);
  camera.lookAt(0, 9.5, 0);
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
  dust.rotation.y += dt * 0.012;
  stepCamera(dt);
  vrRig.pick(pickTargets, () => [door]);
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
  projectDoor: () => {
    const v = door.position.clone().project(camera);
    if (v.z > 1) return null;
    return {
      x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
      y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    };
  },
  roomSize: () => ({ w: W, d: D, h: H }),
};
