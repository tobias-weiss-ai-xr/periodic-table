// ===========================================================================
//  The Periodic Table Room — walkable 3D gallery of all 118 elements
//  three.js (r160) + WebXR. Room shows the extended periodic table as a wall
//  of atoms; each element is a live Bohr-style atom model. Click to select,
//  WASD to walk, WebXR button for VR.
// ===========================================================================

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const ELEMENTS = window.ELEMENTS;                       // 118 elements (data.js)
const ELEMENT_CATEGORIES = window.ELEMENT_CATEGORIES;   // [key, label][]  (data.js)

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
const MAX_VR_SHELLS = 4;             // shell cap in VR (lower LOD)

// ---------------------------------------------------------------------------
//  Category palette (dark-theme friendly)
// ---------------------------------------------------------------------------
const CATEGORY_HEX = {
  'alkali metal': '#ff5cc8',
  'alkaline earth metal': '#ffd166',
  'transition metal': '#3fe0ff',
  'post-transition metal': '#7ea8ff',
  'metalloid': '#b08cff',
  'diatomic nonmetal': '#ff8a5c',
  'polyatomic nonmetal': '#a3e635',
  'lanthanide': '#34d399',
  'actinide': '#86efac',
  'halogen': '#f472b6',
  'noble gas': '#dbeafe',
};
const catColor = (key) => new THREE.Color(CATEGORY_HEX[key] || '#9aa5b8');
const catHex = (key) => CATEGORY_HEX[key] || '#9aa5b8';

// ---------------------------------------------------------------------------
//  Small helpers
// ---------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeLabel(text, opts = {}) {
  const { color = '#e8ecf4', size = 44, mono = true, bg = null, pad = 10, scale = 0.0065 } = opts;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = `${size}px ${mono ? 'ui-monospace, Menlo, Consolas, monospace' : 'sans-serif'}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = size + pad * 2;
  cv.width = w; cv.height = h;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.roundRect ? ctx.roundRect(0, 0, w, h, 8) : ctx.rect(0, 0, w, h);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(w * scale, h * scale, 1);
  sp.userData.aspect = w / h;
  return sp;
}

function makeGlowTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}
function makeGlow(colorHex, size = 1) {
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color: colorHex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, size);
  return sp;
}

// ---------------------------------------------------------------------------
//  Shared geometry & materials
// ---------------------------------------------------------------------------
let glowTex = null;
const geo = {
  nucleus: new THREE.SphereGeometry(0.17, 24, 24),
  electron: new THREE.SphereGeometry(0.055, 10, 10),
  tile: new THREE.PlaneGeometry(2.15, 2.15),
  disc: new THREE.CircleGeometry(0.85, 48),
  rings: [],
};
for (let i = 0; i < 8; i++) geo.rings.push(new THREE.RingGeometry(0.5 + i * 0.3 - 0.02, 0.5 + i * 0.3 + 0.02, 64));

const ELECTRON_HEX = '#eaf4ff';

// ---------------------------------------------------------------------------
//  Atom builder — nucleus + Bohr shells with orbiting electrons (instanced)
// ---------------------------------------------------------------------------
function buildAtom(el, opts = {}) {
  const { shells = el.sh, low = false } = opts;
  const cpk = new THREE.Color('#' + el.c);
  const group = new THREE.Group();
  const ringHex = catHex(el.cat);

  const nuc = new THREE.Mesh(geo.nucleus, new THREE.MeshStandardMaterial({
    color: cpk, emissive: cpk, emissiveIntensity: 1.15, roughness: 0.35, metalness: 0.2,
  }));
  group.add(nuc);

  const nShells = low ? Math.min(shells.length, MAX_VR_SHELLS) : shells.length;
  for (let i = 0; i < nShells; i++) {
    const count = low ? Math.min(shells[i], 6) : Math.min(shells[i], ELECTRON_CAP);
    const ringGroup = new THREE.Group();
    const ring = new THREE.Mesh(geo.rings[i], new THREE.MeshBasicMaterial({
      color: ringHex, transparent: true, opacity: low ? 0.55 : 0.8, side: THREE.DoubleSide,
    }));
    ringGroup.add(ring);
    if (count > 0) {
      const inst = new THREE.InstancedMesh(geo.electron, new THREE.MeshBasicMaterial({
        color: ELECTRON_HEX, transparent: true, opacity: 0.95,
      }), count);
      const m = new THREE.Matrix4();
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2;
        m.makeTranslation(Math.cos(a) * (0.5 + i * 0.3), Math.sin(a) * (0.5 + i * 0.3), 0);
        inst.setMatrixAt(k, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      ringGroup.add(inst);
    }
    ringGroup.userData.speed = 0.45 + i * 0.14;
    ringGroup.userData.tilt = (i % 3) * 0.6 - 0.55;
    group.add(ringGroup);
  }
  group.userData.nShells = nShells;
  return group;
}

// ---------------------------------------------------------------------------
//  Element node — a display case on the wall
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
  const atom = buildAtom(el);
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

  const state = {
    el, g: null,
    atom, halo, sym, num, ring, tile,
    hovered: false,
    selected: false,
    matched: true,
    dimmed: false,
    baseX: x, baseY: y,
  };

  return { g, beacon, state };
}

// ---------------------------------------------------------------------------
//  Detail panel
// ---------------------------------------------------------------------------
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panel-body');
const panelClose = document.getElementById('panel-close');

function fmt(v, digits = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });
}
function fmtTemp(k) {
  if (k === null || k === undefined || Number.isNaN(k)) return '—';
  return `${(k - 273.15).toFixed(1)}&nbsp;°C`;
}

function showDetail(node) {
  const el = node.el;
  const shells = (el.sh || []).join(' · ');
  const catLabel = (ELEMENT_CATEGORIES.find((c) => c[0] === el.cat) || [el.cat, el.cat])[1];
  const mass = el.m != null ? `${fmt(el.m, 6)} u` : '—';
  panelBody.innerHTML = `
    <div class="hdr">
      <div class="big" style="color:${catHex(el.cat)}; border-color:${catHex(el.cat)}44">${el.s}</div>
      <div>
        <div class="name">${el.name}</div>
        <div class="num">atomic number ${el.n}</div>
        <span class="cat-tag" style="background:${catHex(el.cat)}">${catLabel}</span>
      </div>
    </div>
    <dl class="fact-grid">
      <dt>atomic mass</dt><dd>${mass}</dd>
      <dt>electron shells</dt><dd>${shells}</dd>
      <dt>configuration</dt><dd>${el.esem || '—'}</dd>
      <dt>phase</dt><dd>${el.phase || '—'}</dd>
      <dt>melting point</dt><dd>${fmtTemp(el.melt)}</dd>
      <dt>boiling point</dt><dd>${fmtTemp(el.boil)}</dd>
      <dt>density</dt><dd>${el.dens != null ? fmt(el.dens, 4) + ' g/cm³' : '—'}</dd>
      <dt>electronegativity</dt><dd>${fmt(el.en, 3)}</dd>
    </dl>
    ${el.sum ? `<p class="lead">${el.sum}</p>` : ''}
    <p class="cite">Data: Bowserinator/Periodic-Table-JSON · visualisation: The Periodic Table Room</p>
  `;
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
  const cv = document.createElement('canvas');
  cv.width = 760; cv.height = 300;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.96,
  }));
  sp.scale.set(4.6, 1.82, 1);
  sp.visible = false;
  scene.add(sp);
  sp.userData.ctx = ctx;
  return sp;
}

function paintInfoCard(node) {
  const el = node.el;
  const ctx = infoCard.userData.ctx;
  const cv = ctx.canvas;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8,11,20,0.86)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = catHex(el.cat);
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.textBaseline = 'alphabetic';

  const catLabel = (ELEMENT_CATEGORIES.find((c) => c[0] === el.cat) || [el.cat, el.cat])[1];
  const mass = el.m != null ? fmt(el.m, 4) : '—';

  ctx.fillStyle = catHex(el.cat);
  ctx.font = '700 64px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`${el.s}`, 30, 84);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '600 46px sans-serif';
  ctx.fillText(`${el.name}`, 128, 84);
  ctx.fillStyle = '#8a93a8';
  ctx.font = '30px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`atomic #${el.n} · ${catLabel}`, 128, 122);

  const line = (text, y, color = '#cfd8ea') => {
    ctx.fillStyle = color; ctx.font = '27px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(text, 30, y);
  };
  line(`mass ${mass} u  ·  phase ${el.phase || '—'}`, 168);
  line(`shells ${(el.sh || []).join('  ')}`, 206);
  line(`config ${el.esem || '—'}`, 246);
  line(`melting ${fmtTemp(el.melt)}  ·  boiling ${fmtTemp(el.boil)}  ·  ρ ${el.dens != null ? fmt(el.dens, 2) : '—'} g/cm³`, 282);

  infoCard.material.map.needsUpdate = true;
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
//  Room shell
// ---------------------------------------------------------------------------
function buildRoom() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x070a12, metalness: 0.3, roughness: 0.9 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshStandardMaterial({
    color: 0x0a0f1c, roughness: 0.85, metalness: 0.25,
  }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);

  const grid = new THREE.GridHelper(90, 30, 0x16203a, 0x0c1424);
  grid.position.y = 0.02;
  g.add(grid);

  const walls = [
    [-38, 0, 0, Math.PI / 2, 3, 34],          // left
    [38, 0, 0, Math.PI / 2, 3, 34],           // right
    [0, 13, -20, 0, 80, 30],                  // back (behind the table)
    [0, 30, 0, Math.PI / 2, 80, 43],          // ceiling
  ];
  walls.forEach(([x, y, z, rx, w, h]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  });

  // wall grid lines behind the periodic table
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
  g.add(lines);

  // entrance wall with the room title (behind the viewer)
  const back2 = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), dark);
  back2.position.set(0, 13, 24);
  g.add(back2);
  const title = makeLabel('THE PERIODIC TABLE ROOM', { color: '#dfe8ff', size: 54, scale: 0.009 });
  title.position.set(0, 24.5, 22.6);
  g.add(title);
  const sub = makeLabel('118 elements · atom models · WebXR · fly freely', { color: '#5d6884', size: 30, scale: 0.008 });
  sub.position.set(0, 22.3, 22.6);
  g.add(sub);

  return g;
}
scene.add(buildRoom());

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
//  Movement state (desktop + VR-shared)
// ---------------------------------------------------------------------------
const moveState = { fwd: 0, strafe: 0, sprint: false };
const keys = new Set();
let locked = false;
let tween = null; // {a,b,from,to,fromLook,toLook,t,dur}
let currentNode = null;   // selected
let hoverNode = null;

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
    const hov = n.hovered && !on;
    if (currentNode !== n) n.halo.material.opacity = hov ? 0.8 : (n.dimmed ? 0.16 : 0.5);
    n.sym.material.opacity = on ? 1 : hov ? 1 : 0.92;
    n.tile.material.opacity = on ? 0.16 : hov ? 0.12 : 0.07;
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
function getLookAt() { return _lookTarget; }
function updateLookAtFromCamera() {
  camera.getWorldDirection(_tmpDir);
  _lookTarget.copy(camera.position).add(_tmpDir.multiplyScalar(20));
}
const _tmpDir = new THREE.Vector3();

// ---------------------------------------------------------------------------
//  Picking
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);   // [-1,1] cursor (unlocked)
const atomGroups = () => elementNodeList.map((n) => n.atom);

function nodeOf(obj) {
  for (const n of elementNodeList) {
    let p = obj;
    while (p && p !== n.atom) p = p.parent;
    if (p === n.atom) return n;
  }
  return null;
}
function pickFromCamera(e) {
  if (locked) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);   // centre reticle
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  const hits = raycaster.intersectObjects(atomGroups(), true);
  return hits.length ? hits[0].object : null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const hit = pickFromCamera(e);
  const node = hit ? nodeOf(hit) : null;
  if (hoverNode !== node) { hoverNode = node; refreshVisual(); }
  if (locked) renderer.domElement.style.cursor = hoverNode ? 'none' : 'none';
  else renderer.domElement.style.cursor = hoverNode ? 'pointer' : '';
});

renderer.domElement.addEventListener('click', (e) => {
  if (locked) {
    const hit = pickFromCamera(e);   // centre reticle
    const node = hit ? nodeOf(hit) : null;
    if (node) focusElement(node);
    return;
  }
  const hit = pickFromCamera(e);
  const node = hit ? nodeOf(hit) : null;
  if (node) { focusElement(node); return; }
  // clicking empty space acquires the mouse
  renderer.domElement.requestPointerLock();
});

// ---------------------------------------------------------------------------
//  Pointer lock
// ---------------------------------------------------------------------------
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  hint.classList.toggle('faded', locked);
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  camera.rotation.y -= e.movementX * 0.0022;
  camera.rotation.x = clamp(camera.rotation.x - e.movementY * 0.0022, -1.35, 1.35);
});
const keySym = (e) => (e.code === 'Space' ? 'space' : e.key.toLowerCase());
document.addEventListener('keydown', (e) => {
  keys.add(keySym(e));
  if (e.code === 'Space' && locked) e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(keySym(e)));

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
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  dir.y = 0; dir.normalize();
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const sprint = moveState.sprint || keys.has('control');
  const speed = (sprint ? 11 : 5.2);
  const move = new THREE.Vector3();
  // keyboard — free flight (no gravity outside VR)
  if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(dir, speed * dt);
  if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(dir, -speed * dt);
  if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(right, -speed * dt);
  if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right, speed * dt);
  if (keys.has('space')) camera.position.y += speed * 0.55 * dt;
  if (keys.has('shift')) camera.position.y -= speed * 0.55 * dt;
  // vr thumbstick (any connected gamepad)
  for (const c of controllers) {
    const gp = c.gamepad;
    if (gp && gp.axes && gp.axes.length >= 2) {
      const f = -gp.axes[1], r = gp.axes[0];
      if (Math.abs(f) > 0.08) move.addScaledVector(dir, f * speed * 1.15 * dt);
      if (Math.abs(r) > 0.08) move.addScaledVector(right, r * speed * 1.15 * dt);
      if (gp.axes.length >= 4) camera.rotation.y -= gp.axes[2] * 0.9 * dt;
    }
  }
  camera.position.x = clamp(camera.position.x + move.x, ROOM_MIN.x + 1.2, ROOM_MAX.x - 1.2);
  const z = camera.position.z + move.z;
  camera.position.z = clamp(z, ROOM_MIN.z + 1.2, ROOM_MAX.z - 1.2);
  // height is free-flight on desktop (headset supplies its own height in VR)
  if (!renderer.xr.isPresenting) camera.position.y = clamp(camera.position.y, 1.0, 29);
  updateLookAtFromCamera();
}

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
ELEMENT_CATEGORIES.forEach(([key, label]) => {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.dataset.cat = key;
  chip.innerHTML = `<span class="dot" style="background:${catHex(key)}"></span>${label}`;
  chip.addEventListener('click', () => setActiveCat(activeCat === key ? null : key));
  legendEl.appendChild(chip);
});

// ---------------------------------------------------------------------------
//  XR
// ---------------------------------------------------------------------------
const xrBtn = document.getElementById('xr');
const xrHint = document.getElementById('xr-hint');
const controllers = [];
const raycasterVr = new THREE.Raycaster();
let vrPoints = [];

function setupXR() {
  if (!navigator.xr) {
    xrBtn.classList.remove('hidden');
    xrBtn.disabled = true;
    xrBtn.textContent = 'XR unavailable';
    xrBtn.title = 'WebXR not available in this browser';
    return;
  }
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    xrBtn.classList.remove('hidden');
    xrBtn.disabled = !ok;
    xrBtn.textContent = ok ? 'Enter XR' : 'XR unavailable (use a VR headset)';
  });
}

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

renderer.xr.addEventListener('sessionstart', onSessionStart);
renderer.xr.addEventListener('sessionend', onSessionEnd);

function setNodeLOD(low) {
  elementNodeList.forEach((n) => {
    const old = n.atom;
    const neo = buildAtom(n.el, { low });
    neo.scale.copy(old.scale);
    old.parent.add(neo);
    old.parent.remove(old);
    // keep selection state on the new atom
    n.atom = neo;
    neo.scale.setScalar(n.selected ? 1.55 : 1);
  });
  refreshVisual();
}

const controllerModelFactory = new XRControllerModelFactory();
function makeController(idx) {
  const c = renderer.xr.getController(idx);
  c.addEventListener('selectstart', () => {
    if (!vrPoints.length) return;
    const node = nodeOf(vrPoints[0].object);
    if (node) focusElement(node);
  });
  scene.add(c);
  const grip = renderer.xr.getControllerGrip(idx);
  grip.add(controllerModelFactory.createControllerModel(grip));
  scene.add(grip);
  controllers.push(c);
}
makeController(0);
makeController(1);

// line for the right-hand VR pointer
const vrLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
]);
const vrLine = new THREE.Line(vrLineGeo, new THREE.LineBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.6 }));
vrLine.scale.setScalar(10);
vrLine.visible = false;
scene.add(vrLine);
const VR_MINUS_Z = new THREE.Vector3(0, 0, -1);

function aimVrLine(p) {
  vrLine.position.copy(p.origin);
  vrLine.quaternion.setFromUnitVectors(VR_MINUS_Z, p.dir);
  vrLine.scale.setScalar(p.len);
  vrLine.visible = true;
}

function pickVR() {
  const c = controllers[0];
  if (!renderer.xr.isPresenting || !c || !c.visible) { vrLine.visible = false; vrPoints = []; return; }
  const origin = c.position;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
  raycasterVr.set(origin, dir);
  const hits = raycasterVr.intersectObjects(atomGroups(), true);
  vrPoints = hits;
  if (vrPoints.length) {
    const hit = vrPoints[0];
    aimVrLine({ origin, dir, len: hit.distance });
    vrLine.material.color.setHex(0xffcf5c);
    const node = nodeOf(hit.object);
    if (hoverNode !== node) { hoverNode = node; refreshVisual(); }
  } else {
    aimVrLine({ origin, dir, len: 12 });
    vrLine.material.color.setHex(0x3fe0ff);
    if (hoverNode) { hoverNode = null; refreshVisual(); }
  }
}

xrBtn.addEventListener('click', async () => {
  if (renderer.xr.isPresenting) {
    await renderer.xr.endSession();
    return;
  }
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
    await renderer.xr.setSession(session);
  } catch (err) {
    console.warn('XR session failed:', err);
    xrBtn.textContent = 'XR unavailable';
  }
});

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
  orbitAtoms(dt);
  stepCamera(dt);
  refreshVisual();
  pickVR();
  if (renderer.xr.isPresenting) hint.classList.add('hidden');

  frames++;
  const now = performance.now();
  if (now - fpsClock > 1000) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsClock))} fps`;
    frames = 0; fpsClock = now;
  }
  renderer.render(scene, camera);
}

// orbit all electron shells (shared across nodes) — batched into one pass
function orbitAtoms(dt) {
  for (const n of elementNodeList) {
    for (const child of n.atom.children) {
      if (child.userData && child.userData.speed) {
        child.rotation.z += dt * child.userData.speed;
        child.rotation.x = child.userData.tilt;
      }
    }
  }
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

panelClose.addEventListener('click', hideDetail);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !locked) hideDetail(); });
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------------
loadingEl.classList.add('hidden');
setTimeout(() => loadingEl.remove(), 900);
document.getElementById('sub').textContent =
  `${ELEMENTS.length} atoms · ${ELEMENT_CATEGORIES.length} families · free flight · WebXR`;

setupXR();
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
  cameraIdle: () => !tween && !locked,
  grid: () => ({ colW: COL_W, rowH: ROW_H }),
  selectByNumber(n) { const node = elementNodes.get(n); if (node) focusElement(node); return !!node; },
};
