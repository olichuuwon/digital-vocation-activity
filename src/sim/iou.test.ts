import { describe, expect, it } from 'vitest';
import type { Box } from '../content/stage2Schema';
import { boxGrade, clampBox, dragCorner, iou, moveBox, rectFromPoints, resizeBox } from './iou';

describe('iou', () => {
  it('identical boxes → 1', () => {
    expect(iou([10, 10, 30, 40], [10, 10, 30, 40])).toBe(1);
  });
  it('disjoint and edge-touching boxes → 0', () => {
    expect(iou([0, 0, 10, 10], [50, 50, 10, 10])).toBe(0);
    expect(iou([0, 0, 10, 10], [10, 0, 10, 10])).toBe(0);
  });
  it('zero-area box → 0', () => {
    expect(iou([0, 0, 0, 10], [0, 0, 10, 10])).toBe(0);
  });
  it('half overlap: two 10×10 boxes offset by 5 → 50/150 = 1/3', () => {
    expect(iou([0, 0, 10, 10], [5, 0, 10, 10])).toBeCloseTo(1 / 3, 10);
  });
  it('containment → inner area / outer area', () => {
    expect(iou([0, 0, 20, 20], [5, 5, 10, 10])).toBeCloseTo(100 / 400, 10);
  });
  it('is symmetric', () => {
    const pairs: [Box, Box][] = [
      [[3, 4, 20, 30], [10, 12, 40, 15]],
      [[0, 0, 50, 50], [25, 25, 50, 50]],
      [[60, 10, 12, 12], [62, 8, 30, 30]],
    ];
    for (const [a, b] of pairs) expect(iou(a, b)).toBe(iou(b, a));
  });
});

describe('boxGrade', () => {
  it('uses ≥ thresholds 0.5 / 0.75', () => {
    expect(boxGrade(0.75, 0.5, 0.75)).toBe('perfect');
    expect(boxGrade(0.9, 0.5, 0.75)).toBe('perfect');
    expect(boxGrade(0.74999, 0.5, 0.75)).toBe('good');
    expect(boxGrade(0.5, 0.5, 0.75)).toBe('good');
    expect(boxGrade(0.49999, 0.5, 0.75)).toBe('miss');
    expect(boxGrade(0, 0.5, 0.75)).toBe('miss');
  });
});

describe('clampBox / moveBox / resizeBox', () => {
  it('keeps the box inside the canvas and at least min size', () => {
    expect(clampBox([-5, -5, 20, 20])).toEqual([0, 0, 20, 20]);
    expect(clampBox([95, 90, 20, 20])).toEqual([80, 80, 20, 20]);
    expect(clampBox([10, 10, 2, 3])).toEqual([10, 10, 8, 8]);
    expect(clampBox([10, 10, 150, 120])).toEqual([0, 0, 100, 100]);
    expect(clampBox([10, 10, 2, 3], 12)).toEqual([10, 10, 12, 12]);
  });
  it('moveBox preserves size and stops at edges', () => {
    expect(moveBox([10, 10, 20, 20], 5, -3)).toEqual([15, 7, 20, 20]);
    expect(moveBox([10, 10, 20, 20], 200, -200)).toEqual([80, 0, 20, 20]);
  });
  it('resizeBox grows and shrinks about the centre', () => {
    expect(resizeBox([40, 40, 20, 20], 10, 4)).toEqual([35, 38, 30, 24]);
    expect(resizeBox([40, 40, 20, 20], -10, -10)).toEqual([45, 45, 10, 10]);
    expect(resizeBox([40, 40, 20, 20], -100, -100)).toEqual([46, 46, 8, 8]);
  });
  it('resizeBox at an edge shifts back inside', () => {
    expect(resizeBox([0, 0, 20, 20], 10, 10)).toEqual([0, 0, 30, 30]);
  });
});

describe('rectFromPoints', () => {
  it('normalises any corner order', () => {
    expect(rectFromPoints(30, 40, 10, 20)).toEqual([10, 20, 20, 20]);
    expect(rectFromPoints(10, 40, 30, 20)).toEqual([10, 20, 20, 20]);
  });
  it('clips to the canvas', () => {
    expect(rectFromPoints(-10, -10, 120, 50)).toEqual([0, 0, 100, 50]);
  });
});

describe('dragCorner', () => {
  const b: Box = [20, 20, 40, 40]; // corners (20,20) – (60,60)
  it('moves the dragged corner, keeps the opposite one', () => {
    expect(dragCorner(b, 'br', 70, 80)).toEqual([20, 20, 50, 60]);
    expect(dragCorner(b, 'tl', 10, 5)).toEqual([10, 5, 50, 55]);
    expect(dragCorner(b, 'tr', 90, 10)).toEqual([20, 10, 70, 50]);
    expect(dragCorner(b, 'bl', 0, 100)).toEqual([0, 20, 60, 80]);
  });
  it('flips when dragged past the opposite corner', () => {
    // br dragged to (10, 10): fixed tl (20,20) → box (10,10)–(20,20).
    expect(dragCorner(b, 'br', 10, 10)).toEqual([10, 10, 10, 10]);
  });
  it('enforces the minimum size', () => {
    expect(dragCorner(b, 'br', 22, 21)).toEqual([20, 20, 8, 8]);
    expect(dragCorner(b, 'tl', 60, 60)).toEqual([52, 52, 8, 8]);
  });
  it('clamps the dragged point to the canvas', () => {
    expect(dragCorner(b, 'br', 150, -50)).toEqual([20, 0, 80, 20]);
  });
  it('flips direction when there is no room for the minimum', () => {
    // fixed corner at the right edge x=100: dragging to x=100 must go left.
    expect(dragCorner([80, 0, 20, 20], 'tl', 100, 0)).toEqual([92, 0, 8, 20]);
  });
});
