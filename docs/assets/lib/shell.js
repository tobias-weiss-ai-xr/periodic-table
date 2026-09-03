// =========================================================================
//  lib/shell.js — parameterised room shell. Floor + grid + walls + ceiling
//  (+ optional title sprites). Shared by the main gallery room (a big hall)
//  and the per-element rooms (a small chamber).
// =========================================================================
import * as THREE from 'three';
import { makeLabel } from './primitives.js';

/**
 * Build a room shell. Everything is layout-only; elements/atoms are added by
 * the caller.
 *
 *  width / depth / height  — room extents (for floor plane size)
 *  floorColor / wallColor  — materials
 *  grid                     — { size, divisions, color, center } or null
 *  walls                    — array of [x, y, z, rotX, w, h] planes
 *  ceiling                  — [x, y, z, rotX, w, h] plane or null
 *  labels                   — array of { text, sub?, color?, size?, scale?,
 *                               position: [x,y,z] } title sprites
 */
export function buildRoomShell({
  width = 34, depth = 30, height = 20,
  floorColor = 0x0a0f1c, wallColor = 0x070a12,
  grid = { size: 30, divisions: 10, color: 0x16203a, center: 0x0c1424 },
  walls = [], ceiling = null, labels = [],
} = {}) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: wallColor, metalness: 0.3, roughness: 0.9 });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.85, metalness: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);

  if (grid) {
    const gr = new THREE.GridHelper(grid.size, grid.divisions, grid.color, grid.center);
    gr.position.y = 0.02;
    g.add(gr);
  }

  const addPlane = (x, y, z, rx, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  (walls || []).forEach(([x, y, z, rx, w, h]) => addPlane(x, y, z, rx, w, h));
  if (ceiling) addPlane(...ceiling);

  for (const L of labels || []) {
    const t = makeLabel(L.text, { color: L.color || '#dfe8ff', size: L.size || 44, scale: L.scale || 0.008 });
    t.position.set(L.position[0], L.position[1], L.position[2]);
    g.add(t);
    if (L.sub) {
      const s = makeLabel(L.sub, { color: L.subColor || '#5d6884', size: 30, scale: 0.008 });
      s.position.set(L.position[0], L.position[1] - 2.2, L.position[2]);
      g.add(s);
    }
  }

  return g;
}
