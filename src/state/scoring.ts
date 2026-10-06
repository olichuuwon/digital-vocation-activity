// Pure scoring functions. Formulas from docs/GAME_SPEC.md §3.2 (cross-stage dependencies).
// All 0–1 inputs are clamped defensively; values are normalised per §3.1.

/** Upper bound of the finale "families reached" figure (spec §3.2 finale formula). */
export const MAX_FAMILIES = 1200;

/** Clamp `x` into [lo, hi]. NaN is treated as `lo` so bad input never propagates (spec §3.1: values normalised). */
export function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

const unit = (x: number): number => clamp(x, 0, 1);
const nonNeg = (x: number): number => clamp(x, 0, Number.POSITIVE_INFINITY);

/**
 * Model accuracy built from Stage 1 + Stage 2 results (spec §3.2):
 * clamp(0.50 + 0.48 * (0.55*label + 0.30*data + 0.15*audit), 0.5, 0.98).
 */
export function modelAccuracy(aiLabelAccuracy: number, dataAccuracy: number, aiAuditCatch: number): number {
  const mix = 0.55 * unit(aiLabelAccuracy) + 0.3 * unit(dataAccuracy) + 0.15 * unit(aiAuditCatch);
  return clamp(0.5 + 0.48 * mix, 0.5, 0.98);
}

/** Stage 3 logic score (spec §3.2): clamp(1 - 0.08*hints - 0.05*extraBlocks, 0.55, 1). */
export function logicScore(hints: number, extraBlocks: number): number {
  return clamp(1 - 0.08 * nonNeg(hints) - 0.05 * nonNeg(extraBlocks), 0.55, 1);
}

/**
 * Finale formula (spec §3.2):
 * round(1200 * (0.15 + 0.85 * modelAcc * logicScore * (0.25 + 0.75*cloudUptime))).
 */
export function familiesReached(modelAcc: number, logic: number, cloudUptime: number): number {
  const chain = unit(modelAcc) * unit(logic) * (0.25 + 0.75 * unit(cloudUptime));
  return Math.round(MAX_FAMILIES * (0.15 + 0.85 * chain));
}
