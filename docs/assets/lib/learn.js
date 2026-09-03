// =========================================================================
//  learn.js — learning-station primitives (Mayer's multimedia principles).
//  makeStation: a numbered, colour-coded floor station (segmenting +
//  signalling principles: learner-paced, consistent visual language).
//  buildQuizPanel: an interactive retrieval-practice quiz (testing effect,
//  Roediger & Karpicke) with immediate feedback on every answer.
// =========================================================================
import * as THREE from 'three';

import { makeLabel } from './primitives.js';

// ---------------------------------------------------------------------------
//  makeStation(n, opts) — glowing floor disc + number badge + floating title
//  returns { g, disc, num } where disc is the clickable target
// ---------------------------------------------------------------------------
export function makeStation(n, { color = '#3fe0ff', position = [0, 0, 0], title = '' } = {}) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  g.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.045, 8, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.75 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  const num = makeLabel(`${n}`, { color, size: 72, scale: 0.012 });
  num.position.set(0, 1.1, 0);
  g.add(num);
  if (title) {
    const ttl = makeLabel(title, { color: '#aab4c8', size: 26, scale: 0.0075 });
    ttl.position.set(0, 2.35, 0);
    g.add(ttl);
  }
  disc.userData.isStation = true;
  g.position.set(...position);
  return { g, disc, num };
}

// ---------------------------------------------------------------------------
//  buildQuizPanel(opts) — question card + three answer boxes + verdict.
//  Pure UI: the caller repaints via setQuestion()/setVerdict() and reads
//  clicks from userData.quizAnswer / userData.quizNext.
// ---------------------------------------------------------------------------
export function buildQuizPanel({ color = '#ff5c8a', position = [0, 0, 0], width = 10 } = {}) {
  const g = new THREE.Group();
  const qHolder = new THREE.Group();
  qHolder.position.set(0, 3.4, 0);
  g.add(qHolder);

  const boxes = [];
  const boxGeo = new THREE.BoxGeometry(width * 0.42, 1.05, 0.16);
  const mkBoxMat = () => new THREE.MeshStandardMaterial({
    color: 0x0d1424, roughness: 0.55, metalness: 0.25,
    emissive: new THREE.Color(color), emissiveIntensity: 0.07,
  });
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(boxGeo, mkBoxMat());
    box.position.set(0, 1.15 - i * 1.45, 0);
    box.userData.quizAnswer = i;
    g.add(box);
    boxes.push(box);
  }

  const verdict = makeLabel('', { color, size: 30, scale: 0.007 });
  verdict.position.set(0, -3.6, 0);
  g.add(verdict);

  const nextBox = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.95, 0.16), mkBoxMat());
  nextBox.position.set(0, -5.0, 0);
  nextBox.userData.quizNext = true;
  nextBox.visible = false;
  g.add(nextBox);
  const nextLabel = makeLabel('NEXT >', { color, size: 34, scale: 0.0075 });
  nextLabel.position.set(0, -5.0, 0.14);
  nextLabel.raycast = () => {};
  nextLabel.visible = false;
  g.add(nextLabel);

  g.position.set(...position);
  return { g, qHolder, boxes, verdict, nextBox, nextLabel, color };
}

// repaint one answer box (label sprite + state colouring)
export function paintAnswer(quiz, idx, text, state = 'idle') {
  const box = quiz.boxes[idx];
  // replace old label sprite
  const old = box.children[0];
  if (old) { box.remove(old); if (old.material.map) old.material.map.dispose(); }
  const sp = makeLabel(`  ${String.fromCharCode(65 + idx)}.  ${text}  `, {
    color: '#eef2fa', size: 30, scale: 0.0072,
  });
  sp.raycast = () => {};
  sp.position.set(0, 0, 0.14);
  box.add(sp);
  const mat = box.material;
  if (state === 'correct') { mat.emissive.set(0x39e08a); mat.emissiveIntensity = 0.45; }
  else if (state === 'wrong') { mat.emissive.set(0xff5c5c); mat.emissiveIntensity = 0.4; }
  else { mat.emissive.set(quiz.color); mat.emissiveIntensity = 0.07; }
}

// repaint the question card
export function paintQuestion(quiz, text) {
  while (quiz.qHolder.children.length) {
    const c = quiz.qHolder.children[0];
    quiz.qHolder.remove(c);
    if (c.material && c.material.map) c.material.map.dispose();
  }
  const sp = makeLabel(text, { color: '#eef2fa', size: 34, scale: 0.0075 });
  sp.raycast = () => {};
  quiz.qHolder.add(sp);
  return sp;
}

// repaint the verdict line ("" hides it)
export function paintVerdict(quiz, text) {
  const old = quiz.verdict;
  quiz.g.remove(old);
  if (old.material.map) old.material.map.dispose();
  const sp = makeLabel(text, { color: quiz.color, size: 32, scale: 0.008 });
  sp.raycast = () => {};
  sp.position.copy(old.position);
  quiz.g.add(sp);
  quiz.verdict = sp;
  return sp;
}
