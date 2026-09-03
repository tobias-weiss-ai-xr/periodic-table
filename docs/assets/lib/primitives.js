// =========================================================================
//  lib/primitives.js — reusable three.js building blocks.
//  Atomic models, text sprites, glows, shared geometry and the portal door
//  used by BOTH the main gallery room (app.js) and element rooms (room.js).
// =========================================================================
import * as THREE from 'three';
import { catHex } from './theme.js';

export const ELECTRON_HEX = '#eaf4ff';

// Shared geometry (created once, reused by every atom in every room)
const geo = {
  nucleus: new THREE.SphereGeometry(0.17, 24, 24),
  electron: new THREE.SphereGeometry(0.055, 10, 10),
  tile: new THREE.PlaneGeometry(2.15, 2.15),
  disc: new THREE.CircleGeometry(0.85, 48),
  rings: [],
};
for (let i = 0; i < 8; i++) {
  geo.rings.push(new THREE.RingGeometry(0.5 + i * 0.3 - 0.02, 0.5 + i * 0.3 + 0.02, 64));
}
export { geo };

// ---------------------------------------------------------------------------
//  makeLabel — canvas-text sprite
// ---------------------------------------------------------------------------
export function makeLabel(text, opts = {}) {
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

// ---------------------------------------------------------------------------
//  makeGlow — soft radial glow sprite
// ---------------------------------------------------------------------------
let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
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
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

export function makeGlow(colorHex, size = 1) {
  const mat = new THREE.SpriteMaterial({
    map: getGlowTex(), color: colorHex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, size);
  return sp;
}

// ---------------------------------------------------------------------------
//  buildAtom — nucleus + Bohr shells with orbiting electrons (instanced)
//  The electron shell <Group>s rotate themselves; rooms just leave them alone.
// ---------------------------------------------------------------------------
export function buildAtom(el, opts = {}) {
  const { shells = el.sh, low = false, electronCap = 14 } = opts;
  const cpk = new THREE.Color('#' + el.c);
  const group = new THREE.Group();
  const ringHex = catHex(el.cat);

  const nuc = new THREE.Mesh(geo.nucleus, new THREE.MeshStandardMaterial({
    color: cpk, emissive: cpk, emissiveIntensity: 1.15, roughness: 0.35, metalness: 0.2,
  }));
  group.add(nuc);

  const nShells = low ? Math.min(shells.length, 4) : shells.length;
  for (let i = 0; i < nShells; i++) {
    const count = low ? Math.min(shells[i], 6) : Math.min(shells[i], electronCap);
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

/** Rotate every orbiting shell group (call once per frame). */
export function orbitAtom(atom, dt) {
  for (const child of atom.children) {
    if (child.userData && child.userData.speed) {
      child.rotation.z += dt * child.userData.speed;
      child.rotation.x = child.userData.tilt;
    }
  }
}

// ---------------------------------------------------------------------------
//  buildDoor — a glowing portal / door (a "room doorway") plus its label.
//  Shown in the main room above a selected element (enter its room) and on
//  the back wall of every element room (return to the gallery).
//  Marked with userData.isPortal so raycaster hits can be classified.
// ---------------------------------------------------------------------------
export function buildDoor(opts = {}) {
  const {
    text = 'ENTER ROOM', sub = '',
    color = '#3fe0ff', scale = 1, opacity = 1,
  } = opts;

  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.05, 10, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
  );
  g.add(ring);

  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(0.97, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  fill.position.z = -0.02;
  g.add(fill);

  const glow = makeGlow(color, 2.5);
  glow.position.z = -0.2;
  glow.material.opacity = 0.55;
  g.add(glow);

  const label = makeLabel(text, { color, size: 40, scale: 0.0042 });
  label.position.y = -1.5;
  g.add(label);
  if (sub) {
    const s = makeLabel(sub, { color: '#8a93a8', size: 26, scale: 0.0038 });
    s.position.y = -2.05;
    g.add(s);
  }

  g.scale.setScalar(scale);
  g.userData.isPortal = true;
  g.userData.meshes = [ring, fill, glow, label];
  return g;
}

// ---------------------------------------------------------------------------
//  makeStarDust — a subtle field of drifting particles ("we are made of
//  star dust"). Purely decorative; used to give rooms atmosphere.
// ---------------------------------------------------------------------------
export function makeStarDust(opts = {}) {
  const {
    count = 300,
    area = { x: 30, y: 18, z: 24 },   // half-extents (x/z), full height (y)
    color = 0xaec6ff,
    size = 0.1,
    opacity = 0.5,
  } = opts;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * area.x;
    positions[i * 3 + 1] = Math.random() * area.y;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * area.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const m = new THREE.PointsMaterial({
    color, size, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(g, m);
  pts.userData.isDust = true;
  return pts;
}

// ---------------------------------------------------------------------------
//  buildLattice — small, honest 3D models of how a pure element arranges
//  itself. Powers the "crystal & molecule" learning station in element rooms.
//  Types: atom | dumbbell | tetra | ring8 | sc | bcc | fcc | hcp | diamond
// ---------------------------------------------------------------------------
const CUBE = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const CUBE_EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
];
function hexRing(r, y, phaseDeg, out, startIdx) {
  for (let k = 0; k < 6; k++) {
    const a = ((phaseDeg + k * 60) * Math.PI) / 180;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return startIdx + 6;
}
function latticePoints(type) {
  const pts = [];
  const bonds = [];
  const cubeFace = (i) => pts.push(CUBE[i]);
  switch (type) {
    case 'atom':
      pts.push([0, 0, 0]);
      break;
    case 'dumbbell':
      pts.push([-0.55, 0, 0], [0.55, 0, 0]);
      bonds.push([0, 1]);
      break;
    case 'tetra':
      pts.push([0.55, 0.55, 0.55], [0.55, -0.55, -0.55], [-0.55, 0.55, -0.55], [-0.55, -0.55, 0.55]);
      bonds.push([0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]);
      break;
    case 'ring8': {
      for (let k = 0; k < 8; k++) {
        const a = (k * 45 * Math.PI) / 180;
        pts.push([Math.cos(a) * 0.8, k % 2 ? 0.14 : -0.14, Math.sin(a) * 0.8]);
      }
      for (let k = 0; k < 8; k++) bonds.push([k, (k + 1) % 8]);
      break;
    }
    case 'sc':
      CUBE.forEach(cubeFace);
      bonds.push(...CUBE_EDGES);
      break;
    case 'bcc':
      CUBE.forEach(cubeFace);
      pts.push([0.5, 0.5, 0.5]);
      bonds.push([0, 7], [1, 6], [2, 5], [3, 4]);
      break;
    case 'fcc': {
      CUBE.forEach(cubeFace);
      pts.push([1, 0.5, 0.5], [0, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 1], [0.5, 0.5, 0]);
      const fc = (ci, fi) => bonds.push([ci, fi]);
      [1, 3, 5, 7].forEach((c) => fc(c, 8));   // +x face
      [0, 2, 4, 6].forEach((c) => fc(c, 9));   // -x
      [2, 3, 6, 7].forEach((c) => fc(c, 10));  // +y
      [0, 1, 4, 5].forEach((c) => fc(c, 11));  // -y
      [4, 5, 6, 7].forEach((c) => fc(c, 12));  // +z
      [0, 1, 2, 3].forEach((c) => fc(c, 13));  // -z
      break;
    }
    case 'diamond': {
      CUBE.forEach(cubeFace);
      pts.push([1, 0.5, 0.5], [0, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 1], [0.5, 0.5, 0]);
      pts.push([0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]);
      bonds.push([14, 0], [14, 9], [14, 11], [14, 13]);
      bonds.push([15, 7], [15, 8], [15, 10], [15, 13]);
      bonds.push([16, 5], [16, 8], [16, 11], [16, 12]);
      bonds.push([17, 6], [17, 9], [17, 10], [17, 12]);
      break;
    }
    case 'hcp': {
      pts.push([0, 0, 0]);                    // 0  bottom centre
      hexRing(1, 0, 0, pts, 1);               // 1..6 bottom ring (0deg..)
      hexRing(1, 0.8, 30, pts, 7);            // 7..9 middle triangle
      pts.push([0, 1.6, 0]);                  // 10 top centre
      hexRing(1, 1.6, 0, pts, 11);            // 11..16 top ring
      for (const base of [1, 11]) {
        for (let k = 0; k < 6; k++) {
          bonds.push([base, base + 1 + k]);
          bonds.push([base + 1 + k, base + 1 + ((k + 1) % 6)]);
        }
      }
      bonds.push([7, 8], [8, 9], [9, 7]);
      bonds.push([7, 1], [7, 2], [8, 3], [8, 4], [9, 5], [9, 6]);
      bonds.push([7, 11], [7, 12], [8, 13], [8, 14], [9, 15], [9, 16]);
      break;
    }
    default:
      pts.push([0, 0, 0]);
  }
  return { pts, bonds };
}

export function buildLattice({ type = 'atom', color = '#3fe0ff', extent = 2.4, radius = 0.3 } = {}) {
  const { pts, bonds } = latticePoints(type);
  const g = new THREE.Group();
  const sphGeo = new THREE.SphereGeometry(radius, 20, 14);
  const sphMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.35, metalness: 0.55,
    emissive: new THREE.Color(color), emissiveIntensity: 0.08,
  });
  const bondGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x8a94ad, roughness: 0.6, metalness: 0.3 });
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const scale = type === 'atom' ? radius * 2.2 : extent;
  for (const p of pts) {
    const m = new THREE.Mesh(sphGeo, sphMat);
    m.position.set(p[0] * scale, p[1] * scale, p[2] * scale);
    g.add(m);
  }
  for (const [a, b] of bonds) {
    const pa = new THREE.Vector3(...pts[a]).multiplyScalar(scale);
    const pb = new THREE.Vector3(...pts[b]).multiplyScalar(scale);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    const len = pa.distanceTo(pb);
    const cyl = new THREE.Mesh(bondGeo, bondMat);
    cyl.position.copy(mid);
    cyl.scale.y = len;
    dir.subVectors(pb, pa).normalize();
    cyl.quaternion.setFromUnitVectors(up, dir);
    g.add(cyl);
  }
  if (type === 'atom') {
    const glow = makeGlow(color, scale * 3.2);
    glow.material.opacity = 0.5;
    g.add(glow);
  }
  // centre the model around its own origin so it sits nicely on a stand
  const box = new THREE.Box3().setFromObject(g);
  const centre = box.getCenter(new THREE.Vector3());
  g.children.forEach((c) => c.position.sub(centre));
  g.userData.isLattice = true;
  g.userData.latticeType = type;
  return g;
}
