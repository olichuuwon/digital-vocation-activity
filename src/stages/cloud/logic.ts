// Stage 4 helpers on top of src/sim/cluster.ts. Pure: no React, no DOM.
import type { ClusterConfig, PhaseSummary } from '../../sim/cluster';
import { THREE_STAR_UPTIME } from '../../sim/cluster';
import { clamp } from '../../state/scoring';
import type { Scores } from '../../state/types';

/**
 * How good the app is after Stages 1–3 (§3.2 "a better app means more users"), 0–1:
 * the mean of data accuracy, label accuracy and the share of Stage 3 puzzles solved (out of 3,
 * the booth count). It sets the storm's size via cluster.ts intensityScale.
 */
export function appQuality(scores: Scores): number {
  const logic = clamp(scores.logic.puzzlesSolved / 3, 0, 1);
  return clamp((clamp(scores.data.accuracy, 0, 1) + clamp(scores.ai.labelAccuracy, 0, 1) + logic) / 3, 0, 1);
}

export type Diagnosis =
  | 'perfect'
  | 'overBudget'
  | 'overBudgetShaky'
  | 'overBudgetMinOne'
  | 'tooFewPods'
  | 'thresholdHigh'
  | 'noLoadBalancer'
  | 'noHealing'
  | 'noRolling';

/** Errors share above which the bad update clearly hurt (rolling updates off and no quick Roll back). */
const ERROR_SHARE = 0.02;

/**
 * One teachable reason for the replay result (§7.4 "bad configs fail in teachable ways"): the
 * switches that were off and visibly cost uptime, then pod limits (the cluster hit max pods), then
 * a late threshold. Budget leads only when uptime was fine ("rock solid but pricey"); over budget
 * and shaky gets its own line, and with Min pods at 1 the advice isn't "lower Min pods".
 */
export function diagnose(config: ClusterConfig, s: PhaseSummary): Diagnosis {
  if (s.uptime >= THREE_STAR_UPTIME && s.underBudget) return 'perfect';
  if (!s.underBudget && s.uptime >= THREE_STAR_UPTIME) return config.minPods <= 1 ? 'overBudgetMinOne' : 'overBudget';
  if (!s.underBudget) return 'overBudgetShaky';
  if (!config.loadBalancer) return 'noLoadBalancer';
  if (!config.rollingUpdate && s.errored > ERROR_SHARE) return 'noRolling';
  if (!config.selfHealing && s.crashes > 0) return 'noHealing';
  if (s.peakPods >= config.maxPods) return 'tooFewPods';
  return 'thresholdHigh';
}
