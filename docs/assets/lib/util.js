// =========================================================================
//  lib/util.js — tiny shared math / format helpers
// =========================================================================

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Zero-pad a number for room file names ("7" -> "007"). */
export const pad = (n, width = 3) => String(n).padStart(width, '0');
