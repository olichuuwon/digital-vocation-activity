// Stage 3 "Build the Logic" scoring (spec §6.3, §3.2). Pure: no React, no DOM.
// Engine: src/sim/grid.ts. Content contract: src/content/stage3Schema.ts.
//
// SCORING (tutorial excluded; only SCORED_LEVEL_IDS count; L4/L5 are dealt in full mode only):
//   hintsUsed   = Σ assist points (hint → 1, answer → 2), solved or not
//   extraBlocks = Σ over solved of max(0, blocks − par)          (feeds the finale logicScore, §3.2)
//   efficiency  = mean over solved of min(1, par / blocks)        (0 if none solved)
//   L4 Debug It only allows swaps, so its block count is fixed by the prebuilt program: it counts
//   as at par (0 extra, efficiency 1) whatever `blocks` says (SWAP_ONLY_LEVEL_IDS).
//   stageScore  = (solved ÷ dealt) × (0.95 + 0.05·efficiency) × max(0.4, 1 − 0.12·hintsUsed)
// Why not logicScore() directly: §6.3 says "solved + under block limit = 3★", so blocks over par
// but within the limit must not cost a star. Efficiency only moves the score inside 0.95–1, so
// everything solved with no help scores ≥ 0.95 whatever the block count, while one hint costs
// 12% (≈ one star with a 0.9 three-star threshold) and a shown answer 24%.
// Suggested stage3.json thresholds: three 0.9, two 0.6, one 0.3.
import { hintLevel, type HintLevel } from '../../state/hints';
import { clamp } from '../../state/scoring';
import type { Scores, StarCount } from '../../state/types';
import type { LogicLevelId } from '../../content/stage3Schema';

export interface LevelOutcome {
  levelId: LogicLevelId;
  solved: boolean;
  /** Help showing when the level was solved or ended. */
  assist: HintLevel;
  /** Blocks in the final program. */
  blocks: number;
  par: number;
  failedRuns: number;
  aiWrongDrops?: number;
}

export const SCORED_LEVEL_IDS: readonly LogicLevelId[] = ['logic-l1', 'logic-l2', 'logic-l3', 'logic-l4', 'logic-l5'];
/** Levels where the player can only swap blocks: block count isn't theirs to choose. */
export const SWAP_ONLY_LEVEL_IDS: readonly LogicLevelId[] = ['logic-l4'];
export const ASSIST_HINTS: Record<HintLevel, number> = { none: 0, hint: 1, answer: 2 };
export const HINT_COST = 0.12;
export const HINT_FLOOR = 0.4;
export const EFFICIENCY_WEIGHT = 0.05;

const scored = (outcomes: readonly LevelOutcome[]): LevelOutcome[] => outcomes.filter((o) => SCORED_LEVEL_IDS.includes(o.levelId));
const swapOnly = (o: LevelOutcome): boolean => SWAP_ONLY_LEVEL_IDS.includes(o.levelId);
const solvedOf = (outcomes: readonly LevelOutcome[]): LevelOutcome[] => scored(outcomes).filter((o) => o.solved);

export function puzzlesSolved(outcomes: readonly LevelOutcome[]): number {
  return solvedOf(outcomes).length;
}

export function hintsUsed(outcomes: readonly LevelOutcome[]): number {
  return scored(outcomes).reduce((s, o) => s + ASSIST_HINTS[o.assist], 0);
}

export function extraBlocks(outcomes: readonly LevelOutcome[]): number {
  return solvedOf(outcomes).reduce((s, o) => s + (swapOnly(o) ? 0 : Math.max(0, o.blocks - o.par)), 0);
}

export function efficiency(outcomes: readonly LevelOutcome[]): number {
  const solved = solvedOf(outcomes);
  if (solved.length === 0) return 0;
  const sum = solved.reduce((s, o) => s + (swapOnly(o) || o.blocks <= 0 ? 1 : Math.min(1, o.par / o.blocks)), 0);
  return sum / solved.length;
}

/** Stage score 0–1 (formula in the header). `dealtLevels` = scored levels in this run length. */
export function stageScore(outcomes: readonly LevelOutcome[], dealtLevels: number): number {
  if (dealtLevels <= 0) return 0;
  const share = Math.min(1, puzzlesSolved(outcomes) / dealtLevels);
  const quality = 1 - EFFICIENCY_WEIGHT + EFFICIENCY_WEIGHT * efficiency(outcomes);
  const help = Math.max(HINT_FLOOR, 1 - HINT_COST * hintsUsed(outcomes));
  return clamp(share * quality * help, 0, 1);
}

/** Stars from the stage score and stage3.json `stars` thresholds. */
export function logicStars(score: number, t: { one: number; two: number; three: number }): StarCount {
  if (score >= t.three) return 3;
  if (score >= t.two) return 2;
  if (score >= t.one) return 1;
  return 0;
}

/** GameState['scores']['logic'] from the scored levels. */
export function toLogicScores(outcomes: readonly LevelOutcome[]): Scores['logic'] {
  return {
    puzzlesSolved: puzzlesSolved(outcomes),
    hintsUsed: hintsUsed(outcomes),
    efficiency: efficiency(outcomes),
    extraBlocks: extraBlocks(outcomes),
  };
}

/** Help to show after `failedRuns` failed runs: hint after 2, answer after 3 (CLAUDE.md rule 8). */
export function nextAssist(failedRuns: number): HintLevel {
  return hintLevel(failedRuns);
}
