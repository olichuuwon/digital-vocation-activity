// Finale "Mission Live" + Debrief logic (spec §8, formula §3.2). Pure: no React, no DOM.
import type { FinaleContent, Team } from '../../content/finaleSchema';
import { TEAMS } from '../../content/finaleSchema';
import { clamp, familiesReached, logicScore, MAX_FAMILIES } from '../../state/scoring';
import type { GameState, Mode } from '../../state/types';
import { shuffleInPlace, type Rng } from '../data/logic';

/** Scored Stage 3 levels per run length (booth: L1–L3; full adds L4–L5). */
export const LOGIC_DEALT: Record<Mode, number> = { booth: 3, full: 5 };

export interface Pipeline {
  /** Stage 1 accuracy, 0–1. */
  data: number;
  /** §3.2 model accuracy, 0.5–0.98. */
  model: number;
  /** §3.2 logic score (hints, extra blocks), 0.55–1. */
  logic: number;
  /** Stage 4 Kubernetes uptime, 0–1. */
  uptime: number;
  /** §3.2 families before Live Ops. */
  families: number;
}

/**
 * The chain shown in the pipeline reveal (§8.1). modelAccuracy was saved by Stage 2; logic uses
 * the saved hints and extra blocks; uptime is the Phase C (Kubernetes) replay.
 */
export function pipeline(run: GameState): Pipeline {
  const { data, ai, logic, cloud } = run.scores;
  const model = clamp(ai.modelAccuracy, 0.5, 0.98);
  const lg = logicScore(logic.hintsUsed, logic.extraBlocks);
  return { data: clamp(data.accuracy, 0, 1), model, logic: lg, uptime: clamp(cloud.autoUptime, 0, 1), families: familiesReached(model, lg, cloud.autoUptime) };
}

export interface DealtIncident {
  id: string;
  team: Team;
}

/**
 * Deal `count` incidents, shuffled, with at least one per team (§8.2 "one team can't do it
 * alone"), never repeating an incident.
 */
export function dealIncidents(all: FinaleContent['incidents'], count: number, rng: Rng): DealtIncident[] {
  const pool = shuffleInPlace([...all], rng);
  const picked: DealtIncident[] = [];
  for (const team of TEAMS) {
    const i = pool.findIndex((x) => x.team === team);
    if (i >= 0 && picked.length < count) picked.push(...pool.splice(i, 1));
  }
  while (picked.length < count && pool.length) picked.push(pool.shift()!);
  return shuffleInPlace(picked, rng);
}

/** A Live Ops item: an incident for one team, or (group mode) an "all hands" call (team null). */
export interface LiveItem {
  id: string;
  team: Team | null;
}

/**
 * Group mode (§8.2): insert `count` all-hands calls, spread evenly and never first, so the group
 * has warmed up on ordinary routing before everyone has to tap.
 */
export function withAllHands(dealt: readonly DealtIncident[], ids: readonly string[], count: number): LiveItem[] {
  const out: LiveItem[] = [...dealt];
  const n = Math.min(count, ids.length);
  for (let k = n - 1; k >= 0; k--) {
    const at = Math.max(1, Math.round(((k + 1) * dealt.length) / (n + 1)));
    out.splice(at + k, 0, { id: ids[k]!, team: null });
  }
  return out;
}

/** All-hands: complete once every needed member has tapped. */
export function allHandsDone(tapped: readonly string[], needed: readonly string[]): boolean {
  return needed.length > 0 && needed.every((id) => tapped.includes(id));
}

export type RouteResult = 'right' | 'wrong' | 'timeout';

export function routeResult(incident: DealtIncident, routed: Team | null): RouteResult {
  if (routed === null) return 'timeout';
  return routed === incident.team ? 'right' : 'wrong';
}

/** Families after Live Ops: base + reward per right − penalty per wrong/time-out, clamped 0–1200. */
export function liveOpsFamilies(base: number, results: readonly RouteResult[], cfg: { reward: number; penalty: number }): number {
  let f = base;
  for (const r of results) f += r === 'right' ? cfg.reward : -cfg.penalty;
  return Math.round(clamp(f, 0, MAX_FAMILIES));
}

/** Highest rank whose threshold is met. */
export function rankFor(families: number, ranks: FinaleContent['ranks']): string {
  let best = ranks[0]!.id;
  let bestMin = -1;
  for (const r of ranks) if (families >= r.min && r.min > bestMin) {
    best = r.id;
    bestMin = r.min;
  }
  return best;
}

/**
 * "Your C4X Digital match" (§8.3): the four specialisations ranked by normalised stage
 * performance, 0–1 each: data = accuracy; AI = 0.6·labels + 0.4·audit; software = share of
 * puzzles solved × logicScore; cloud = Kubernetes uptime mapped 80% → 0, 99% → 1. Ties keep
 * spec order (data, ai, logic, cloud).
 */
export function matchRanking(run: GameState): { team: Team; score: number }[] {
  const { data, ai, logic, cloud } = run.scores;
  const scores: Record<Team, number> = {
    data: clamp(data.accuracy, 0, 1),
    ai: clamp(0.6 * ai.labelAccuracy + 0.4 * ai.auditCatch, 0, 1),
    logic: clamp((logic.puzzlesSolved / LOGIC_DEALT[run.mode]) * logicScore(logic.hintsUsed, logic.extraBlocks), 0, 1),
    cloud: clamp((cloud.autoUptime - 0.8) / 0.19, 0, 1),
  };
  return TEAMS.map((team) => ({ team, score: scores[team] })).sort((a, b) => b.score - a.score);
}
