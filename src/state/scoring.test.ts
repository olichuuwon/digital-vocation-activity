import { clamp, familiesReached, logicScore, MAX_FAMILIES, modelAccuracy } from './scoring';

describe('clamp', () => {
  it('bounds values and handles NaN', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
    expect(clamp(NaN, 0.2, 1)).toBe(0.2);
  });
});

describe('bounds', () => {
  it('all-zero inputs give minimums', () => {
    expect(modelAccuracy(0, 0, 0)).toBe(0.5);
    expect(logicScore(100, 100)).toBe(0.55);
    const fam = familiesReached(modelAccuracy(0, 0, 0), logicScore(100, 100), 0);
    expect(fam).toBe(Math.round(1200 * (0.15 + 0.85 * 0.5 * 0.55 * 0.25)));
    expect(fam).toBe(250);
  });

  it('all-perfect inputs give maximums', () => {
    expect(modelAccuracy(1, 1, 1)).toBeCloseTo(0.98, 12);
    expect(logicScore(0, 0)).toBe(1);
    const fam = familiesReached(modelAccuracy(1, 1, 1), logicScore(0, 0), 1);
    expect(fam).toBe(Math.round(1200 * (0.15 + 0.85 * 0.98)));
    expect(fam).toBeLessThanOrEqual(MAX_FAMILIES);
  });
});

describe('clamping out-of-range inputs', () => {
  it('modelAccuracy clamps inputs to [0,1]', () => {
    expect(modelAccuracy(5, 5, 5)).toBe(modelAccuracy(1, 1, 1));
    expect(modelAccuracy(-5, -5, -5)).toBe(0.5);
  });
  it('logicScore treats negative counts as 0', () => {
    expect(logicScore(-3, -10)).toBe(1);
  });
  it('familiesReached clamps inputs to [0,1]', () => {
    expect(familiesReached(2, 2, 2)).toBe(MAX_FAMILIES);
    expect(familiesReached(-1, -1, -1)).toBe(Math.round(1200 * 0.15));
  });
});

describe('hand-computed mid values', () => {
  it('modelAccuracy(0.8, 0.6, 0.5) = 0.8336', () => {
    // 0.55*0.8 + 0.30*0.6 + 0.15*0.5 = 0.695; 0.5 + 0.48*0.695 = 0.8336
    expect(modelAccuracy(0.8, 0.6, 0.5)).toBeCloseTo(0.8336, 10);
  });
  it('logicScore(2, 1) = 0.79', () => {
    expect(logicScore(2, 1)).toBeCloseTo(0.79, 10);
  });
  it('familiesReached(0.8336, 0.79, 0.9) = 801', () => {
    // 0.8336*0.79*0.925 = 0.6091532; 0.15 + 0.85*that = 0.66778; *1200 = 801.34
    expect(familiesReached(0.8336, 0.79, 0.9)).toBe(801);
  });
  it('familiesReached(0.5, 1, 0) = 308', () => {
    // 0.15 + 0.85*0.5*1*0.25 = 0.25625; *1200 = 307.5 -> 308
    expect(familiesReached(0.5, 1, 0)).toBe(308);
  });
});

describe('monotonicity', () => {
  const grid = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
  it('better model, logic or uptime never lowers families', () => {
    for (const m of grid)
      for (const l of grid)
        for (let i = 1; i < grid.length; i++) {
          const lo = grid[i - 1]!;
          const hi = grid[i]!;
          expect(familiesReached(m, l, hi)).toBeGreaterThanOrEqual(familiesReached(m, l, lo));
          expect(familiesReached(m, hi, l)).toBeGreaterThanOrEqual(familiesReached(m, lo, l));
          expect(familiesReached(hi, m, l)).toBeGreaterThanOrEqual(familiesReached(lo, m, l));
        }
  });
  it('better stage inputs never lower modelAccuracy; fewer hints/blocks never lower logicScore', () => {
    for (let i = 1; i < grid.length; i++) {
      const [lo, hi] = [grid[i - 1]!, grid[i]!];
      expect(modelAccuracy(hi, 0.5, 0.5)).toBeGreaterThanOrEqual(modelAccuracy(lo, 0.5, 0.5));
      expect(modelAccuracy(0.5, hi, 0.5)).toBeGreaterThanOrEqual(modelAccuracy(0.5, lo, 0.5));
      expect(modelAccuracy(0.5, 0.5, hi)).toBeGreaterThanOrEqual(modelAccuracy(0.5, 0.5, lo));
    }
    for (let n = 0; n < 10; n++) {
      expect(logicScore(n, 0)).toBeGreaterThanOrEqual(logicScore(n + 1, 0));
      expect(logicScore(0, n)).toBeGreaterThanOrEqual(logicScore(0, n + 1));
    }
  });
});
