// Bounding-box maths for Stage 2 Bonus L3 "Draw the Box" (spec §5.1). Pure, no DOM.
// Boxes are [x, y, w, h] on the 100×100 image canvas (src/content/stage2Schema.ts).
import type { Box } from '../content/stage2Schema';

export type BoxGrade = 'perfect' | 'good' | 'miss';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Canvas side in box units. */
export const CANVAS = 100;
/** Smallest box side the player can make (canvas units). */
export const MIN_BOX = 8;

const lim = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Intersection over union of two boxes, 0–1. Symmetric; 1 for identical boxes; 0 for no overlap,
 * touching edges, zero/negative-area boxes or NaN input.
 */
export function iou(a: Box, b: Box): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  if (!(aw > 0 && ah > 0 && bw > 0 && bh > 0)) return 0;
  const ix = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const iy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  if (!(ix > 0 && iy > 0)) return 0;
  const inter = ix * iy;
  const union = aw * ah + bw * bh - inter;
  return union > 0 ? lim(inter / union, 0, 1) : 0;
}

/** ≥ perfect → 'perfect', ≥ good → 'good', else 'miss' (§5.1: 0.75 / 0.5). */
export function boxGrade(value: number, good: number, perfect: number): BoxGrade {
  if (value >= perfect) return 'perfect';
  if (value >= good) return 'good';
  return 'miss';
}

/** Box with w, h in [min, 100] and fully inside the canvas (position shifted in, size kept). */
export function clampBox(box: Box, min = MIN_BOX): Box {
  const w = lim(Number.isFinite(box[2]) ? box[2] : min, min, CANVAS);
  const h = lim(Number.isFinite(box[3]) ? box[3] : min, min, CANVAS);
  const x = lim(Number.isFinite(box[0]) ? box[0] : 0, 0, CANVAS - w);
  const y = lim(Number.isFinite(box[1]) ? box[1] : 0, 0, CANVAS - h);
  return [x, y, w, h];
}

/** Normalised box spanning two points (any order), clipped to the canvas. No minimum size. */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Box {
  const l = lim(Math.min(x1, x2), 0, CANVAS);
  const r = lim(Math.max(x1, x2), 0, CANVAS);
  const t = lim(Math.min(y1, y2), 0, CANVAS);
  const b = lim(Math.max(y1, y2), 0, CANVAS);
  return [l, t, r - l, b - t];
}

/** Move by (dx, dy). Size is preserved; the box stops at the canvas edge. */
export function moveBox(box: Box, dx: number, dy: number, min = MIN_BOX): Box {
  return clampBox([box[0] + dx, box[1] + dy, box[2], box[3]], min);
}

/** Grow (positive) or shrink (negative) by (dw, dh) about the centre, then clamp. */
export function resizeBox(box: Box, dw: number, dh: number, min = MIN_BOX): Box {
  const w = lim(box[2] + dw, min, CANVAS);
  const h = lim(box[3] + dh, min, CANVAS);
  const cx = box[0] + box[2] / 2;
  const cy = box[1] + box[3] / 2;
  return clampBox([cx - w / 2, cy - h / 2, w, h], min);
}

/** Push `v` at least `min` away from `fixed` (keeping its side when possible), inside 0..100. */
function spread(v: number, fixed: number, preferSign: 1 | -1, min: number): number {
  if (Math.abs(v - fixed) >= min) return v;
  let sign: 1 | -1 = v > fixed ? 1 : v < fixed ? -1 : preferSign;
  if (fixed + sign * min > CANVAS || fixed + sign * min < 0) sign = sign === 1 ? -1 : 1;
  return fixed + sign * min;
}

/**
 * Move one corner to canvas point (x, y); the opposite corner stays put. Dragging past the
 * opposite corner flips the box (normalised). Sides never drop below `min`.
 */
export function dragCorner(box: Box, corner: Corner, x: number, y: number, min = MIN_BOX): Box {
  const [bx, by, bw, bh] = clampBox(box, min);
  const left = corner === 'tl' || corner === 'bl';
  const top = corner === 'tl' || corner === 'tr';
  const fx = left ? bx + bw : bx;
  const fy = top ? by + bh : by;
  const px = spread(lim(x, 0, CANVAS), fx, left ? -1 : 1, min);
  const py = spread(lim(y, 0, CANVAS), fy, top ? -1 : 1, min);
  return rectFromPoints(fx, fy, px, py);
}
