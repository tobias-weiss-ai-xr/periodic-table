// =========================================================================
//  lib/infocard.js — canvas-painted holographic fact cards (sprites).
//  The main gallery room floats one above a selected element; an element
//  room floats its facts around the atom. Same painter, one source of truth.
// =========================================================================
import * as THREE from 'three';
import { catHex, catLabel, fmt, fmtTemp } from './theme.js';

/** A blank sprite-card with a 2D canvas context. */
export function createCardSprite({ width = 760, height = 300, scale = null } = {}) {
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.96,
  }));
  sp.userData.ctx = ctx;
  if (scale) sp.scale.set(scale[0], scale[1], 1);
  return sp;
}

function beginCard(ctx, W, H, color) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8,11,20,0.86)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.textBaseline = 'alphabetic';
}

/** The standard element fact card (name, symbol, mass, shells, config, …). */
export function paintElementCard(sp, el) {
  const ctx = sp.userData.ctx;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const color = catHex(el.cat);
  beginCard(ctx, W, H, color);

  const mass = el.m != null ? fmt(el.m, 4) : '—';

  ctx.fillStyle = color;
  ctx.font = '700 64px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`${el.s}`, 30, 84);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '600 46px sans-serif';
  ctx.fillText(`${el.name}`, 128, 84);
  ctx.fillStyle = '#8a93a8';
  ctx.font = '30px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`atomic #${el.n} · ${catLabel(el.cat)}`, 128, 122);

  const line = (text, y, c = '#cfd8ea') => {
    ctx.fillStyle = c; ctx.font = '27px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(text, 30, y);
  };
  line(`mass ${mass} u  ·  phase ${el.phase || '—'}`, 168);
  line(`shells ${(el.sh || []).join('  ')}`, 206);
  line(`config ${el.esem || '—'}`, 246);
  line(`melting ${fmtTemp(el.melt)}  ·  boiling ${fmtTemp(el.boil)}  ·  ρ ${el.dens != null ? fmt(el.dens, 2) : '—'} g/cm³`, 282);

  sp.material.map.needsUpdate = true;
}

/** A generic text card: title + up to N mono lines. */
export function paintTextCard(sp, { title, titleColor = '#3fe0ff', lines = [] }) {
  const ctx = sp.userData.ctx;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  beginCard(ctx, W, H, titleColor);

  ctx.fillStyle = titleColor;
  ctx.font = '700 46px sans-serif';
  ctx.fillText(title, 30, 78);
  ctx.strokeStyle = titleColor;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.moveTo(30, 96); ctx.lineTo(W - 30, 96); ctx.stroke();
  ctx.globalAlpha = 1;

  let y = 150;
  for (const ln of lines.slice(0, 5)) {
    ctx.fillStyle = '#cfd8ea';
    ctx.font = '28px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(ln, 30, y);
    y += 46;
  }
  sp.material.map.needsUpdate = true;
}
