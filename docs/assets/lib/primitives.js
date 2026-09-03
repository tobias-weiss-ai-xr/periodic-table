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
