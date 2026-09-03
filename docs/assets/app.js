// =========================================================================
//  The Periodic Table Room — walkable 3D gallery of all 118 elements
//  (three.js r160 + WebXR). Room shows the extended periodic table as a wall
//  of atoms; each element links to its own room (docs/rooms/NNN-name.html).
//
//  All reusable building blocks live in ./lib/*:
//    theme.js      — category palette, labels, number/temperature formatting
//    primitives.js — text sprites, glows, shared geometry, buildAtom, buildDoor
//    controls.js   — free-flight movement (keyboard + pointer lock + VR)
//    xr.js         — WebXR button lifecycle + controller ray rig
//    shell.js      — parameterised room shell (floor/grid/walls/titles)
//    infocard.js   — canvas-painted holographic fact cards
// =========================================================================

import * as THREE from 'three';
import { buildAtom, buildDoor, geo, makeGlow, makeLabel, orbitAtom } from './lib/primitives.js';
import { catColor, catHex, elementDetailHTML } from './lib/theme.js';
import { createFreeFlight } from './lib/controls.js';
import { setupXrButton, createVrRig } from './lib/xr.js';
import { buildRoomShell } from './lib/shell.js';
import { createCardSprite, paintElementCard } from './lib/infocard.js';
import { clamp, easeInOutCubic, pad } from './lib/util.js';

const ELEMENTS = window.ELEMENTS;                       // 118 elements (data.js)

// ---------------------------------------------------------------------------
//  Tuning constants
// ---------------------------------------------------------------------------
const COL_W = 3.4, ROW_H = 3.2;     // element card spacing (roomier wall)
const WALL_Z = -18;                  // wall plane
const WALL_CY = 13;                  // wall centre height
const EYE = 1.6;                     // headset/standing eye height (VR)
const ROOM_MIN = { x: -37, z: -17 }; // flyable bounds
const ROOM_MAX = { x: 37, z: 23 };
const ELECTRON_CAP = 14;             // max electrons drawn per shell

// ---------------------------------------------------------------------------
//  Element node — a display case on the wall (+ its portable room door)
// ---------------------------------------------------------------------------
function buildNode(el) {
  const g = new THREE.Group();
  const col = catColor(el.cat);
  const x = (el.x - 9.5) * COL_W;
  const y = (5 - el.row) * ROW_H + WALL_CY;
  g.position.set(x, y, WALL_Z);

  // frosted glass tile (the "display case")
  const tile = new THREE.Mesh(geo.tile, new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
  }));
  tile.position.z = -0.04;
  g.add(tile);

  // soft halo behind the atom
  const halo = makeGlow(catHex(el.cat), 2.4);
  halo.position.z = -0.12;
  halo.material.opacity = 0.5;
  g.add(halo);

  // the atom itself
  const atom = buildAtom(el, { electronCap: ELECTRON_CAP });
  g.add(atom);

  // symbol above, number below
  const sym = makeLabel(el.s, { color: catHex(el.cat), size: 64, scale: 0.008 });
  sym.position.set(0, 1.75, 0);
  g.add(sym);
  const num = makeLabel(String(el.n), { color: '#6f7891', size: 34, scale: 0.007 });
  num.position.set(0, -1.6, 0);
  g.add(num);

  // selection ring (Torus flattened into the wall plane)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.02, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffcf5c, transparent: true, opacity: 0 })
  );
  ring.position.z = 0.01;
  ring.userData.base = 1.25;
  g.add(ring);

  // floor beacon under this column (anchors it in the room)
  const beacon = new THREE.Mesh(geo.disc, new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.16, depthWrite: false,
  }));
  beacon.rotation.x = -Math.PI / 2;
  beacon.position.set(x, 0.03, WALL_Z);
  beacon.scale.set(1.15, 1.15, 1);

  // the portable "room door" — one per element, hidden until selected.
  // Clicking it (or its panel link) teleports to that element's own room.
  const portal = buildDoor({
    text: `${el.s}'s room`, sub: 'ENTER →',
    color: catHex(el.cat), scale: 0.55, opacity: 0.85,
  });
  // pulled 25% toward the room's centre axis so right/left-edge elements'
  // doors never end up underneath the detail panel overlay — still clearly
  // floating above "their" element
  portal.position.set(x * 0.75, y + 2.35, WALL_Z + 5.2);
  portal.visible = false;
  scene.add(portal);

  const state = {
    el, g: null,
    atom, halo, sym, num, ring, tile, portal,
    hovered: false,
    portalHovered: false,
    selected: false,
    matched: true,
    dimmed: false,
    baseX: x, baseY: y,
  };

  return { g, beacon, portal, state };
}

/** Relative URL of an element's room, from the main page (docs/index.html). */
export function roomHref(el) {
  return `rooms/${pad(el.n)}-${el.name.toLowerCase()}.html`;
}

// ---------------------------------------------------------------------------
//  Detail panel
// ---------------------------------------------------------------------------
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const panelClose = document.getElementById('panel-close');

function showDetail(node) {
  const el = node.el;
  panelBody.innerHTML =
    elementDetailHTML(el) +
    `<a class="room-link" href="${roomHref(el)}">Enter ${el.name}'s room →</a>`;
  panel.classList.remove('hidden');
}
function hideDetail() {
  panel.classList.add('hidden');
  hideInfoCard();
  if (currentNode) {
    setSelected(currentNode, false);
    currentNode = null;
    refreshVisual();
  }
}

// ---------------------------------------------------------------------------
//  In-world holographic info card (readable inside a VR headset)
// ---------------------------------------------------------------------------
let infoCard = null;

function buildInfoCard() {
  return createCardSprite({ width: 760, height: 300, scale: [4.6, 1.82, 1] });
}
function paintInfoCard(node) {
  paintElementCard(infoCard, node.el);
  infoCard.position.set(node.baseX, node.baseY, WALL_Z + 4.6);
  infoCard.visible = true;
}
function hideInfoCard() { if (infoCard) infoCard.visible = false; }

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
scene.fog = new THREE.Fog(0x05060a, 30, 110);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
camera.position.set(0, 13, 17);       // designer's hero view of the wall
camera.lookAt(0, 13, WALL_Z);

scene.add(new THREE.AmbientLight(0x44506e, 0.9));
scene.add(new THREE.HemisphereLight(0x9fc2ff, 0x140f08, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(6, 26, 12);
scene.add(dir);
const cyan = new THREE.PointLight(0x3fe0ff, 1600, 160);
cyan.position.set(-14, 20, -6);
scene.add(cyan);
const gold = new THREE.PointLight(0xffcf5c, 1100, 160);
gold.position.set(16, 18, -4);
scene.add(gold);

// ---------------------------------------------------------------------------
//  Room shell (shared builder) + the table grid lines behind the wall
// ---------------------------------------------------------------------------
scene.add(buildRoomShell({
  width: 120, depth: 90, height: 30,
  grid: { size: 90, divisions: 30, color: 0x16203a, center: 0x0c1424 },
  walls: [
    [-38, 0, 0, Math.PI / 2, 3, 34],          // left
    [38, 0, 0, Math.PI / 2, 3, 34],           // right
    [0, 13, -20, 0, 80, 30],                  // back (behind the table)
    [0, 13, 24, 0, 80, 30],                   // entrance wall (room title)
  ],
  ceiling: [0, 30, 0, Math.PI / 2, 80, 43],
  labels: [
    { text: 'THE PERIODIC TABLE ROOM', color: '#dfe8ff', size: 54, scale: 0.009, position: [0, 24.5, 22.6] },
    { text: `${ELEMENTS.length} elements · atom models · WebXR · fly freely`, color: '#5d6884', size: 30, scale: 0.008, position: [0, 22.3, 22.6] },
  ],
}));

// wall grid lines behind the periodic table
{
  const pts = [];
  for (let c = 1; c <= 18; c++) {
    const x = (c - 9.5) * COL_W;
    pts.push(new THREE.Vector3(x, -2, -19.4), new THREE.Vector3(x, 29, -19.4));
  }
  for (let r = 0; r <= 10; r++) {
    const y = (5 - r) * ROW_H + WALL_CY;
    pts.push(new THREE.Vector3(-9.5 * COL_W - 1, y, -19.4), new THREE.Vector3(9.5 * COL_W + 1, y, -19.4));
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x182742, transparent: true, opacity: 0.5 })
  );
  scene.add(lines);
}

// ---------------------------------------------------------------------------
//  Element nodes
// ---------------------------------------------------------------------------
const nodes = [];
const elementNodes = new Map();
const elementNodeList = [];
ELEMENTS.forEach((el) => {
  const { g, beacon, state } = buildNode(el);
  state.g = g;
  scene.add(g);
  scene.add(beacon);
  nodes.push(state);
  elementNodes.set(el.n, state);
  elementNodeList.push(state);
});

// ---------------------------------------------------------------------------
//  Movement + XR rig (shared)
// ---------------------------------------------------------------------------
const vrRig = createVrRig({
  renderer, scene,
  onSelect: (obj) => {
    const t = classify(obj);
    if (!t) return;
    if (t.portal) { enterRoom(t.node.el); return; }
    focusElement(t.node);
  },
});
const controls = createFreeFlight({
  renderer, camera,
  bounds: { xMin: ROOM_MIN.x, xMax: ROOM_MAX.x, zMin: ROOM_MIN.z, zMax: ROOM_MAX.z },
  yMin: 1, yMax: 29,
  getControllers: () => vrRig.controllers,
});

let tween = null; // {from,to,fromLook,toLook,t,dur}
let currentNode = null;   // selected
let hoverTarget = null;   // { node, portal } of the current hover

function setSelected(node, on) {
  if (!node) return;
  node.selected = on;
  node.ring.material.opacity = on ? 0.9 : 0;
  node.ring.scale.setScalar(on ? 1.25 : 1);
  node.halo.material.opacity = on ? 0.95 : 0.5;
  node.atom.scale.setScalar(on ? 1.55 : 1);
  node.sym.material.opacity = on ? 1 : 0.95;
}
function refreshVisual() {
  nodes.forEach((n) => {
    const on = n === currentNode;
    const hov = (n.hovered || n.portalHovered) && !on;
    if (currentNode !== n) n.halo.material.opacity = hov ? 0.8 : (n.dimmed ? 0.16 : 0.5);
    n.sym.material.opacity = on ? 1 : hov ? 1 : 0.92;
    n.tile.material.opacity = on ? 0.16 : hov ? 0.12 : 0.07;
    if (n.portal) {
      const show = n === currentNode && n.g.visible;
      if (n.portal.visible !== show) n.portal.visible = show;
    }
  });
}

function focusElement(node) {
  setSelected(currentNode, false);
  currentNode = node;
  setSelected(node, true);
  refreshVisual();
  showDetail(node);
  paintInfoCard(node);

  const tgt = node.g.position;
  const look = new THREE.Vector3(tgt.x, tgt.y, WALL_Z + 0.8);
  const eye = new THREE.Vector3(tgt.x * 0.72, clamp(tgt.y - 2.2, 3, 27), WALL_Z + 16);
  // if already posed near the wall, only dolly, don't re-fly
  const dist = camera.position.distanceTo(eye);
  if (dist > 26 || tween) {
    tween = {
      from: camera.position.clone(), to: eye,
      fromLook: getLookAt(), toLook: look,
      t: 0, dur: 1.15,
    };
  }
}

let _lookTarget = new THREE.Vector3(0, 13, WALL_Z);
const _tmpDir = new THREE.Vector3();
function getLookAt() { return _lookTarget; }
function updateLookAtFromCamera() {
  camera.getWorldDirection(_tmpDir);
  _lookTarget.copy(camera.position).add(_tmpDir.multiplyScalar(20));
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
  updateLookAtFromCamera();
}

// ---------------------------------------------------------------------------
//  Picking (atoms AND portable room doors)
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);   // [-1,1] cursor (unlocked)

const pickTargets = () => {
  const arr = [];
  for (const n of elementNodeList) arr.push(n.atom);
  for (const n of elementNodeList) if (n.portal) arr.push(n.portal);
  return arr;
};

function nodeOf(obj) {
  for (const n of elementNodeList) {
    let p = obj;
    while (p && p !== n.atom) p = p.parent;
    if (p === n.atom) return n;
  }
  return null;
}
function portalOf(obj) {
  for (const n of elementNodeList) {
    if (!n.portal) continue;
    let p = obj;
    while (p && p !== n.portal) p = p.parent;
    if (p === n.portal) return n;
  }
  return null;
}
function classify(obj) {
  if (!obj) return null;
  const pn = portalOf(obj);
  if (pn) return { node: pn, portal: true };
  const node = nodeOf(obj);
  return node ? { node, portal: false } : null;
}

function pick(e) {
  if (controls.locked || renderer.xr.isPresenting) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);   // centre reticle
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  const hits = raycaster.intersectObjects(pickTargets(), true);
  return hits.length ? hits[0].object : null;
}

function applyHover(t) {
  if (!t) return;
  if (t.portal) t.node.portalHovered = true;
  else t.node.hovered = true;
}
function clearHover(t) {
  if (!t) return;
  t.node.hovered = false;
  t.node.portalHovered = false;
}
function sameTarget(a, b) {
  return (a == null && b == null) || (a && b && a.node === b.node && a.portal === b.portal);
}
function updateHover(t) {
  if (sameTarget(t, hoverTarget)) return;
  clearHover(hoverTarget);
  hoverTarget = t;
  applyHover(hoverTarget);
  refreshVisual();
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const t = classify(pick(e));
  updateHover(t);
  renderer.domElement.style.cursor =
    controls.locked ? 'none' : (t ? 'pointer' : '');
});

renderer.domElement.addEventListener('click', (e) => {
  const t = classify(pick(e));
  if (t) {
    if (t.portal) { enterRoom(t.node.el); return; }
    focusElement(t.node);
    return;
  }
  if (!controls.locked) renderer.domElement.requestPointerLock();
});

function enterRoom(el) { location.href = roomHref(el); }

// hint fades while the mouse is captured by pointer lock
document.addEventListener('pointerlockchange', () => {
  hint.classList.toggle('faded', controls.locked);
});

// ---------------------------------------------------------------------------
//  Search + category filter
// ---------------------------------------------------------------------------
const searchInput = document.getElementById('search-input');
const legendEl = document.getElementById('legend');
let activeCat = null;

function queryMatch(el, q) {
  q = q.trim().toLowerCase();
  if (!q) return true;
  return String(el.n).includes(q) || el.s.toLowerCase().includes(q) || el.name.toLowerCase().includes(q);
}
searchInput.addEventListener('input', () => {
  const q = searchInput.value;
  let any = false;
  elementNodeList.forEach((n) => {
    const m = queryMatch(n.el, q);
    n.matched = m; any = any || m;
    n.g.visible = m;
  });
  searchInput.classList.toggle('miss', !any && q !== '');
  searchInput.classList.toggle('hit', any && q !== '');
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = elementNodeList.find((n) => n.matched && n.el.n >= 1 && n.g.visible);
    if (first) focusElement(first);
  }
  if (e.key === 'Escape') { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); searchInput.blur(); }
});

function setActiveCat(key) {
  activeCat = key;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === key));
  elementNodeList.forEach((n) => {
    n.dimmed = key !== null && n.el.cat !== key;
  });
  refreshVisual();
  if (key) {
    const first = elementNodeList.find((n) => n.el.cat === key);
    if (first) focusElement(first);
  }
}
window.ELEMENT_CATEGORIES.forEach(([key, label]) => {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.dataset.cat = key;
  chip.innerHTML = `<span class="dot" style="background:${catHex(key)}"></span>${label}`;
  chip.addEventListener('click', () => setActiveCat(activeCat === key ? null : key));
  legendEl.appendChild(chip);
});

// ---------------------------------------------------------------------------
//  XR session lifecycle (shared button + rig)
// ---------------------------------------------------------------------------
const xrBtn = document.getElementById('xr');
const xrHint = document.getElementById('xr-hint');

function onSessionStart() {
  xrBtn.textContent = 'Exit XR';
  xrBtn.disabled = false;
  xrHint.classList.remove('hidden');
  hint.classList.add('hidden');
  // place the visitor in front of the table
  camera.position.set(0, EYE, 6);
  _lookTarget.set(0, 13, WALL_Z);
  camera.lookAt(_lookTarget);
  setNodeLOD(true);
}
function onSessionEnd() {
  xrBtn.textContent = 'Enter XR';
  xrHint.classList.add('hidden');
  hint.classList.remove('hidden');
  setNodeLOD(false);
}
setupXrButton({ renderer, btn: xrBtn, onSessionStart, onSessionEnd });

function setNodeLOD(low) {
  elementNodeList.forEach((n) => {
    const old = n.atom;
    const neo = buildAtom(n.el, { low, electronCap: ELECTRON_CAP });
    neo.scale.copy(old.scale);
    old.parent.add(neo);
    old.parent.remove(old);
    // keep selection state on the new atom
    n.atom = neo;
    neo.scale.setScalar(n.selected ? 1.55 : 1);
  });
  refreshVisual();
}

// ---------------------------------------------------------------------------
//  Animation loop
// ---------------------------------------------------------------------------
const fpsEl = document.getElementById('fps');
const hint = document.getElementById('hint');
const loadingEl = document.getElementById('loading');
const clock = new THREE.Clock();
let frames = 0, fpsClock = performance.now();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const n of elementNodeList) orbitAtom(n.atom, dt);
  stepCamera(dt);
  refreshVisual();
  updateHover(classify(vrRig.pick(pickTargets)));
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

panelClose.addEventListener('click', hideDetail);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !controls.locked) hideDetail(); });
window.addEventListener('blur', () => controls.keys.clear());

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
loadingEl.classList.add('hidden');
setTimeout(() => loadingEl.remove(), 900);
document.getElementById('sub').textContent =
  `${ELEMENTS.length} atoms · ${window.ELEMENT_CATEGORIES.length} families · free flight · WebXR`;

infoCard = buildInfoCard();
renderer.setAnimationLoop(animate);
resize();

// expose minimal state for headless verification / debugging
window.RPRoom = {
  elements: ELEMENTS.length,
  nodes: elementNodeList.length,
  shellsDrawn() {
    return elementNodeList.reduce((a, n) => a + n.atom.children.length, 0);
  },
  selected: () => (currentNode ? currentNode.el.n : null),
  matchedCount: () => elementNodeList.filter((n) => n.g.visible).length,
  camPos: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  cameraIdle: () => !tween && !controls.locked,
  grid: () => ({ colW: COL_W, rowH: ROW_H }),
  portalVisible: () => elementNodeList.filter((n) => n.portal && n.portal.visible).length,
  portalScreen: (n) => {
    const node = elementNodes.get(n);
    if (!node || !node.portal || !node.portal.visible) return null;
    const v = node.portal.position.clone().project(camera);
    if (v.z > 1) return null;
    return {
      x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
      y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    };
  },
  roomHref: (n) => { const node = elementNodes.get(n); return node ? roomHref(node.el) : null; },
  selectByNumber(n) { const node = elementNodes.get(n); if (node) focusElement(node); return !!node; },
};
