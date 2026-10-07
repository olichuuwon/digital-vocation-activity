// Occlusion tile reveal for Stage 2 L2 "Covered Up" (spec §5.1). Pure, no DOM, no Math.random.
//
// The image sits under a grid×grid tile grid. One tile uncovers every `revealEveryMs`. Guessing
// early earns an early bonus. A wrong guess uncovers `wrongGuessTiles` extra tiles and costs
// `wrongGuessPenalty` points. A per-level stock of Reveal charges (solo stand-in for the support
// phone's Reveal power, §3.5.2) uncovers one extra tile each. Hint ladder per image: hint after
// 2 wrong guesses, answer after 3 (src/state/hints.ts), so there is never a dead end.
import type { Label, Stage2Content } from '../content/stage2Schema';
import { hintLevel, type HintLevel } from '../state/hints';

export type Rng = () => number;
export type CoveredConfig = Stage2Content['covered'];
export type RevealTiming = Pick<CoveredConfig, 'grid' | 'revealEveryMs' | 'startTiles'>;

/** First this many tiles of a reveal order hold at most MAX_CENTRE_EARLY centre tiles. */
export const EARLY_TILES = 3;
export const MAX_CENTRE_EARLY = 1;

/**
 * Centre tiles of a grid (row-major indices): the middle 2×2 for even grids; for odd grids the
 * middle tile plus its 4 orthogonal neighbours (a "+"), so grid 3 has 5 centre tiles of 9.
 */
export function centreTiles(grid: number): number[] {
  const out: number[] = [];
  if (grid % 2 === 0) {
    const a = grid / 2 - 1;
    for (const r of [a, a + 1]) for (const c of [a, a + 1]) out.push(r * grid + c);
  } else {
    const m = (grid - 1) / 2;
    out.push((m - 1) * grid + m, m * grid + m - 1, m * grid + m, m * grid + m + 1, (m + 1) * grid + m);
  }
  return out.sort((x, y) => x - y);
}

/**
 * Order in which tiles uncover: a seeded Fisher–Yates shuffle of 0..grid²−1, then repaired so the
 * first EARLY_TILES positions hold at most MAX_CENTRE_EARLY centre tiles (the items are drawn
 * around the canvas centre, so the image is never obvious from the first few tiles). Repair swaps
 * each excess early centre tile with the earliest non-centre tile after the early window, which
 * keeps the result a permutation and deterministic per rng.
 */
export function revealOrder(grid: number, rng: Rng): number[] {
  const n = grid * grid;
  const order = new Array<number>(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i] as number;
    order[i] = order[j] as number;
    order[j] = t;
  }
  const centre = new Set(centreTiles(grid));
  const early = Math.min(EARLY_TILES, n);
  let seen = 0;
  let swapFrom = early;
  for (let i = 0; i < early; i++) {
    if (!centre.has(order[i] as number)) continue;
    if (++seen <= MAX_CENTRE_EARLY) continue;
    while (swapFrom < n && centre.has(order[swapFrom] as number)) swapFrom++;
    if (swapFrom >= n) break;
    const t = order[i] as number;
    order[i] = order[swapFrom] as number;
    order[swapFrom] = t;
    swapFrom++;
  }
  return order;
}

/** Tiles uncovered so far: min(total, startTiles + floor(elapsed / every) + extra). */
export function tilesShown(elapsedMs: number, cfg: RevealTiming, extra: number): number {
  const total = cfg.grid * cfg.grid;
  const ticks = elapsedMs > 0 && cfg.revealEveryMs > 0 ? Math.floor(elapsedMs / cfg.revealEveryMs) : 0;
  const n = cfg.startTiles + ticks + Math.max(0, extra);
  return n < 0 ? 0 : n > total ? total : n;
}

/** 1 when guessed with only `startTiles` showing, falling linearly to 0 when every tile shows. */
export function earlyBonus(shown: number, total: number, startTiles: number): number {
  const span = total - startTiles;
  if (span <= 0) return shown <= startTiles ? 1 : 0;
  const b = (total - shown) / span;
  return b < 0 ? 0 : b > 1 ? 1 : b;
}

/** Score cap by the strongest helper shown on the image. */
export const COVERED_ASSIST_CAP: Record<HintLevel, number> = { none: 1, hint: 0.75, answer: 0.5 };

/**
 * Label-accuracy credit for one covered image: not solved → 0; else 1 − penalty·wrongGuesses,
 * capped at 0.75 if the hint showed and 0.5 if the answer showed, floored at 0.
 */
export function coveredPoints(
  r: { correct: boolean; wrongGuesses: number; assist: HintLevel },
  penalty: number,
): number {
  if (!r.correct) return 0;
  const p = Math.min(1 - penalty * Math.max(0, r.wrongGuesses), COVERED_ASSIST_CAP[r.assist]);
  return p > 0 ? p : 0;
}

// ---------------------------------------------------------------------------
// One covered image
// ---------------------------------------------------------------------------

export interface CoveredState {
  cfg: CoveredConfig;
  imageId: string;
  /** The correct label. */
  label: Label;
  /** Time this image has been on screen (ms). Frozen once solved. */
  elapsedMs: number;
  /** Tiles uncovered by wrong guesses and Reveal taps. */
  extraTiles: number;
  wrongGuesses: number;
  /** Labels guessed so far (wrong ones, then the right one). Repeat guesses are ignored. */
  guessed: Label[];
  /** Reveal charges left for the level (carry this into the next image's state). */
  charges: number;
  solved: boolean;
  /** Tiles showing when the right label was picked; null until solved. */
  shownAtSolve: number | null;
}

export type CoveredAction = { type: 'tick'; elapsedMs: number } | { type: 'guess'; label: Label } | { type: 'reveal' };

export function createCoveredState(image: { id: string; label: Label }, cfg: CoveredConfig, charges = cfg.revealCharges): CoveredState {
  return {
    cfg,
    imageId: image.id,
    label: image.label,
    elapsedMs: 0,
    extraTiles: 0,
    wrongGuesses: 0,
    guessed: [],
    charges: Math.max(0, charges),
    solved: false,
    shownAtSolve: null,
  };
}

export const coveredTotal = (s: CoveredState): number => s.cfg.grid * s.cfg.grid;
export const coveredShown = (s: CoveredState): number => tilesShown(s.elapsedMs, s.cfg, s.extraTiles);
/** Helper showing on this image: 2 wrong → 'hint', 3+ → 'answer'. */
export const coveredHint = (s: CoveredState): HintLevel => hintLevel(s.wrongGuesses);

export function coveredReducer(state: CoveredState, action: CoveredAction): CoveredState {
  if (state.solved) return state;
  switch (action.type) {
    case 'tick':
      return action.elapsedMs > state.elapsedMs ? { ...state, elapsedMs: action.elapsedMs } : state;
    case 'reveal':
      if (state.charges <= 0 || coveredShown(state) >= coveredTotal(state)) return state;
      return { ...state, charges: state.charges - 1, extraTiles: state.extraTiles + 1 };
    case 'guess': {
      if (state.guessed.includes(action.label)) return state;
      const guessed = [...state.guessed, action.label];
      if (action.label === state.label) return { ...state, guessed, solved: true, shownAtSolve: coveredShown(state) };
      return {
        ...state,
        guessed,
        wrongGuesses: state.wrongGuesses + 1,
        extraTiles: state.extraTiles + state.cfg.wrongGuessTiles,
      };
    }
  }
}

export interface CoveredResult {
  imageId: string;
  correct: boolean;
  wrongGuesses: number;
  /** Helper showing when the image ended. */
  assist: HintLevel;
  /** coveredPoints (feeds labelAccuracy). */
  points: number;
  /** earlyBonus at solve; 0 if not solved (feeds earlyGuessBonus). */
  bonus: number;
}

/** Outcome of an image (call when solved, or at time-up for the unsolved current image). */
export function coveredResult(s: CoveredState): CoveredResult {
  const assist = coveredHint(s);
  return {
    imageId: s.imageId,
    correct: s.solved,
    wrongGuesses: s.wrongGuesses,
    assist,
    points: coveredPoints({ correct: s.solved, wrongGuesses: s.wrongGuesses, assist }, s.cfg.wrongGuessPenalty),
    bonus: s.solved && s.shownAtSolve !== null ? earlyBonus(s.shownAtSolve, coveredTotal(s), s.cfg.startTiles) : 0,
  };
}
