// =========================================================================
//  lib/xr.js — shared WebXR wiring: the "Enter XR" button lifecycle plus a
//  two-controller rig with a point-and-select ray. Used by the main gallery
//  room and the per-element rooms.
// =========================================================================
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/**
 * Wire up the "Enter XR" button and session lifecycle.
 *  - reflects WebXR availability in the button's text/disabled state
 *  - enters/exits an 'immersive-vr' session on click
 *  - calls onSessionStart / onSessionEnd when the session changes
 */
export function setupXrButton({ renderer, btn, onSessionStart = () => {}, onSessionEnd = () => {} }) {
  if (!navigator.xr) {
    btn.classList.remove('hidden');
    btn.disabled = true;
    btn.textContent = 'XR unavailable';
    btn.title = 'WebXR not available in this browser';
    return;
  }
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    btn.classList.remove('hidden');
    btn.disabled = !ok;
    btn.textContent = ok ? 'Enter XR' : 'XR unavailable (use a VR headset)';
  });

  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  btn.addEventListener('click', async () => {
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
      btn.textContent = 'XR unavailable';
    }
  });
}

const VR_MINUS_Z = new THREE.Vector3(0, 0, -1);
const vrLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
]);

/**
 * Two-controller XR rig with a point-and-select ray on the right hand.
 *
 *  renderer     — THREE.WebGLRenderer (xr enabled)
 *  scene        — scene the controllers/ray line are added to
 *  onSelect     — (hitObject|null) => void, fired on trigger while pointing
 *  getTargets   — () => array of raycast-able THREE objects
 *
 * Returns { controllers, pick }: pick(getTargets) raycasts once per frame,
 * aims the pointer line and returns the first hit object (or null).
 */
export function createVrRig({ renderer, scene, onSelect = () => {} }) {
  const controllerModelFactory = new XRControllerModelFactory();
  const controllers = [];

  function makeController(idx) {
    const c = renderer.xr.getController(idx);
    c.addEventListener('selectstart', () => {
      if (!vrPoints.length) return;
      onSelect(vrPoints[0].object);
    });
    scene.add(c);
    const grip = renderer.xr.getControllerGrip(idx);
    grip.add(controllerModelFactory.createControllerModel(grip));
    scene.add(grip);
    controllers.push(c);
  }
  makeController(0);
  makeController(1);

  const raycaster = new THREE.Raycaster();
  const vrLine = new THREE.Line(vrLineGeo, new THREE.LineBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.6 }));
  vrLine.scale.setScalar(10);
  vrLine.visible = false;
  scene.add(vrLine);

  let vrPoints = [];

  function aim(len, hit) {
    const c = controllers[0];
    vrLine.position.copy(c.position);
    vrLine.quaternion.setFromUnitVectors(VR_MINUS_Z, new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion));
    vrLine.scale.setScalar(len);
    vrLine.visible = true;
    vrLine.material.color.setHex(hit ? 0xffcf5c : 0x3fe0ff);
  }

  function pick(getTargets, priorityTargets) {
    const c = controllers[0];
    if (!renderer.xr.isPresenting || !c || !c.visible) {
      vrLine.visible = false;
      vrPoints = [];
      return null;
    }
    const origin = c.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    raycaster.set(origin, dir);
    // priority targets win over occluders (e.g. the return door behind a
    // room's giant atom hologram)
    let hits = [];
    if (priorityTargets) {
      const pt = typeof priorityTargets === 'function' ? priorityTargets() : priorityTargets;
      if (pt && pt.length) hits = raycaster.intersectObjects(pt, true);
    }
    if (!hits.length) hits = raycaster.intersectObjects(getTargets(), true);
    vrPoints = hits;
    if (hits.length) {
      aim(hits[0].distance, true);
      return hits[0].object;
    }
    aim(12, false);
    return null;
  }

  return { controllers, pick };
}
