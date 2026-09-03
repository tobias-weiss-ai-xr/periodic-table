// =========================================================================
//  lib/theme.js — shared visual language + element formatting.
//  Everything here is presentation data / formatting used by BOTH the main
//  gallery room (app.js) and the per-element rooms (room.js).
// =========================================================================
import * as THREE from 'three';

// Category palette (dark-theme friendly)
export const CATEGORY_HEX = {
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

export const catHex = (key) => CATEGORY_HEX[key] || '#9aa5b8';
export const catColor = (key) => new THREE.Color(catHex(key));

/** Human label for a category key (from the generated ELEMENT_CATEGORIES). */
export function catLabel(key) {
  const cats = (typeof window !== 'undefined' && window.ELEMENT_CATEGORIES) || [];
  const found = cats.find((c) => c[0] === key);
  return found ? found[1] : (typeof key === 'string' ? key : '');
}

export function fmt(v, digits = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });
}
export function fmtTemp(k) {
  if (k === null || k === undefined || Number.isNaN(k)) return '—';
  return `${(k - 273.15).toFixed(1)}&nbsp;°C`;
}

// ---------------------------------------------------------------------------
//  Detail panel body (shared by the main room's side panel and the room pages)
// ---------------------------------------------------------------------------
export function elementDetailHTML(el) {
  const shells = (el.sh || []).join(' · ');
  const mass = el.m != null ? `${fmt(el.m, 6)} u` : '—';
  return `
    <div class="hdr">
      <div class="big" style="color:${catHex(el.cat)}; border-color:${catHex(el.cat)}44">${el.s}</div>
      <div>
        <div class="name">${el.name}</div>
        <div class="num">atomic number ${el.n}</div>
        <span class="cat-tag" style="background:${catHex(el.cat)}">${catLabel(el.cat)}</span>
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
    ${el.u ? `<div class="learn-block">
      <p class="learn-line"><span class="learn-tag" style="color:#ffcf5c">USES</span> ${el.u.join(' · ')}</p>
      <p class="learn-line"><span class="learn-tag" style="color:#5cff9d">EXPERIMENT</span> ${el.xp}</p>
      <p class="learn-line"><span class="learn-tag" style="color:#b18cff">HISTORY</span> ${el.pn}</p>
    </div>` : ''}
    <p class="cite">Data: Bowserinator/Periodic-Table-JSON · visualisation: The Periodic Table Room</p>
  `;
}
