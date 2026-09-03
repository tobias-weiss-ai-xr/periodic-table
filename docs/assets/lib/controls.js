// =========================================================================
//  lib/controls.js — shared free-flight movement (desktop keyboard/pointer
//  lock + VR gamepad). Shared by the main gallery room and element rooms.
// =========================================================================
import * as THREE from 'three';
import { clamp } from './util.js';

/**
 * Create free-flight controls bound to a renderer + camera.
 *
 *  renderer         — THREE.WebGLRenderer (its canvas takes pointer lock)
 *  camera           — perspective camera (rotation.order 'YXZ')
 *  bounds           — { xMin, xMax, zMin, zMax } movement limits
 *  yMin / yMax      — height limits (desktop free-flight only)
 *  getControllers   — () => array of XR controller objects (gamepads)
 */
export function createFreeFlight({ renderer, camera, bounds, yMin = 1, yMax = 29, getControllers = () => [] }) {
  const keys = new Set();
  let locked = false;

  const dir = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
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

  function step(dt, presenting = false) {
    dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.y = 0; dir.normalize();
    right.set(-dir.z, 0, dir.x);

    const sprint = keys.has('control');
    const speed = sprint ? 11 : 5.2;
    move.set(0, 0, 0);

    if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(dir, speed * dt);
    if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(dir, -speed * dt);
    if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(right, -speed * dt);
    if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right, speed * dt);
    if (keys.has('space')) camera.position.y += speed * 0.55 * dt;
    if (keys.has('shift')) camera.position.y -= speed * 0.55 * dt;

    // VR thumbsticks (left: move, right: yaw)
    for (const c of getControllers()) {
      const gp = c.gamepad;
      if (gp && gp.axes && gp.axes.length >= 2) {
        const f = -gp.axes[1], r = gp.axes[0];
        if (Math.abs(f) > 0.08) move.addScaledVector(dir, f * speed * 1.15 * dt);
        if (Math.abs(r) > 0.08) move.addScaledVector(right, r * speed * 1.15 * dt);
        if (gp.axes.length >= 4) camera.rotation.y -= gp.axes[2] * 0.9 * dt;
      }
    }

    camera.position.x = clamp(camera.position.x + move.x, bounds.xMin + 1.2, bounds.xMax - 1.2);
    camera.position.z = clamp(camera.position.z + move.z, bounds.zMin + 1.2, bounds.zMax - 1.2);
    // desktop = free flight; a presenting headset supplies its own height
    if (!presenting) camera.position.y = clamp(camera.position.y, yMin, yMax);
  }

  return {
    get locked() { return locked; },
    requestLock() { renderer.domElement.requestPointerLock(); },
    keys,
    step,
  };
}
