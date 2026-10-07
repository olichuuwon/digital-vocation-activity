// Stage 1 "Clean the Data" pure logic (spec §4). No React, no DOM, no Math.random.
// Content contract: src/content/stage1Schema.ts.
import type { CardLevel, DataRecord, OutlierChart } from '../../content/stage1Schema';
import { hintLevel, type HintLevel } from '../../state/hints';
import { clamp } from '../../state/scoring';
import type { Scores, StarCount } from '../../state/types';

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

export type Rng = () => number;

/** Seeded PRNG returning floats in [0, 1). Same seed → same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher–Yates shuffle using `rng`. Returns the same array. */
export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Rulebook constants and normalisers (rules 2, 4, 5)
// ---------------------------------------------------------------------------

export const PEOPLE_MIN = 1;
export const PEOPLE_MAX = 15;
export const WATER_MIN_L = 5;
export const WATER_MAX_L = 200;

/**
 * Rule 5 thresholds ("unusual but possible"), from the game-designer: people 13–15, water ≤5 L or
 * ≥190 L (i.e. at or near the legal edges). Legal values in these bands are outliers to KEEP.
 */
export const OUTLIER_PEOPLE_MIN = 13;
export const OUTLIER_WATER_HIGH_L = 190;
export const OUTLIER_WATER_LOW_L = 5;

/** Water amount in litres (ml ÷ 1000, rounded to 3 dp to dodge float noise), or null if missing. */
export function normaliseWater(w: DataRecord['water']): number | null {
  if (w === null) return null;
  const litres = w.unit === 'ml' ? w.value / 1000 : w.value;
  return Math.round(litres * 1000) / 1000;
}

const CLEAN_SECTOR = /^[A-F]$/;
// Lowercase / stray spaces ("b", " B ") or a mangled "Sector" prefix ("Sectr B", "sec. b").
const FIXABLE_SECTOR = /^\s*(?:s[a-z]{1,7}\.?\s*)?([A-Fa-f])\s*$/i;

/** Clean sector letter and whether it needed fixing (rule 4); null if missing or unrecognisable. */
export function normaliseSector(raw: string | null): { value: string; fixed: boolean } | null {
  if (raw === null) return null;
  if (CLEAN_SECTOR.test(raw)) return { value: raw, fixed: false };
  const m = FIXABLE_SECTOR.exec(raw);
  return m && m[1] ? { value: m[1].toUpperCase(), fixed: true } : null;
}

export const inRange = (x: number, lo: number, hi: number): boolean => x >= lo && x <= hi;

export function isUnusualPeople(n: number): boolean {
  return inRange(n, PEOPLE_MIN, PEOPLE_MAX) && n >= OUTLIER_PEOPLE_MIN;
}
export function isUnusualWater(l: number): boolean {
  return inRange(l, WATER_MIN_L, WATER_MAX_L) && (l >= OUTLIER_WATER_HIGH_L || l <= OUTLIER_WATER_LOW_L);
}

// ---------------------------------------------------------------------------
// classify: independent sanity check of a record's declared status/rule
// ---------------------------------------------------------------------------

export interface Classification {
  status: DataRecord['status'];
  rule: number | null;
  /** For fixable records: the field to fix and its clean value as shown in options ("B", "40 L"). */
  fix?: { field: 'sector' | 'water'; value: string };
  /** Set when the record can't be classified by the rulebook (content bug). */
  note?: string;
}

/**
 * Derive status/rule from raw fields. Precedence: rule 1 (missing) → rule 3 (duplicate, needs
 * `seenHouseholds` = households earlier in the deck) → rule 2 (out of range, after ml→L) →
 * rule 4 (fixable typo/case/unit) → rule 5 (legal outlier) → plain valid.
 */
export function classify(record: DataRecord, seenHouseholds?: ReadonlySet<string>): Classification {
  if (record.sector === null || record.people === null || record.water === null) {
    return { status: 'invalid', rule: 1 };
  }
  if (seenHouseholds?.has(record.household)) return { status: 'invalid', rule: 3 };

  const litres = normaliseWater(record.water) as number;
  if (!inRange(record.people, PEOPLE_MIN, PEOPLE_MAX) || !inRange(litres, WATER_MIN_L, WATER_MAX_L)) {
    return { status: 'invalid', rule: 2 };
  }
  const sector = normaliseSector(record.sector);
  if (!sector) return { status: 'invalid', rule: null, note: `unrecognised sector "${record.sector}"` };

  if (sector.fixed) return { status: 'fixable', rule: 4, fix: { field: 'sector', value: sector.value } };
  if (record.water.unit === 'ml') return { status: 'fixable', rule: 4, fix: { field: 'water', value: `${litres} L` } };

  if (isUnusualPeople(record.people) || isUnusualWater(litres)) return { status: 'valid', rule: 5 };
  return { status: 'valid', rule: null };
}

/** Loose compare of a fix option with the derived clean value ("40 L" == "40L" == "40 litres"). */
export function fixOptionMatches(option: string, field: 'sector' | 'water', value: string): boolean {
  if (field === 'sector') return option.trim() === value;
  const n = (s: string) => Number.parseFloat(s.replace(/,/g, ''));
  return /\d\s*L\b|litre|liter/i.test(option) && n(option) === n(value);
}

// ---------------------------------------------------------------------------
// buildDeck
// ---------------------------------------------------------------------------

export const TUTORIAL_LEVEL_ID: CardLevel['id'] = 'data-tutorial';
/** A rule-3 duplicate sits at least this many positions after its original (≥1 card between). */
export const DUP_MIN_GAP = 2;
const SHUFFLE_ATTEMPTS = 500;

/**
 * Whether `r` may be dealt in `level`: tutorial flag, rule filter, Fix availability, and
 * ml-unit records (rule-4 unit fixes and rule-2 ml cases) only when rule 4 is in play.
 */
export function isEligible(r: DataRecord, level: CardLevel): boolean {
  if (level.id === TUTORIAL_LEVEL_ID && !r.tutorial) return false;
  if (r.status === 'fixable' && !level.allowFix) return false;
  if (r.water?.unit === 'ml' && !level.rules.includes(4)) return false;
  return r.rule === null || level.rules.includes(r.rule);
}

/** Card order is legal: every duplicate's original is ≥ DUP_MIN_GAP positions earlier. */
export function duplicatesSpaced(deck: readonly DataRecord[]): boolean {
  for (let i = 0; i < deck.length; i++) {
    const dupOf = deck[i]?.duplicateOf;
    if (!dupOf) continue;
    const j = deck.findIndex((o) => o.id === dupOf);
    if (j < 0 || i - j < DUP_MIN_GAP) return false;
  }
  return true;
}

/**
 * Deal `level.count` cards. Guarantees (non-tutorial levels): ≥1 rule-3 duplicate when rule 3 is
 * in play (original included, ≥ DUP_MIN_GAP cards before it), ≥1 rule-5 card when rule 5 is in
 * play, then `level.mix` minimums, then random fill. Never repeats a record or a household
 * (except declared duplicates). Deterministic for a seeded rng. Throws if the pool can't comply.
 */
export function buildDeck(records: readonly DataRecord[], level: CardLevel, rng: Rng): DataRecord[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const eligible = records.filter((r) => {
    if (!isEligible(r, level)) return false;
    if (!r.duplicateOf) return true;
    const orig = byId.get(r.duplicateOf);
    return !!orig && !orig.duplicateOf && isEligible(orig, level);
  });
  shuffleInPlace(eligible, rng);

  const chosen: DataRecord[] = [];
  const chosenIds = new Set<string>();
  const households = new Set<string>();
  const counts = { valid: 0, fixable: 0, invalid: 0 };
  const push = (r: DataRecord) => {
    chosen.push(r);
    chosenIds.add(r.id);
    households.add(r.household);
    counts[r.status]++;
  };
  const tryAdd = (r: DataRecord): boolean => {
    if (chosenIds.has(r.id)) return false;
    const room = level.count - chosen.length;
    if (r.duplicateOf) {
      const orig = byId.get(r.duplicateOf) as DataRecord;
      if (chosenIds.has(orig.id)) {
        if (room < 1) return false;
        push(r);
        return true;
      }
      if (room < 2 || households.has(orig.household)) return false;
      push(orig);
      push(r);
      return true;
    }
    if (room < 1 || households.has(r.household)) return false;
    push(r);
    return true;
  };
  const addFirst = (pred: (r: DataRecord) => boolean): boolean => eligible.some((r) => pred(r) && tryAdd(r));

  const needDup = level.id !== TUTORIAL_LEVEL_ID && level.rules.includes(3);
  const needOutlier = level.id !== TUTORIAL_LEVEL_ID && level.rules.includes(5);
  const fail = (why: string): never => {
    throw new Error(`buildDeck: pool can't satisfy ${level.id} (${why})`);
  };
  if (needDup && !addFirst((r) => r.rule === 3)) fail('needs a rule-3 duplicate');
  if (needOutlier && !addFirst((r) => r.rule === 5)) fail('needs a rule-5 outlier');
  for (const status of ['invalid', 'fixable', 'valid'] as const) {
    for (const r of eligible) {
      if (counts[status] >= level.mix[status]) break;
      if (r.status === status) tryAdd(r);
    }
  }
  for (const r of eligible) {
    if (chosen.length >= level.count) break;
    tryAdd(r);
  }
  if (chosen.length < level.count) fail(`only ${chosen.length}/${level.count} cards`);
  for (const s of ['valid', 'fixable', 'invalid'] as const) {
    if (counts[s] < level.mix[s]) fail(`mix ${s} ${counts[s]}/${level.mix[s]}`);
  }

  // Rejection-sample an order with duplicates spaced after their originals (cheap: ≤10 cards).
  for (let a = 0; a < SHUFFLE_ATTEMPTS; a++) {
    shuffleInPlace(chosen, rng);
    if (duplicatesSpaced(chosen)) return chosen;
  }
  // Fallback (practically unreachable): originals first, duplicates last, others between.
  const dupIds = new Set(chosen.filter((r) => r.duplicateOf).map((r) => r.duplicateOf as string));
  const rank = (r: DataRecord) => (dupIds.has(r.id) ? 0 : r.duplicateOf ? 2 : 1);
  const ordered = [...chosen].sort((x, y) => rank(x) - rank(y));
  if (!duplicatesSpaced(ordered)) fail('cannot space duplicates');
  return ordered;
}

// ---------------------------------------------------------------------------
// judge
// ---------------------------------------------------------------------------

export type Action = 'keep' | 'trash' | { fix: number };
export type Expected = 'keep' | 'trash' | 'fix';
export type JudgeKind =
  | 'correct'
  | 'wrongKeep' // kept an invalid record
  | 'keepUnfixed' // kept a fixable record without fixing it
  | 'wrongTrashValid' // trashed a valid record (incl. rule-5 outliers)
  | 'wrongTrashFixable' // trashed a record that could be fixed
  | 'wrongFix' // fixable record, wrong option picked (0.5 points, still a wrong decision)
  | 'fixInsteadOfTrash' // tried to fix an invalid record
  | 'fixInsteadOfKeep'; // tried to fix a valid record

export interface JudgeResult {
  correct: boolean;
  expected: Expected;
  /** Rule for the toast ("Rule 3: duplicate"); null for plain valid records. */
  rule: number | null;
  kind: JudgeKind;
  /** True when a fixable record was fixed with the right option (feeds scores.data.fixedCount). */
  fixed: boolean;
  /** Fixable records: index of the right option (toast shows it after a wrong fix). */
  correctFix?: number;
}

/**
 * Judge one decision. If the level has no Fix action but a fixable record slips in (buildDeck
 * prevents this), the player can't be right by fixing, so Keep and Trash are both accepted.
 */
export function judge(record: DataRecord, action: Action, level: CardLevel): JudgeResult {
  const rule = record.rule;
  const isFix = typeof action === 'object';
  const correctFix = record.fix?.correct;
  const r = (kind: JudgeKind, expected: Expected, fixed = false): JudgeResult => {
    const out: JudgeResult = { correct: kind === 'correct', expected, rule, kind, fixed };
    if (correctFix !== undefined) out.correctFix = correctFix;
    return out;
  };

  switch (record.status) {
    case 'valid':
      return action === 'keep' ? r('correct', 'keep') : isFix ? r('fixInsteadOfKeep', 'keep') : r('wrongTrashValid', 'keep');
    case 'invalid':
      return action === 'trash' ? r('correct', 'trash') : isFix ? r('fixInsteadOfTrash', 'trash') : r('wrongKeep', 'trash');
    case 'fixable': {
      if (!level.allowFix) return isFix ? r('wrongFix', 'trash') : r('correct', 'trash');
      if (isFix) return action.fix === correctFix ? r('correct', 'fix', true) : r('wrongFix', 'fix');
      return action === 'keep' ? r('keepUnfixed', 'fix') : r('wrongTrashFixable', 'fix');
    }
  }
}

// ---------------------------------------------------------------------------
// Level reducer (card levels): index, results, streak, hint ladder, time-up
// ---------------------------------------------------------------------------

export const STREAK_MIN = 3;

export interface CardResult extends JudgeResult {
  recordId: string;
  /** Hint level showing when this card was decided. */
  assist: HintLevel;
  /** Points earned for this card (see cardPoints). */
  points: number;
}

export interface LevelState {
  level: CardLevel;
  deck: readonly DataRecord[];
  index: number;
  results: CardResult[];
  /**
   * Wrong decisions so far in this level (w). Per level: correct answers never reset it.
   * Time-up leftovers are not wrong decisions.
   */
  wrongCount: number;
  /**
   * Hint level for the current card. After a wrong decision the next card gets hintLevel(w)
   * (w = 2 → 'hint', w ≥ 3 → 'answer'); after a correct decision the next card gets 'none'.
   */
  hint: HintLevel;
  streak: number;
  bestStreak: number;
  fixedCount: number;
  done: boolean;
  endReason: 'complete' | 'timeUp' | null;
}

export type LevelEvent = { type: 'decide'; action: Action } | { type: 'timeUp' };

export function createLevelState(level: CardLevel, deck: readonly DataRecord[]): LevelState {
  return {
    level,
    deck,
    index: 0,
    results: [],
    wrongCount: 0,
    hint: 'none',
    streak: 0,
    bestStreak: 0,
    fixedCount: 0,
    done: deck.length === 0,
    endReason: deck.length === 0 ? 'complete' : null,
  };
}

/** True when the streak counter should show (3+ correct in a row, spec §3.3). */
export const streakActive = (s: LevelState): boolean => s.streak >= STREAK_MIN;

export function levelReducer(state: LevelState, event: LevelEvent): LevelState {
  if (state.done) return state;
  if (event.type === 'timeUp') return { ...state, done: true, endReason: 'timeUp' };

  const record = state.deck[state.index];
  if (!record) return { ...state, done: true, endReason: 'complete' };
  const res = judge(record, event.action, state.level);
  const wrongCount = state.wrongCount + (res.correct ? 0 : 1);
  const streak = res.correct ? state.streak + 1 : 0;
  const index = state.index + 1;
  const done = index >= state.deck.length;
  return {
    ...state,
    index,
    results: [...state.results, { ...res, recordId: record.id, assist: state.hint, points: cardPoints(res, state.hint) }],
    wrongCount,
    hint: done || res.correct ? 'none' : hintLevel(wrongCount),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    fixedCount: state.fixedCount + (res.fixed ? 1 : 0),
    done,
    endReason: done ? 'complete' : null,
  };
}

/** Expected action for the current card (what the 'answer' hint reveals). */
export function currentAnswer(state: LevelState): { expected: Expected; rule: number | null; fixIndex?: number } | null {
  const r = state.deck[state.index];
  if (!r) return null;
  const expected: Expected = r.status === 'valid' ? 'keep' : r.status === 'invalid' || !state.level.allowFix ? 'trash' : 'fix';
  return expected === 'fix' && r.fix ? { expected, rule: r.rule, fixIndex: r.fix.correct } : { expected, rule: r.rule };
}

// ---------------------------------------------------------------------------
// Outlier level (L3, full mode only)
// ---------------------------------------------------------------------------

export interface OutlierJudgement {
  hits: number[];
  /** Tapped bars that aren't errors (legal values). */
  falsePositives: number[];
  /** Subset of falsePositives that are unusual-but-legal (rule 5 toast). */
  unusualTapped: number[];
  misses: number[];
}

/** Bar category by the rulebook: 'error' (rule 2), 'unusual' (rule 5) or 'normal'. */
export function classifyBar(measure: OutlierChart['measure'], value: number): 'error' | 'unusual' | 'normal' {
  if (measure === 'people') {
    if (!Number.isInteger(value) || !inRange(value, PEOPLE_MIN, PEOPLE_MAX)) return 'error';
    return isUnusualPeople(value) ? 'unusual' : 'normal';
  }
  if (!inRange(value, WATER_MIN_L, WATER_MAX_L)) return 'error';
  return isUnusualWater(value) ? 'unusual' : 'normal';
}

/** Score a chart's taps against its declared errors. Duplicate / out-of-range taps are ignored. */
export function judgeOutlier(chart: OutlierChart, tappedIndexes: readonly number[]): OutlierJudgement {
  const errors = new Set(chart.errors);
  const tapped = [...new Set(tappedIndexes)].filter((i) => i >= 0 && i < chart.bars.length).sort((a, b) => a - b);
  const hits = tapped.filter((i) => errors.has(i));
  const falsePositives = tapped.filter((i) => !errors.has(i));
  const unusualTapped = falsePositives.filter((i) => classifyBar(chart.measure, chart.bars[i]?.value ?? 0) === 'unusual');
  const misses = [...errors].filter((i) => !tapped.includes(i)).sort((a, b) => a - b);
  return { hits, falsePositives, unusualTapped, misses };
}

/**
 * In-level helper for L3 from wrong (legal-bar) taps so far in the level: 2 → 'hint' (show the
 * allowed range), 3+ → 'answer' (flash the error bars). Helpers don't change the bonus formula.
 */
export function outlierHintLevel(wrongTaps: number): HintLevel {
  return hintLevel(wrongTaps);
}

// ---------------------------------------------------------------------------
// SCORING (game-designer spec). Only L1 + L2 count; the tutorial scores nothing.
// ---------------------------------------------------------------------------

/** Points multiplier for a correct answer by hint level shown on that card. */
export const ASSIST_POINTS: Record<HintLevel, number> = { none: 1, hint: 0.75, answer: 0.5 };
export const WRONG_FIX_POINTS = 0.5;
export const SCORED_LEVEL_IDS: readonly CardLevel['id'][] = ['data-l1', 'data-l2'];

/** Per-card points: correct 1 / 0.75 hinted / 0.5 answered; wrong fix option 0.5; other wrongs 0. */
export function cardPoints(res: JudgeResult, assist: HintLevel): number {
  if (res.correct) return ASSIST_POINTS[assist];
  return res.kind === 'wrongFix' && res.expected === 'fix' ? WRONG_FIX_POINTS : 0;
}

export interface LevelOutcome {
  levelId: CardLevel['id'];
  results: readonly CardResult[];
  /** Cards dealt (deck length). Unanswered cards at time-up stay in the denominator. */
  dealt: number;
}

export const outcomeOf = (s: LevelState): LevelOutcome => ({ levelId: s.level.id, results: s.results, dealt: s.deck.length });

/** Accuracy of one level, 0–1 (points / cards dealt). */
export function levelAccuracy(results: readonly CardResult[], dealt: number): number {
  if (dealt <= 0) return 0;
  let pts = 0;
  for (const r of results) pts += r.points;
  return clamp(pts / dealt, 0, 1);
}

/** scores.data.accuracy: points / cards dealt across L1 + L2 (tutorial ignored). */
export function dataAccuracy(levels: readonly LevelOutcome[]): number {
  let pts = 0;
  let dealt = 0;
  for (const l of levels) {
    if (!SCORED_LEVEL_IDS.includes(l.levelId)) continue;
    dealt += l.dealt;
    for (const r of l.results) pts += r.points;
  }
  return dealt > 0 ? clamp(pts / dealt, 0, 1) : 0;
}

/** Fixable cards fixed with the right option across L1 + L2. */
export function dataFixedCount(levels: readonly LevelOutcome[]): number {
  let n = 0;
  for (const l of levels) if (SCORED_LEVEL_IDS.includes(l.levelId)) for (const r of l.results) if (r.fixed) n++;
  return n;
}

/** One chart: max(0, (errorsTapped − legalTapped) / errors), capped at 1. */
export function outlierChartScore(j: OutlierJudgement): number {
  const errors = j.hits.length + j.misses.length;
  if (errors === 0) return 0;
  return clamp((j.hits.length - j.falsePositives.length) / errors, 0, 1);
}

/** Outlier bonus 0–1: mean chart score. Charts not reached count 0 if `chartCount` is given. */
export function outlierBonus(judgements: readonly OutlierJudgement[], chartCount = judgements.length): number {
  if (chartCount <= 0) return 0;
  let sum = 0;
  for (const j of judgements) sum += outlierChartScore(j);
  return clamp(sum / chartCount, 0, 1);
}

/** Reality Check pick: true iff the picked automate option is the one marked correct ("dupes"). */
export function isRuleChosen(options: readonly { id: string; correct: boolean }[], pickedId: string | null): boolean {
  return !!pickedId && options.some((o) => o.id === pickedId && o.correct);
}

export interface StageScoreInput {
  /** dataAccuracy (L1 + L2), 0–1. */
  accuracy: number;
  ruleChosen: boolean;
  /** outlierBonus in full mode; null in booth mode (L3 not played). */
  outlier: number | null;
}

/** Stage score = min(1, 0.9·accuracy + 0.1·ruleChosen + 0.05·outlier[full only]). */
export function stageScore({ accuracy, ruleChosen, outlier }: StageScoreInput): number {
  return clamp(0.9 * clamp(accuracy, 0, 1) + (ruleChosen ? 0.1 : 0) + 0.05 * clamp(outlier ?? 0, 0, 1), 0, 1);
}

/** Stars from the stage score and stage1.json `stars` thresholds (≥one 1★, ≥two 2★, ≥three 3★). */
export function dataStars(score: number, t: { one: number; two: number; three: number }): StarCount {
  if (score >= t.three) return 3;
  if (score >= t.two) return 2;
  if (score >= t.one) return 1;
  return 0;
}

/** GameState['scores']['data'] from the scored levels and the automate pick. */
export function toDataScores(levels: readonly LevelOutcome[], ruleChosen: boolean): Scores['data'] {
  return { accuracy: dataAccuracy(levels), fixedCount: dataFixedCount(levels), ruleChosen };
}
