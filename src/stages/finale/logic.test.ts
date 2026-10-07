import finaleJson from '../../content/finale.json';
import { finaleFileSchema } from '../../content/finaleSchema';
import { newRun } from '../../state/store';
import type { GameState } from '../../state/types';
import { mulberry32 } from '../data/logic';
import { dealIncidents, liveOpsFamilies, matchRanking, pipeline, rankFor, routeResult } from './logic';

const finale = finaleFileSchema.parse(finaleJson);

function runWith(p: Partial<GameState['scores']>): GameState {
  const r = newRun('booth');
  return { ...r, scores: { ...r.scores, ...p } };
}

describe('finale content', () => {
  it('finale.json matches its schema with unique incident ids and ascending ranks', () => {
    const ids = finale.incidents.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mins = finale.ranks.map((r) => r.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(mins[0]).toBe(0);
  });
});

describe('pipeline (§3.2)', () => {
  it('a fresh run sits at the formula floor and a perfect run near 1200', () => {
    expect(pipeline(newRun('booth')).families).toBe(Math.round(1200 * (0.15 + 0.85 * 0.5 * 1 * 0.25)));
    const perfect = runWith({
      data: { accuracy: 1, fixedCount: 3, ruleChosen: true },
      ai: { labelAccuracy: 1, earlyGuessBonus: 1, auditCatch: 1, modelAccuracy: 0.98 },
      logic: { puzzlesSolved: 3, hintsUsed: 0, efficiency: 1, extraBlocks: 0 },
      cloud: { manualUptime: 0.7, autoUptime: 1, costEfficiency: 1 },
    });
    const p = pipeline(perfect);
    expect(p.model).toBe(0.98);
    expect(p.logic).toBe(1);
    expect(p.families).toBe(Math.round(1200 * (0.15 + 0.85 * 0.98)));
  });
});

describe('dealIncidents (§8.2)', () => {
  it('deals the count, no repeats, at least one per team, over many seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = dealIncidents(finale.incidents, finale.liveOps.count, mulberry32(seed));
      expect(d).toHaveLength(finale.liveOps.count);
      expect(new Set(d.map((x) => x.id)).size).toBe(d.length);
      for (const t of ['data', 'ai', 'logic', 'cloud']) expect(d.some((x) => x.team === t)).toBe(true);
    }
  });
});

describe('live ops scoring', () => {
  it('right adds, wrong and time-out subtract, clamped 0–1200', () => {
    const inc = { id: 'inc01', team: 'data' as const };
    expect(routeResult(inc, 'data')).toBe('right');
    expect(routeResult(inc, 'ai')).toBe('wrong');
    expect(routeResult(inc, null)).toBe('timeout');
    const cfg = { reward: 15, penalty: 12 };
    expect(liveOpsFamilies(800, ['right', 'right', 'wrong', 'timeout'], cfg)).toBe(806);
    expect(liveOpsFamilies(1195, ['right'], cfg)).toBe(1200);
    expect(liveOpsFamilies(5, ['wrong'], cfg)).toBe(0);
  });

  it('ranks by threshold', () => {
    expect(rankFor(0, finale.ranks)).toBe(finale.ranks[0]!.id);
    expect(rankFor(1200, finale.ranks)).toBe(finale.ranks[finale.ranks.length - 1]!.id);
  });
});

describe('matchRanking (§8.3)', () => {
  it('puts the strongest stage first and lists all four', () => {
    const r = runWith({ cloud: { manualUptime: 0.6, autoUptime: 0.995, costEfficiency: 1 } });
    const m = matchRanking(r);
    expect(m).toHaveLength(4);
    expect(m[0]!.team).toBe('cloud');
  });
});
