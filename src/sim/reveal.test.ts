import { describe, expect, it } from 'vitest';
import type { Stage2Content } from '../content/stage2Schema';
import { mulberry32 } from '../stages/data/logic';
import {
  centreTiles,
  coveredHint,
  coveredPoints,
  coveredReducer,
  coveredResult,
  coveredShown,
  createCoveredState,
  earlyBonus,
  EARLY_TILES,
  MAX_CENTRE_EARLY,
  revealOrder,
  tilesShown,
} from './reveal';

const cfg: Stage2Content['covered'] = {
  id: 'ai-l2',
  count: 8,
  seconds: 60,
  options: 4,
  grid: 4,
  revealEveryMs: 600,
  startTiles: 1,
  wrongGuessTiles: 1,
  wrongGuessPenalty: 0.2,
  revealCharges: 2,
};

describe('revealOrder', () => {
  it('centre tiles: 2×2 for even, plus-shape for odd grids', () => {
    expect(centreTiles(4)).toEqual([5, 6, 9, 10]);
    expect(centreTiles(3)).toEqual([1, 3, 4, 5, 7]);
    expect(centreTiles(6)).toEqual([14, 15, 20, 21]);
  });

  it('is a permutation, deterministic per seed, and never front-loads the centre', () => {
    for (const grid of [3, 4, 5, 6]) {
      const centre = new Set(centreTiles(grid));
      for (let seed = 1; seed <= 300; seed++) {
        const o = revealOrder(grid, mulberry32(seed));
        expect(o).toEqual(revealOrder(grid, mulberry32(seed)));
        expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: grid * grid }, (_, i) => i));
        expect(o.slice(0, EARLY_TILES).filter((t) => centre.has(t)).length).toBeLessThanOrEqual(MAX_CENTRE_EARLY);
      }
    }
  });

  it('differs between seeds', () => {
    expect(revealOrder(4, mulberry32(1))).not.toEqual(revealOrder(4, mulberry32(2)));
  });
});

describe('tilesShown / earlyBonus', () => {
  it('starts at startTiles, adds one per interval plus extras, caps at total', () => {
    expect(tilesShown(0, cfg, 0)).toBe(1);
    expect(tilesShown(599, cfg, 0)).toBe(1);
    expect(tilesShown(600, cfg, 0)).toBe(2);
    expect(tilesShown(1800, cfg, 2)).toBe(6);
    expect(tilesShown(60_000, cfg, 0)).toBe(16);
    expect(tilesShown(-100, cfg, 0)).toBe(1);
  });
  it('earlyBonus is 1 at startTiles and 0 when fully shown', () => {
    expect(earlyBonus(1, 16, 1)).toBe(1);
    expect(earlyBonus(16, 16, 1)).toBe(0);
    expect(earlyBonus(6, 16, 1)).toBeCloseTo(10 / 15, 10);
    expect(earlyBonus(0, 16, 1)).toBe(1);
  });
});

describe('coveredPoints', () => {
  it('1 for a clean correct guess, minus penalty per wrong, caps by assist, floors at 0', () => {
    expect(coveredPoints({ correct: true, wrongGuesses: 0, assist: 'none' }, 0.2)).toBe(1);
    expect(coveredPoints({ correct: true, wrongGuesses: 1, assist: 'none' }, 0.2)).toBeCloseTo(0.8, 10);
    expect(coveredPoints({ correct: true, wrongGuesses: 2, assist: 'hint' }, 0.1)).toBe(0.75);
    expect(coveredPoints({ correct: true, wrongGuesses: 2, assist: 'hint' }, 0.2)).toBeCloseTo(0.6, 10);
    expect(coveredPoints({ correct: true, wrongGuesses: 3, assist: 'answer' }, 0.1)).toBe(0.5);
    expect(coveredPoints({ correct: true, wrongGuesses: 5, assist: 'answer' }, 0.5)).toBe(0);
    expect(coveredPoints({ correct: false, wrongGuesses: 0, assist: 'none' }, 0.2)).toBe(0);
  });
});

describe('coveredReducer', () => {
  const img = { id: 'ai01', label: 'tent' as const };

  it('ticks forward only and freezes once solved', () => {
    let s = createCoveredState(img, cfg);
    s = coveredReducer(s, { type: 'tick', elapsedMs: 1300 });
    expect(coveredShown(s)).toBe(3);
    expect(coveredReducer(s, { type: 'tick', elapsedMs: 100 })).toBe(s);
    s = coveredReducer(s, { type: 'guess', label: 'tent' });
    expect(s.solved).toBe(true);
    expect(s.shownAtSolve).toBe(3);
    expect(coveredReducer(s, { type: 'tick', elapsedMs: 9999 })).toBe(s);
    const r = coveredResult(s);
    expect(r.points).toBe(1);
    expect(r.bonus).toBeCloseTo(13 / 15, 10);
  });

  it('wrong guesses add tiles, ignore repeats, and climb the hint ladder', () => {
    let s = createCoveredState(img, cfg);
    s = coveredReducer(s, { type: 'guess', label: 'blanket' });
    expect(s.wrongGuesses).toBe(1);
    expect(coveredShown(s)).toBe(2);
    expect(coveredHint(s)).toBe('none');
    expect(coveredReducer(s, { type: 'guess', label: 'blanket' })).toBe(s);
    s = coveredReducer(s, { type: 'guess', label: 'food' });
    expect(coveredHint(s)).toBe('hint');
    s = coveredReducer(s, { type: 'guess', label: 'water' });
    expect(coveredHint(s)).toBe('answer');
    s = coveredReducer(s, { type: 'guess', label: 'tent' });
    expect(s.solved).toBe(true);
    const r = coveredResult(s);
    expect(r.assist).toBe('answer');
    expect(r.points).toBeCloseTo(0.4, 10); // 1 − 3·0.2 = 0.4, under the 0.5 cap
  });

  it('reveal spends a charge per tile and stops at zero charges or full grid', () => {
    let s = createCoveredState(img, cfg, 2);
    s = coveredReducer(s, { type: 'reveal' });
    s = coveredReducer(s, { type: 'reveal' });
    expect(s.charges).toBe(0);
    expect(coveredShown(s)).toBe(3);
    expect(coveredReducer(s, { type: 'reveal' })).toBe(s);
    let full = createCoveredState(img, cfg, 5);
    full = coveredReducer(full, { type: 'tick', elapsedMs: 60_000 });
    expect(coveredReducer(full, { type: 'reveal' })).toBe(full);
  });

  it('still accepts a guess when every tile is shown (bonus 0)', () => {
    let s = coveredReducer(createCoveredState(img, cfg), { type: 'tick', elapsedMs: 60_000 });
    s = coveredReducer(s, { type: 'guess', label: 'tent' });
    expect(coveredResult(s)).toMatchObject({ correct: true, points: 1, bonus: 0 });
  });

  it('unsolved image at time-up scores 0', () => {
    const s = coveredReducer(createCoveredState(img, cfg), { type: 'guess', label: 'food' });
    expect(coveredResult(s)).toMatchObject({ correct: false, points: 0, bonus: 0 });
  });
});
