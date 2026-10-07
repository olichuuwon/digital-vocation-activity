import { describe, expect, it } from 'vitest';
import type { LogicLevelId } from '../../content/stage3Schema';
import { logicScore } from '../../state/scoring';
import {
  efficiency,
  extraBlocks,
  hintsUsed,
  logicStars,
  nextAssist,
  puzzlesSolved,
  SCORED_LEVEL_IDS,
  stageScore,
  toLogicScores,
  type LevelOutcome,
} from './logic';

const o = (levelId: LogicLevelId, over: Partial<LevelOutcome> = {}): LevelOutcome => ({
  levelId,
  solved: true,
  assist: 'none',
  blocks: 5,
  par: 5,
  failedRuns: 0,
  ...over,
});
const T = { one: 0.3, two: 0.6, three: 0.9 };

describe('stage 3 aggregates', () => {
  it('excludes the tutorial', () => {
    expect(SCORED_LEVEL_IDS).not.toContain('logic-tutorial');
    const outs = [o('logic-tutorial', { assist: 'answer', blocks: 9, par: 2 }), o('logic-l1')];
    expect(puzzlesSolved(outs)).toBe(1);
    expect(hintsUsed(outs)).toBe(0);
    expect(extraBlocks(outs)).toBe(0);
  });

  it('Debug It (L4) counts as at par: its block count is fixed by the prebuilt program', () => {
    const outs = [o('logic-l4', { blocks: 9, par: 7 })];
    expect(extraBlocks(outs)).toBe(0);
    expect(efficiency(outs)).toBe(1);
  });

  it('counts hints (hint 1, answer 2), extra blocks and efficiency', () => {
    const outs = [
      o('logic-l1', { assist: 'hint', blocks: 8, par: 6 }),
      o('logic-l2', { assist: 'answer', blocks: 4, par: 4 }),
      o('logic-l3', { solved: false, assist: 'hint', blocks: 9, par: 6 }),
    ];
    expect(hintsUsed(outs)).toBe(4);
    expect(extraBlocks(outs)).toBe(2);
    expect(efficiency(outs)).toBeCloseTo((6 / 8 + 1) / 2);
    expect(puzzlesSolved(outs)).toBe(2);
    expect(efficiency([])).toBe(0);
    expect(toLogicScores(outs)).toEqual({ puzzlesSolved: 2, hintsUsed: 4, efficiency: (6 / 8 + 1) / 2, extraBlocks: 2 });
  });
});

describe('stageScore / logicStars', () => {
  const booth = ['logic-l1', 'logic-l2', 'logic-l3'] as const;

  it('all solved without help is 3★ whatever the block count within the limit', () => {
    const atPar = booth.map((id) => o(id));
    const sloppy = booth.map((id) => o(id, { blocks: 8, par: 4 }));
    expect(stageScore(atPar, 3)).toBe(1);
    expect(stageScore(sloppy, 3)).toBeGreaterThanOrEqual(0.95);
    expect(logicStars(stageScore(sloppy, 3), T)).toBe(3);
  });

  it('each hint lowers the score noticeably', () => {
    const one = [o('logic-l1', { assist: 'hint' }), o('logic-l2'), o('logic-l3')];
    const answer = [o('logic-l1', { assist: 'answer' }), o('logic-l2'), o('logic-l3')];
    expect(stageScore(one, 3)).toBeCloseTo(0.88);
    expect(logicStars(stageScore(one, 3), T)).toBe(2);
    expect(stageScore(answer, 3)).toBeLessThan(stageScore(one, 3) - 0.1);
    const many = booth.map((id) => o(id, { assist: 'answer' }));
    expect(stageScore(many, 3)).toBeCloseTo(0.4);
  });

  it('scales by the share solved of the levels dealt', () => {
    expect(stageScore([o('logic-l1'), o('logic-l2')], 3)).toBeCloseTo(2 / 3);
    expect(stageScore([o('logic-l1')], 5)).toBeCloseTo(0.2);
    expect(stageScore([], 3)).toBe(0);
    expect(stageScore([o('logic-l1')], 0)).toBe(0);
    expect(logicStars(0.1, T)).toBe(0);
    expect(logicStars(0.3, T)).toBe(1);
  });

  it('extraBlocks still feeds the finale logicScore', () => {
    const s = toLogicScores([o('logic-l1', { blocks: 8, par: 6 })]);
    expect(logicScore(s.hintsUsed, s.extraBlocks)).toBeCloseTo(0.9);
  });

  it('nextAssist: hint after 2 failed runs, answer after 3', () => {
    expect([0, 1, 2, 3, 7].map(nextAssist)).toEqual(['none', 'none', 'hint', 'answer', 'answer']);
  });
});
