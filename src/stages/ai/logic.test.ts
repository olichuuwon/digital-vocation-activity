import { describe, expect, it } from 'vitest';
import { LABELS, type AiImage, type AuditItem, type Box, type Label, type Stage2Content } from '../../content/stage2Schema';
import { modelAccuracy } from '../../state/scoring';
import {
  aiStars,
  auditCatch,
  auditCurrentAnswer,
  auditKind,
  auditPoolProblems,
  auditReducer,
  boxArea,
  boxHintLevel,
  boxScore,
  buildAuditSet,
  buildBoxDeck,
  buildLabelDeck,
  buildTutorialDeck,
  createAuditState,
  createLabelState,
  earlyGuessBonus,
  indexImages,
  isPredictionWrong,
  judgeBox,
  labelAccuracy,
  labelCardPoints,
  labelCurrentAnswer,
  labelOptions,
  labelReducer,
  maxPerClass,
  mulberry32,
  stageScore,
  toAiScores,
  trainingPool,
  type AuditLevelState,
  type LabelLevelState,
} from './logic';

// ---------------------------------------------------------------------------
// Inline fixtures (not the real JSON)
// ---------------------------------------------------------------------------

const BOXES: Box[] = [
  [30, 30, 40, 40], // 16%
  [20, 25, 60, 50], // 30%
  [40, 40, 15, 15], // 2.25% (too small for Draw the Box)
  [5, 5, 90, 90], // 81% (too big)
  [25, 35, 35, 30], // 10.5%
  [35, 20, 30, 60], // 18%
  [30, 30, 45, 45], // 20.25%
];

function makeImages(): AiImage[] {
  const out: AiImage[] = [];
  let n = 1;
  const id = () => `ai${String(n++).padStart(2, '0')}`;
  for (const label of LABELS) {
    for (let k = 0; k < 7; k++) {
      out.push({
        id: id(),
        label,
        variant: 'day',
        bg: 'street',
        box: BOXES[k] as Box,
        style: k % 3,
        decor: [],
        tutorial: k === 0 ? true : undefined,
        source: 'Ship It (in-repo SVG)',
        licence: 'Project-owned',
      });
    }
  }
  for (let k = 0; k < 6; k++) {
    out.push({
      id: id(),
      label: k % 2 === 0 ? 'flooded-road' : 'clear-road',
      variant: 'night',
      bg: 'street',
      box: [20, 50, 60, 40],
      style: 0,
      decor: [],
      tutorial: true, // must still never reach a tutorial deck: night is never training data
      source: 'Ship It (in-repo SVG)',
      licence: 'Project-owned',
    });
  }
  return out;
}

const IMAGES = makeImages();
const BY_ID = indexImages(IMAGES);
const NIGHT = new Set(IMAGES.filter((i) => i.variant === 'night').map((i) => i.id));
const CONFUSABLE: [Label, Label][] = [
  ['flooded-road', 'clear-road'],
  ['blanket', 'tent'],
  ['water', 'food'],
];

const AUDIT_CFG_BASE = { id: 'ai-l4' as const, count: 8, seconds: 40, wrongPerSet: 3, low: 0.6, high: 0.85 };

/** 20 audit items on distinct images: mix of right/wrong and low/high confidence. */
function makeAuditPool(): AuditItem[] {
  const day = IMAGES.filter((i) => i.variant === 'day');
  const pool: AuditItem[] = [];
  for (let k = 0; k < 20; k++) {
    const img = day[k * 2] as AiImage;
    const wrong = k % 3 === 0; // 7 wrong, 13 right
    const other = LABELS.find((l) => l !== img.label) as Label;
    const confidence = [0.45, 0.72, 0.91, 0.55, 0.88, 0.67, 0.95][k % 7] as number;
    pool.push({ id: `au${String(k + 1).padStart(2, '0')}`, imageId: img.id, predicted: wrong ? other : img.label, confidence });
  }
  // Night bias example: high-confidence "clear road" on a flooded night road.
  const night = IMAGES.find((i) => i.variant === 'night' && i.label === 'flooded-road') as AiImage;
  pool.push({ id: 'au21', imageId: night.id, predicted: 'clear-road', confidence: 0.91 });
  return pool;
}
const AUDIT_POOL = makeAuditPool();
const AUDIT_CFG: Stage2Content['audit'] = { ...AUDIT_CFG_BASE, pool: AUDIT_POOL };

// ---------------------------------------------------------------------------

describe('trainingPool / decks', () => {
  it('training pool is day only', () => {
    expect(trainingPool(IMAGES).every((i) => i.variant === 'day')).toBe(true);
    expect(trainingPool(IMAGES)).toHaveLength(56);
  });

  it('label deck is deterministic per seed, distinct, and never contains night images', () => {
    const a = buildLabelDeck(IMAGES, 12, mulberry32(42));
    expect(a.map((i) => i.id)).toEqual(buildLabelDeck(IMAGES, 12, mulberry32(42)).map((i) => i.id));
    expect(a.map((i) => i.id)).not.toEqual(buildLabelDeck(IMAGES, 12, mulberry32(43)).map((i) => i.id));
    expect(new Set(a.map((i) => i.id)).size).toBe(12);
    expect(a.some((i) => NIGHT.has(i.id))).toBe(false);
  });

  it('label deck stays balanced over 300 seeds (counts 8, 12, 20)', () => {
    for (const count of [8, 12, 20]) {
      for (let seed = 1; seed <= 300; seed++) {
        const deck = buildLabelDeck(IMAGES, count, mulberry32(seed));
        expect(deck).toHaveLength(count);
        const per = new Map<Label, number>();
        for (const i of deck) per.set(i.label, (per.get(i.label) ?? 0) + 1);
        expect(per.size).toBe(8);
        for (const n of per.values()) expect(n).toBeLessThanOrEqual(maxPerClass(count));
        expect(deck.some((i) => NIGHT.has(i.id))).toBe(false);
      }
    }
  });

  it('label deck respects exclude', () => {
    const l1 = buildLabelDeck(IMAGES, 12, mulberry32(7));
    const l2 = buildLabelDeck(IMAGES, 8, mulberry32(8), new Set(l1.map((i) => i.id)));
    expect(l2.some((i) => l1.includes(i))).toBe(false);
  });

  it('label deck throws when the pool is too small', () => {
    expect(() => buildLabelDeck(IMAGES.slice(0, 5), 12, mulberry32(1))).toThrow(/buildLabelDeck/);
  });

  it('tutorial deck uses day tutorial images with distinct labels', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const t = buildTutorialDeck(IMAGES, 3, mulberry32(seed));
      expect(t).toHaveLength(3);
      expect(t.every((i) => i.tutorial && i.variant === 'day')).toBe(true);
      expect(new Set(t.map((i) => i.label)).size).toBe(3);
    }
  });

  it('box deck: day, area 6–50%, distinct labels when count ≤ 8', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const d = buildBoxDeck(IMAGES, 5, mulberry32(seed));
      expect(d).toHaveLength(5);
      for (const i of d) {
        expect(i.variant).toBe('day');
        expect(boxArea(i.box)).toBeGreaterThanOrEqual(0.06);
        expect(boxArea(i.box)).toBeLessThanOrEqual(0.5);
      }
      expect(new Set(d.map((i) => i.label)).size).toBe(5);
    }
  });
});

describe('labelOptions', () => {
  it('n distinct labels incl. the correct one and its confusable partner', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      for (const correct of LABELS) {
        const opts = labelOptions(correct, 4, CONFUSABLE, rng);
        expect(opts).toHaveLength(4);
        expect(new Set(opts).size).toBe(4);
        expect(opts).toContain(correct);
        const partner = CONFUSABLE.find((p) => p.includes(correct));
        if (partner) expect(opts).toContain(partner[0] === correct ? partner[1] : partner[0]);
      }
    }
  });
  it('n = 2 needs no partner; deterministic per seed; correct position varies', () => {
    expect(labelOptions('tent', 2, CONFUSABLE, mulberry32(1))).toHaveLength(2);
    expect(labelOptions('tent', 4, CONFUSABLE, mulberry32(9))).toEqual(labelOptions('tent', 4, CONFUSABLE, mulberry32(9)));
    const positions = new Set<number>();
    for (let s = 1; s <= 50; s++) positions.add(labelOptions('tent', 4, CONFUSABLE, mulberry32(s)).indexOf('tent'));
    expect(positions.size).toBe(4);
  });
});

describe('audit set', () => {
  it('pool fixture is valid', () => {
    expect(auditPoolProblems(AUDIT_POOL, BY_ID, AUDIT_CFG)).toEqual([]);
  });

  it('holds every constraint over 500 seeds', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const set = buildAuditSet(AUDIT_POOL, BY_ID, AUDIT_CFG, mulberry32(seed));
      expect(set).toHaveLength(AUDIT_CFG.count);
      const wrong = set.filter((i) => isPredictionWrong(i, BY_ID));
      expect(wrong).toHaveLength(AUDIT_CFG.wrongPerSet);
      expect(wrong.some((i) => i.confidence >= AUDIT_CFG.high)).toBe(true);
      expect(set.some((i) => !isPredictionWrong(i, BY_ID) && i.confidence < AUDIT_CFG.low)).toBe(true);
      expect(new Set(set.map((i) => i.imageId)).size).toBe(set.length);
    }
  });

  it('is deterministic per seed and shuffled across seeds', () => {
    const ids = (s: number) => buildAuditSet(AUDIT_POOL, BY_ID, AUDIT_CFG, mulberry32(s)).map((i) => i.id);
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
  });

  it('throws / reports when the pool cannot comply', () => {
    const noHighWrong = AUDIT_POOL.filter((i) => !(isPredictionWrong(i, BY_ID) && i.confidence >= 0.85));
    expect(() => buildAuditSet(noHighWrong, BY_ID, AUDIT_CFG, mulberry32(1))).toThrow(/high-confidence wrong/);
    expect(auditPoolProblems(noHighWrong, BY_ID, AUDIT_CFG)).toContain('no high-confidence wrong prediction');
    const noLowRight = AUDIT_POOL.filter((i) => isPredictionWrong(i, BY_ID) || i.confidence >= 0.6);
    expect(() => buildAuditSet(noLowRight, BY_ID, AUDIT_CFG, mulberry32(1))).toThrow(/low-confidence correct/);
    const ghost: AuditItem = { id: 'au99', imageId: 'ai999', predicted: 'tent', confidence: 0.5 };
    expect(auditPoolProblems([...AUDIT_POOL, ghost], BY_ID, AUDIT_CFG)).toContain('au99: unknown image ai999');
    const fewWrong = { ...AUDIT_CFG, wrongPerSet: 5 };
    const twoWrong = AUDIT_POOL.filter((i) => !isPredictionWrong(i, BY_ID) || i.confidence >= 0.85).slice(0, 14);
    expect(auditPoolProblems(twoWrong, BY_ID, fewWrong).length).toBeGreaterThan(0);
  });

  it('isPredictionWrong throws on an unknown image', () => {
    expect(() => isPredictionWrong({ id: 'au99', imageId: 'nope', predicted: 'tent', confidence: 0.5 }, BY_ID)).toThrow(/unknown image/);
  });
});

describe('label reducer', () => {
  const deck = buildLabelDeck(IMAGES, 8, mulberry32(3));
  const right = (s: LabelLevelState) => labelReducer(s, { type: 'answer', label: labelCurrentAnswer(s) as Label });
  const wrong = (s: LabelLevelState) =>
    labelReducer(s, { type: 'answer', label: LABELS.find((l) => l !== labelCurrentAnswer(s)) as Label });

  it('cross-card hint ladder: hint after 2 wrong, answer after 3, reset to none after a right', () => {
    let s = createLabelState(deck);
    s = wrong(s);
    expect(s.hint).toBe('none');
    s = wrong(s);
    expect(s.hint).toBe('hint');
    s = right(s);
    expect(s.results[2]?.assist).toBe('hint');
    expect(s.results[2]?.points).toBe(0.75);
    expect(s.hint).toBe('none');
    s = wrong(s);
    expect(s.hint).toBe('answer');
    s = right(s);
    expect(s.results[4]?.points).toBe(0.5);
    expect(s.wrongCount).toBe(3);
  });

  it('streaks, completion and time-up', () => {
    let s = createLabelState(deck);
    for (let k = 0; k < 4; k++) s = right(s);
    expect(s.streak).toBe(4);
    s = wrong(s);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(4);
    const t = labelReducer(s, { type: 'timeUp' });
    expect(t).toMatchObject({ done: true, endReason: 'timeUp' });
    expect(labelReducer(t, { type: 'answer', label: 'tent' })).toBe(t);
    while (!s.done) s = right(s);
    expect(s.endReason).toBe('complete');
    expect(s.results).toHaveLength(8);
    expect(createLabelState([]).done).toBe(true);
  });

  it('card points match Stage 1', () => {
    expect(labelCardPoints(true, 'none')).toBe(1);
    expect(labelCardPoints(true, 'hint')).toBe(0.75);
    expect(labelCardPoints(true, 'answer')).toBe(0.5);
    expect(labelCardPoints(false, 'none')).toBe(0);
  });
});

describe('audit reducer', () => {
  const items = buildAuditSet(AUDIT_POOL, BY_ID, AUDIT_CFG, mulberry32(11));
  const correctly = (s: AuditLevelState) => auditReducer(s, { type: 'judge', verdict: auditCurrentAnswer(s) ?? 'right' });
  const badly = (s: AuditLevelState) =>
    auditReducer(s, { type: 'judge', verdict: auditCurrentAnswer(s) === 'flag' ? 'right' : 'flag' });

  it('kinds', () => {
    expect(auditKind(true, 'flag')).toBe('caught');
    expect(auditKind(true, 'right')).toBe('missed');
    expect(auditKind(false, 'flag')).toBe('falseFlag');
    expect(auditKind(false, 'right')).toBe('trusted');
  });

  it('perfect play catches every wrong prediction', () => {
    let s = createAuditState(items, BY_ID);
    while (!s.done) s = correctly(s);
    expect(s.results.filter((r) => r.kind === 'caught')).toHaveLength(3);
    expect(s.results.filter((r) => r.kind === 'trusted')).toHaveLength(5);
    expect(auditCatch(s.results, 3)).toBe(1);
  });

  it('hint ladder across items', () => {
    let s = createAuditState(items, BY_ID);
    s = badly(s);
    s = badly(s);
    expect(s.hint).toBe('hint');
    s = badly(s);
    expect(s.hint).toBe('answer');
    s = correctly(s);
    expect(s.results[3]?.assist).toBe('answer');
    expect(s.hint).toBe('none');
    s = auditReducer(s, { type: 'timeUp' });
    expect(s).toMatchObject({ done: true, endReason: 'timeUp' });
  });
});

describe('draw the box', () => {
  it('judgeBox grades by IoU', () => {
    const cfg = { good: 0.5, perfect: 0.75 };
    expect(judgeBox([30, 30, 40, 40], [30, 30, 40, 40], cfg)).toEqual({ iou: 1, grade: 'perfect' });
    expect(judgeBox([0, 0, 10, 10], [50, 50, 10, 10], cfg)).toEqual({ iou: 0, grade: 'miss' });
    expect(judgeBox([30, 30, 40, 40], [35, 30, 40, 40], cfg).grade).toBe('perfect'); // 1400 / 1800 ≈ 0.78
    expect(judgeBox([30, 30, 40, 40], [40, 30, 40, 40], cfg).grade).toBe('good'); // 1200 / 2000 = 0.6
  });
  it('boxHintLevel', () => {
    expect([0, 1, 2, 3, 4].map(boxHintLevel)).toEqual(['none', 'none', 'hint', 'answer', 'answer']);
  });
});

describe('scoring', () => {
  const STARS = { one: 0.3, two: 0.65, three: 0.88 };

  it('labelAccuracy pools L1 and L2; unanswered count 0', () => {
    expect(labelAccuracy([{ points: 1 }, { points: 0.5 }], 4, [1, 0.8], 2)).toBeCloseTo(3.3 / 6, 10);
    expect(labelAccuracy([], 12, [], 8)).toBe(0);
    expect(labelAccuracy([], 0, [], 0)).toBe(0);
  });

  it('earlyGuessBonus, auditCatch, boxScore', () => {
    expect(earlyGuessBonus([1, 0.5], 4)).toBeCloseTo(0.375, 10);
    expect(earlyGuessBonus([], 0)).toBe(0);
    expect(auditCatch([{ kind: 'caught' }, { kind: 'caught' }, { kind: 'falseFlag' }], 3)).toBeCloseTo(0.5, 10);
    expect(auditCatch([{ kind: 'falseFlag' }, { kind: 'missed' }], 3)).toBe(0);
    expect(auditCatch([], 0)).toBe(0);
    expect(boxScore([0.75, 0.375, 1], 4, 0.75)).toBeCloseTo(2.5 / 4, 10);
    expect(boxScore([], 0, 0.75)).toBe(0);
  });

  it('stageScore: perfect → 1 (3★), nothing → 0 (0★), clamps', () => {
    const perfect = stageScore({ labelAccuracy: 1, early: 1, audit: 1, box: null });
    expect(perfect).toBe(1);
    expect(aiStars(perfect, STARS)).toBe(3);
    expect(stageScore({ labelAccuracy: 1, early: 1, audit: 1, box: 1 })).toBe(1);
    const none = stageScore({ labelAccuracy: 0, early: 0, audit: 0, box: null });
    expect(none).toBe(0);
    expect(aiStars(none, STARS)).toBe(0);
    expect(stageScore({ labelAccuracy: 0.9, early: 0.5, audit: 0.67, box: null })).toBeCloseTo(0.495 + 0.075 + 0.201, 10);
    expect(stageScore({ labelAccuracy: 5, early: -1, audit: Number.NaN, box: null })).toBeCloseTo(0.55, 10);
    // A solid but not flawless run (labels 0.95, early 0.6, audit 1) still earns 3★.
    expect(aiStars(stageScore({ labelAccuracy: 0.95, early: 0.6, audit: 1, box: null }), STARS)).toBe(3);
  });

  it('aiStars thresholds are inclusive', () => {
    expect(aiStars(0.3, STARS)).toBe(1);
    expect(aiStars(0.6499, STARS)).toBe(1);
    expect(aiStars(0.65, STARS)).toBe(2);
    expect(aiStars(0.88, STARS)).toBe(3);
  });

  it('toAiScores uses §3.2 modelAccuracy, bounded 0.5..0.98', () => {
    const best = toAiScores({ labelAccuracy: 1, early: 1, audit: 1 }, 1);
    expect(best.modelAccuracy).toBeCloseTo(0.98, 10);
    const worst = toAiScores({ labelAccuracy: 0, early: 0, audit: 0 }, 0);
    expect(worst.modelAccuracy).toBe(0.5);
    const mid = toAiScores({ labelAccuracy: 0.8, early: 0.4, audit: 0.6 }, 0.7);
    expect(mid).toEqual({ labelAccuracy: 0.8, earlyGuessBonus: 0.4, auditCatch: 0.6, modelAccuracy: modelAccuracy(0.8, 0.7, 0.6) });
  });
});
