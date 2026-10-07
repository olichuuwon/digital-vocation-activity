import { describe, expect, it } from 'vitest';
import {
  recordsFileSchema,
  stage1FileSchema,
  type CardLevel,
  type DataRecord,
  type OutlierChart,
} from '../../content/stage1Schema';
import {
  buildDeck,
  classify,
  classifyBar,
  createLevelState,
  currentAnswer,
  cardPoints,
  dataAccuracy,
  dataStars,
  duplicatesSpaced,
  DUP_MIN_GAP,
  fixOptionMatches,
  isEligible,
  judge,
  judgeOutlier,
  levelAccuracy,
  levelReducer,
  mulberry32,
  normaliseSector,
  normaliseWater,
  isRuleChosen,
  outcomeOf,
  outlierBonus,
  outlierChartScore,
  outlierHintLevel,
  stageScore,
  streakActive,
  toDataScores,
  type Action,
  type LevelOutcome,
  type LevelState,
} from './logic';

// ---------------------------------------------------------------------------
// Fixture: synthetic pool (independent of the designer's records.json)
// ---------------------------------------------------------------------------

let n = 0;
const rec = (p: Partial<DataRecord> & Pick<DataRecord, 'status' | 'rule'>): DataRecord => {
  n++;
  return {
    id: `r${String(n).padStart(3, '0')}`,
    household: `H-${1000 + n}`,
    sector: 'B',
    people: 4,
    water: { value: 50, unit: 'L' },
    ...p,
  };
};

const valids = Array.from({ length: 15 }, (_, i) => rec({ status: 'valid', rule: null, tutorial: i < 2 }));
const pool: DataRecord[] = [
  ...valids,
  rec({ status: 'valid', rule: 5, people: 14 }),
  rec({ status: 'valid', rule: 5, water: { value: 190, unit: 'L' } }),
  rec({ status: 'valid', rule: 5, people: 13 }),
  rec({ status: 'invalid', rule: 1, sector: null, tutorial: true }),
  rec({ status: 'invalid', rule: 1, people: null, tutorial: true }),
  rec({ status: 'invalid', rule: 1, water: null }),
  rec({ status: 'invalid', rule: 1, sector: null }),
  rec({ status: 'invalid', rule: 2, people: 0 }),
  rec({ status: 'invalid', rule: 2, people: 40 }),
  rec({ status: 'invalid', rule: 2, water: { value: 900, unit: 'L' } }),
  rec({ status: 'invalid', rule: 2, water: { value: 2, unit: 'L' } }),
  rec({ status: 'invalid', rule: 2, water: { value: 900000, unit: 'ml' } }),
  ...[0, 1, 2, 3, 4].map((i) => {
    const o = valids[i] as DataRecord;
    return rec({ status: 'invalid', rule: 3, household: o.household, duplicateOf: o.id });
  }),
  rec({ status: 'fixable', rule: 4, sector: 'b', fix: { field: 'sector', options: ['B', 'D', 'Trash'], correct: 0 } }),
  rec({ status: 'fixable', rule: 4, sector: 'Sectr C', fix: { field: 'sector', options: ['S', 'C'], correct: 1 } }),
  rec({ status: 'fixable', rule: 4, sector: 'sector e', fix: { field: 'sector', options: ['F', 'E', 'S'], correct: 1 } }),
  rec({ status: 'fixable', rule: 4, sector: 'd', fix: { field: 'sector', options: ['D', 'B'], correct: 0 } }),
  rec({
    status: 'fixable',
    rule: 4,
    water: { value: 40000, unit: 'ml' },
    fix: { field: 'water', options: ['40 L', '400 L', '4 L'], correct: 0 },
  }),
  rec({
    status: 'fixable',
    rule: 4,
    water: { value: 75000, unit: 'ml' },
    fix: { field: 'water', options: ['7.5 L', '75 L'], correct: 1 },
  }),
  rec({ status: 'fixable', rule: 4, sector: 'a', fix: { field: 'sector', options: ['A', 'E'], correct: 0 } }),
  rec({ status: 'fixable', rule: 4, sector: 'Secter F', fix: { field: 'sector', options: ['F', 'E'], correct: 0 } }),
];

const tutorial: CardLevel = {
  id: 'data-tutorial',
  count: 3,
  seconds: null,
  rules: [1],
  newRules: [1],
  allowFix: false,
  mix: { valid: 1, fixable: 0, invalid: 1 },
};
const l1: CardLevel = {
  id: 'data-l1',
  count: 10,
  seconds: 40,
  rules: [1, 2, 3],
  newRules: [2, 3],
  allowFix: false,
  mix: { valid: 4, fixable: 0, invalid: 4 },
};
const l2: CardLevel = {
  id: 'data-l2',
  count: 10,
  seconds: 60,
  rules: [1, 2, 3, 4, 5],
  newRules: [4, 5],
  allowFix: true,
  mix: { valid: 3, fixable: 3, invalid: 3 },
};
const LEVELS = [tutorial, l1, l2];
const byId = new Map(pool.map((r) => [r.id, r]));
const pick = (pred: (r: DataRecord) => boolean) => pool.find(pred) as DataRecord;

describe('fixture', () => {
  it('passes the content schema and agrees with classify', () => {
    expect(recordsFileSchema.safeParse({ records: pool }).success).toBe(true);
    for (const r of pool) {
      const seen = r.duplicateOf ? new Set([r.household]) : undefined;
      const c = classify(r, seen);
      expect([r.id, c.status, c.rule]).toEqual([r.id, r.status, r.rule]);
    }
  });
});

// ---------------------------------------------------------------------------
// RNG + normalisers + classify
// ---------------------------------------------------------------------------

describe('mulberry32', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = Array.from({ length: 100 }, () => a());
    expect(Array.from({ length: 100 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 100 }, () => c())).not.toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('normalisers', () => {
  it('normaliseWater converts ml to L and passes null', () => {
    expect(normaliseWater(null)).toBeNull();
    expect(normaliseWater({ value: 40, unit: 'L' })).toBe(40);
    expect(normaliseWater({ value: 40000, unit: 'ml' })).toBe(40);
    expect(normaliseWater({ value: 7500, unit: 'ml' })).toBe(7.5);
  });
  it('normaliseSector handles clean, lowercase, typos and junk', () => {
    expect(normaliseSector('B')).toEqual({ value: 'B', fixed: false });
    expect(normaliseSector('b')).toEqual({ value: 'B', fixed: true });
    expect(normaliseSector('Sectr B')).toEqual({ value: 'B', fixed: true });
    expect(normaliseSector(null)).toBeNull();
    expect(normaliseSector('Z')).toBeNull();
    expect(normaliseSector('Banana')).toBeNull();
  });
  it('classify follows rule precedence and flags junk', () => {
    const base = pick((r) => r.status === 'valid' && r.rule === null);
    expect(classify({ ...base, sector: null, people: 0 }).rule).toBe(1);
    expect(classify(base, new Set([base.household])).rule).toBe(3);
    expect(classify({ ...base, sector: 'b', people: 0 }).rule).toBe(2); // range beats fixable
    expect(classify({ ...base, water: { value: 40000, unit: 'ml' } }).fix).toEqual({ field: 'water', value: '40 L' });
    expect(classify({ ...base, people: 15 })).toEqual({ status: 'valid', rule: 5 });
    expect(classify({ ...base, people: 16 }).rule).toBe(2);
    expect(classify({ ...base, sector: 'Q' }).note).toMatch(/unrecognised/);
  });
  it('fixOptionMatches compares loosely', () => {
    expect(fixOptionMatches('40 L', 'water', '40 L')).toBe(true);
    expect(fixOptionMatches('40L', 'water', '40 L')).toBe(true);
    expect(fixOptionMatches('400 L', 'water', '40 L')).toBe(false);
    expect(fixOptionMatches('B', 'sector', 'B')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildDeck
// ---------------------------------------------------------------------------

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 1);

describe('buildDeck', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    for (const level of LEVELS) {
      const a = buildDeck(pool, level, mulberry32(123)).map((r) => r.id);
      const b = buildDeck(pool, level, mulberry32(123)).map((r) => r.id);
      expect(a).toEqual(b);
    }
    const decks = new Set(SEEDS.slice(0, 20).map((s) => buildDeck(pool, l2, mulberry32(s)).map((r) => r.id).join()));
    expect(decks.size).toBeGreaterThan(15);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))(
    '%s: count, mix, eligibility, no repeats, duplicates after originals (500 seeds)',
    (_id, level) => {
      let sawDuplicate = false;
      for (const seed of SEEDS) {
        const deck = buildDeck(pool, level, mulberry32(seed));
        expect(deck).toHaveLength(level.count);
        const ids = deck.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of ['valid', 'fixable', 'invalid'] as const) {
          expect(deck.filter((r) => r.status === s).length).toBeGreaterThanOrEqual(level.mix[s]);
        }
        const seen = new Set<string>();
        deck.forEach((r, i) => {
          expect(isEligible(r, level)).toBe(true);
          if (r.duplicateOf) {
            sawDuplicate = true;
            const oi = ids.indexOf(r.duplicateOf);
            expect(oi).toBeGreaterThanOrEqual(0);
            expect(i - oi).toBeGreaterThanOrEqual(DUP_MIN_GAP);
          } else {
            expect(seen.has(r.household)).toBe(false); // no accidental household collisions
          }
          seen.add(r.household);
        });
        if (level.id === 'data-tutorial') expect(deck.every((r) => r.tutorial)).toBe(true);
        if (!level.allowFix) expect(deck.some((r) => r.status === 'fixable')).toBe(false);
        if (!level.rules.includes(4)) expect(deck.some((r) => r.water?.unit === 'ml')).toBe(false);
        expect(duplicatesSpaced(deck)).toBe(true);
        if (level.id !== 'data-tutorial' && level.rules.includes(3)) expect(deck.some((r) => r.rule === 3)).toBe(true);
        if (level.id !== 'data-tutorial' && level.rules.includes(5)) expect(deck.some((r) => r.rule === 5)).toBe(true);
      }
      if (level.rules.includes(3)) expect(sawDuplicate).toBe(true);
    },
  );

  it('throws when the pool cannot satisfy the level', () => {
    expect(() => buildDeck(pool.slice(0, 3), l2, mulberry32(1))).toThrow(/can't satisfy/);
  });
});

// ---------------------------------------------------------------------------
// judge
// ---------------------------------------------------------------------------

describe('judge', () => {
  const valid = pick((r) => r.status === 'valid' && r.rule === null);
  const outlier = pick((r) => r.rule === 5);
  const invalid = pick((r) => r.rule === 2);
  const dup = pick((r) => r.rule === 3);
  const fixable = pick((r) => r.status === 'fixable');
  const right = fixable.fix?.correct ?? 0;
  const wrong = right === 0 ? 1 : 0;

  it.each<[string, DataRecord, Action, CardLevel, string, string, number | null]>([
    ['valid keep', valid, 'keep', l2, 'correct', 'keep', null],
    ['valid trash', valid, 'trash', l2, 'wrongTrashValid', 'keep', null],
    ['valid fix', valid, { fix: 0 }, l2, 'fixInsteadOfKeep', 'keep', null],
    ['outlier keep', outlier, 'keep', l2, 'correct', 'keep', 5],
    ['outlier trash', outlier, 'trash', l2, 'wrongTrashValid', 'keep', 5],
    ['invalid trash', invalid, 'trash', l2, 'correct', 'trash', 2],
    ['invalid keep', invalid, 'keep', l2, 'wrongKeep', 'trash', 2],
    ['invalid fix', invalid, { fix: 0 }, l2, 'fixInsteadOfTrash', 'trash', 2],
    ['duplicate keep', dup, 'keep', l1, 'wrongKeep', 'trash', 3],
    ['fixable right fix', fixable, { fix: right }, l2, 'correct', 'fix', 4],
    ['fixable wrong fix', fixable, { fix: wrong }, l2, 'wrongFix', 'fix', 4],
    ['fixable keep', fixable, 'keep', l2, 'keepUnfixed', 'fix', 4],
    ['fixable trash', fixable, 'trash', l2, 'wrongTrashFixable', 'fix', 4],
    ['fixable, no Fix in level: keep ok', fixable, 'keep', l1, 'correct', 'trash', 4],
    ['fixable, no Fix in level: trash ok', fixable, 'trash', l1, 'correct', 'trash', 4],
  ])('%s', (_name, record, action, level, kind, expected, rule) => {
    const res = judge(record, action, level);
    expect(res.kind).toBe(kind);
    expect(res.correct).toBe(kind === 'correct');
    expect(res.expected).toBe(expected);
    expect(res.rule).toBe(rule);
  });

  it('flags a correct fix as fixed and exposes the right option', () => {
    expect(judge(fixable, { fix: wrong }, l2).correctFix).toBe(right);
    expect(judge(fixable, { fix: right }, l2).fixed).toBe(true);
    expect(judge(fixable, 'keep', l2).fixed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// levelReducer: hint ladder (per level), streak, time-up
// ---------------------------------------------------------------------------

const rightAction = (s: LevelState): Action => {
  const a = currentAnswer(s);
  if (!a) throw new Error('no card');
  return a.expected === 'fix' ? { fix: a.fixIndex ?? 0 } : a.expected;
};
const wrongAction = (s: LevelState): Action => {
  const a = currentAnswer(s);
  return a?.expected === 'keep' ? 'trash' : 'keep';
};

describe('levelReducer', () => {
  const deck = buildDeck(pool, l2, mulberry32(7));
  const start = createLevelState(l2, deck);
  const step = (s: LevelState, ok: boolean) => levelReducer(s, { type: 'decide', action: ok ? rightAction(s) : wrongAction(s) });

  it('hint ladder per level: w=0/1 none, w=2 → next card hint, w≥3 → next card answer; correct answers do not reset w', () => {
    let s = start;
    expect(s.hint).toBe('none');
    s = step(s, false);
    expect([s.wrongCount, s.hint]).toEqual([1, 'none']);
    s = step(s, true);
    expect([s.wrongCount, s.hint]).toEqual([1, 'none']);
    s = step(s, false);
    expect([s.wrongCount, s.hint]).toEqual([2, 'hint']);
    s = step(s, true); // hinted card answered right: 0.75
    expect(s.results.at(-1)).toMatchObject({ assist: 'hint', points: 0.75 });
    expect([s.wrongCount, s.hint]).toEqual([2, 'none']); // only the NEXT card is hinted
    s = step(s, false);
    expect([s.wrongCount, s.hint]).toEqual([3, 'answer']);
    s = step(s, true); // answered card right: 0.5
    expect(s.results.at(-1)).toMatchObject({ assist: 'answer', points: 0.5 });
    expect(s.hint).toBe('none');
    s = step(s, false);
    expect([s.wrongCount, s.hint]).toEqual([4, 'answer']);
    s = step(s, false); // wrong on an answered card: 0 points, still answer next
    expect(s.results.at(-1)).toMatchObject({ assist: 'answer', points: 0 });
    expect(s.hint).toBe('answer');
  });

  it('w is per level: a new level starts at none', () => {
    let s = start;
    for (let i = 0; i < 3; i++) s = step(s, false);
    expect(s.hint).toBe('answer');
    expect(createLevelState(l2, deck).hint).toBe('none');
  });

  it('tracks streaks (3+) and best streak', () => {
    let s = start;
    for (let i = 0; i < 2; i++) s = step(s, true);
    expect(streakActive(s)).toBe(false);
    s = step(s, true);
    expect(streakActive(s)).toBe(true);
    s = step(s, false);
    expect([s.streak, s.bestStreak]).toEqual([0, 3]);
  });

  it('completes after the last card, counts fixes, and ignores later events', () => {
    let s = start;
    while (!s.done) s = step(s, true);
    expect(s.endReason).toBe('complete');
    expect(s.results).toHaveLength(deck.length);
    expect(s.fixedCount).toBe(deck.filter((r) => r.status === 'fixable').length);
    expect(levelAccuracy(s.results, deck.length)).toBe(1);
    expect(levelReducer(s, { type: 'decide', action: 'keep' })).toBe(s);
  });

  it('time-up: unanswered cards score 0, stay in the denominator, and are not wrong decisions', () => {
    let s = start;
    for (let i = 0; i < 3; i++) s = step(s, true);
    s = levelReducer(s, { type: 'timeUp' });
    expect([s.done, s.endReason, s.index, s.wrongCount]).toEqual([true, 'timeUp', 3, 0]);
    expect(levelAccuracy(s.results, deck.length)).toBeCloseTo(3 / 10);
    expect(levelReducer(s, { type: 'timeUp' })).toBe(s);
  });
});

// ---------------------------------------------------------------------------
// Outlier level
// ---------------------------------------------------------------------------

describe('judgeOutlier', () => {
  const values = [4, 5, 3, 0, 6, 14, 2, 4, 40, 5, 3, 13, 4, 6, 5, 3, 4, 2, 5, 4];
  const chart: OutlierChart = {
    id: 'c1',
    measure: 'people',
    bars: values.map((value, i) => ({ household: `H-${2000 + i}`, value })),
    errors: [3, 8],
  };

  it('classifyBar separates errors from unusual-but-legal', () => {
    expect(classifyBar('people', 0)).toBe('error');
    expect(classifyBar('people', 14)).toBe('unusual');
    expect(classifyBar('people', 4)).toBe('normal');
    expect(classifyBar('water', 900)).toBe('error');
    expect(classifyBar('water', 190)).toBe('unusual');
    values.forEach((v, i) => expect(classifyBar('people', v) === 'error').toBe(chart.errors.includes(i)));
  });

  it('scores hits, false positives (incl. rule-5 taps) and misses', () => {
    expect(judgeOutlier(chart, [3, 8])).toEqual({ hits: [3, 8], falsePositives: [], unusualTapped: [], misses: [] });
    expect(judgeOutlier(chart, [8, 5, 0, 8, 99])).toEqual({
      hits: [8],
      falsePositives: [0, 5],
      unusualTapped: [5],
      misses: [3],
    });
    expect(judgeOutlier(chart, [])).toEqual({ hits: [], falsePositives: [], unusualTapped: [], misses: [3, 8] });
  });
});

// ---------------------------------------------------------------------------
// SCORING (designer spec)
// ---------------------------------------------------------------------------

const STARS = { one: 0.3, two: 0.65, three: 0.88 };

/** Play a deck with a pattern of R (right) / W (wrong keep/trash, 0 points); '.' stops (time-up). */
function play(level: CardLevel, seed: number, pattern: string): LevelOutcome {
  const deck = buildDeck(pool, level, mulberry32(seed));
  let s = createLevelState(level, deck);
  for (const c of pattern) {
    if (c === '.') {
      s = levelReducer(s, { type: 'timeUp' });
      break;
    }
    s = levelReducer(s, { type: 'decide', action: c === 'R' ? rightAction(s) : wrongAction(s) });
  }
  return outcomeOf(s);
}

describe('scoring', () => {
  const fixable = pick((r) => r.status === 'fixable');
  const valid = pick((r) => r.status === 'valid' && r.rule === null);
  const right = fixable.fix?.correct ?? 0;

  it('cardPoints: right 1 / hinted 0.75 / answered 0.5; wrong fix 0.5; keep/trash on fixable 0; fix on non-fixable 0', () => {
    expect(cardPoints(judge(valid, 'keep', l2), 'none')).toBe(1);
    expect(cardPoints(judge(valid, 'keep', l2), 'hint')).toBe(0.75);
    expect(cardPoints(judge(valid, 'keep', l2), 'answer')).toBe(0.5);
    const wf = judge(fixable, { fix: right === 0 ? 1 : 0 }, l2);
    expect([wf.correct, cardPoints(wf, 'none')]).toEqual([false, 0.5]);
    expect(cardPoints(judge(fixable, { fix: right }, l2), 'none')).toBe(1);
    expect(cardPoints(judge(fixable, 'keep', l2), 'none')).toBe(0);
    expect(cardPoints(judge(fixable, 'trash', l2), 'none')).toBe(0);
    expect(cardPoints(judge(valid, { fix: 0 }, l2), 'none')).toBe(0);
  });

  it('wrong fix counts as a wrong decision (drives the hint ladder)', () => {
    let s = createLevelState(l2, [fixable, fixable, valid]);
    s = levelReducer(s, { type: 'decide', action: { fix: right === 0 ? 1 : 0 } });
    s = levelReducer(s, { type: 'decide', action: { fix: right === 0 ? 1 : 0 } });
    expect([s.wrongCount, s.hint, s.results[0]?.points, s.fixedCount]).toEqual([2, 'hint', 0.5, 0]);
  });

  it('tutorial counts for nothing; accuracy = points / cards dealt over L1 + L2', () => {
    const tut = play(tutorial, 1, 'WWW');
    const a = play(l1, 1, 'RRRRRRRRRR');
    const b = play(l2, 1, 'RRRRR.');
    expect(dataAccuracy([tut, a, b])).toBeCloseTo(15 / 20);
    expect(toDataScores([tut, a, b], true)).toMatchObject({ accuracy: 0.75, ruleChosen: true });
  });

  // Hand-computed runs, one per star band.
  it('3★ careful player: 19/20, one early miss, picks dupes', () => {
    // L1 perfect = 10. L2: one wrong at card 1 (w=1, no hint) → 9. 19/20 = 0.95.
    const acc = dataAccuracy([play(l1, 2, 'RRRRRRRRRR'), play(l2, 2, 'WRRRRRRRRR')]);
    expect(acc).toBeCloseTo(0.95);
    const score = stageScore({ accuracy: acc, ruleChosen: true, outlier: null });
    expect(score).toBeCloseTo(0.955); // 0.855 + 0.1
    expect(dataStars(score, STARS)).toBe(3);
    expect(dataStars(stageScore({ accuracy: acc, ruleChosen: false, outlier: null }), STARS)).toBe(2); // 0.855
  });

  it('2★ first-timer: 15/20 right with hints, picks dupes', () => {
    // L1: wrongs at 2,6 → card 7 hinted (0.75): 7 + 0.75 = 7.75.
    // L2: wrongs at 3,5,8 → card 6 hinted (0.75), card 9 answered (0.5): 5 + 0.75 + 0.5 = 6.25.
    const acc = dataAccuracy([play(l1, 3, 'RWRRRWRRRR'), play(l2, 3, 'RRWRWRRWRR')]);
    expect(acc).toBeCloseTo(14 / 20);
    const score = stageScore({ accuracy: acc, ruleChosen: true, outlier: null });
    expect(score).toBeCloseTo(0.73); // 0.63 + 0.1
    expect(dataStars(score, STARS)).toBe(2);
  });

  it('1★ struggling: time runs out half way in both levels', () => {
    // L1: R R W W R(hint .75) R . → 3.75. L2: W R R R R . → 4. 7.75/20 = 0.3875.
    const acc = dataAccuracy([play(l1, 4, 'RRWWRR.'), play(l2, 4, 'WRRRR.')]);
    expect(acc).toBeCloseTo(7.75 / 20);
    const score = stageScore({ accuracy: acc, ruleChosen: false, outlier: null });
    expect(score).toBeCloseTo(0.34875);
    expect(dataStars(score, STARS)).toBe(1);
  });

  it('0★: almost nothing answered', () => {
    const acc = dataAccuracy([play(l1, 5, 'RR.'), play(l2, 5, 'W.')]);
    expect(acc).toBeCloseTo(0.1);
    expect(dataStars(stageScore({ accuracy: acc, ruleChosen: false, outlier: null }), STARS)).toBe(0);
  });

  it('stage score caps at 1 and outlier adds 0.05 in full mode only', () => {
    expect(stageScore({ accuracy: 1, ruleChosen: true, outlier: 1 })).toBe(1);
    expect(stageScore({ accuracy: 0.8, ruleChosen: false, outlier: 1 })).toBeCloseTo(0.77);
    expect(stageScore({ accuracy: 0.8, ruleChosen: false, outlier: null })).toBeCloseTo(0.72);
  });

  it('isRuleChosen', () => {
    const opts = [
      { id: 'big-households', correct: false },
      { id: 'dupes', correct: true },
    ];
    expect([isRuleChosen(opts, 'dupes'), isRuleChosen(opts, 'big-households'), isRuleChosen(opts, null)]).toEqual([true, false, false]);
  });

  it('dataStars maps thresholds at the edges', () => {
    expect([0.29, 0.3, 0.65, 0.88].map((x) => dataStars(x, STARS))).toEqual([0, 1, 2, 3]);
  });
});

describe('outlier bonus', () => {
  const chart: OutlierChart = {
    id: 'c',
    measure: 'people',
    bars: [4, 0, 40, 14, 3, 5, 2, 6, 4, 3, 5, 4, 2, 3, 6, 5, 4, 3, 2, 4].map((value, i) => ({ household: `H-${3000 + i}`, value })),
    errors: [1, 2],
  };
  it('per chart max(0, (errorsTapped − legalTapped) / errors), capped at 1', () => {
    expect(outlierChartScore(judgeOutlier(chart, [1, 2]))).toBe(1);
    expect(outlierChartScore(judgeOutlier(chart, [1, 2, 1, 2]))).toBe(1);
    expect(outlierChartScore(judgeOutlier(chart, [1, 2, 3]))).toBe(0.5);
    expect(outlierChartScore(judgeOutlier(chart, [1, 3, 4]))).toBe(0); // floor
    expect(outlierChartScore(judgeOutlier(chart, []))).toBe(0);
  });
  it('averages over charts; unplayed charts count 0 when chartCount given', () => {
    const full = judgeOutlier(chart, [1, 2]);
    const half = judgeOutlier(chart, [1]);
    expect(outlierBonus([full, half])).toBeCloseTo(0.75);
    expect(outlierBonus([full], 3)).toBeCloseTo(1 / 3);
    expect(outlierBonus([])).toBe(0);
  });
  it('helper level from wrong taps: 2 range, 3 flash', () => {
    expect([0, 1, 2, 3, 5].map(outlierHintLevel)).toEqual(['none', 'none', 'hint', 'answer', 'answer']);
  });
});

// ---------------------------------------------------------------------------
// Content cross-check (records.json / stage1.json from the game-designer)
// ---------------------------------------------------------------------------

const recordsMod = import.meta.glob('../../content/records.json', { eager: true, import: 'default' });
const stage1Mod = import.meta.glob('../../content/stage1.json', { eager: true, import: 'default' });
const recordsJson = Object.values(recordsMod)[0];
const stage1Json = Object.values(stage1Mod)[0];

describe.skipIf(!recordsJson)('content: records.json cross-check (skipped: src/content/records.json not found)', () => {
  const records = recordsJson ? recordsFileSchema.parse(recordsJson).records : [];
  const map = new Map(records.map((r) => [r.id, r]));

  it.each(records.map((r) => [r.id, r] as const))('%s status/rule match the rulebook', (_id, r) => {
    const seen = r.duplicateOf ? new Set([map.get(r.duplicateOf)?.household ?? '']) : undefined;
    const c = classify(r, seen);
    expect(c.note, c.note).toBeUndefined();
    expect({ status: c.status, rule: c.rule }).toEqual({ status: r.status, rule: r.rule });
    if (r.fix && c.fix) {
      expect(r.fix.field).toBe(c.fix.field);
      const opt = r.fix.options[r.fix.correct] ?? '';
      expect(fixOptionMatches(opt, c.fix.field, c.fix.value), `${opt} vs ${c.fix.value}`).toBe(true);
      const others = r.fix.options.filter((_, i) => i !== r.fix?.correct);
      expect(others.some((o) => fixOptionMatches(o, c.fix!.field, c.fix!.value))).toBe(false);
    }
  });

  it('households are unique except declared duplicates; originals are not duplicates', () => {
    const seen = new Map<string, string>();
    for (const r of records) {
      if (r.duplicateOf) {
        expect(map.get(r.duplicateOf)?.duplicateOf).toBeUndefined();
        continue;
      }
      expect(seen.get(r.household), `${r.id} reuses ${r.household}`).toBeUndefined();
      seen.set(r.household, r.id);
    }
  });

  it.skipIf(!stage1Json)('buildDeck honours every deck rule for every level over 500 seeds', () => {
    const s1 = stage1FileSchema.parse(stage1Json);
    for (const level of s1.levels) {
      for (const seed of SEEDS) {
        const deck = buildDeck(records, level, mulberry32(seed));
        const tag = `${level.id} seed ${seed}`;
        expect(deck, tag).toHaveLength(level.count);
        expect(new Set(deck.map((r) => r.id)).size, tag).toBe(level.count);
        for (const st of ['valid', 'fixable', 'invalid'] as const) {
          expect(deck.filter((r) => r.status === st).length, tag).toBeGreaterThanOrEqual(level.mix[st]);
        }
        expect(deck.every((r) => r.rule === null || level.rules.includes(r.rule)), tag).toBe(true);
        if (level.id === 'data-tutorial') expect(deck.every((r) => r.tutorial), tag).toBe(true);
        if (!level.allowFix) expect(deck.some((r) => r.status === 'fixable'), tag).toBe(false);
        if (!level.rules.includes(4)) expect(deck.some((r) => r.water?.unit === 'ml'), tag).toBe(false);
        if (level.id === 'data-l1' || level.id === 'data-l2') {
          expect(deck.some((r) => r.rule === 3), tag).toBe(true);
          deck.forEach((r, i) => {
            if (r.duplicateOf) expect(i - deck.findIndex((o) => o.id === r.duplicateOf), tag).toBeGreaterThanOrEqual(2);
          });
        }
        if (level.id === 'data-l2') expect(deck.some((r) => r.rule === 5), tag).toBe(true);
      }
    }
  });
});

describe.skipIf(!stage1Json)('content: stage1.json outlier charts (skipped: src/content/stage1.json not found)', () => {
  const s1 = stage1Json ? stage1FileSchema.parse(stage1Json) : null;
  it.each((s1?.outlier.charts ?? []).map((c) => [c.id, c] as const))('%s errors match rule 2', (_id, chart) => {
    chart.bars.forEach((b, i) => {
      expect(classifyBar(chart.measure, b.value) === 'error', `bar ${i} = ${b.value}`).toBe(chart.errors.includes(i));
    });
  });
});

// Keep the fixture map referenced (also documents that duplicates point at real originals).
it('fixture duplicates reference existing originals', () => {
  for (const r of pool) if (r.duplicateOf) expect(byId.has(r.duplicateOf)).toBe(true);
});
