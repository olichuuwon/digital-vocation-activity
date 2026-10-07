// Stage 2 "Teach the Machine to See" pure logic (spec §5). No React, no DOM, no Math.random.
// Content contract: src/content/stage2Schema.ts. Tile reveal: src/sim/reveal.ts. Boxes: src/sim/iou.ts.
//
// SCORING (all values 0–1; unanswered items at time-up count 0 and stay in the denominators):
//   labelAccuracy   = (Σ L1 card points + Σ L2 coveredPoints) / (L1 dealt + L2 dealt)
//                     L1 card: right 1 / after hint 0.75 / with answer shown 0.5 / wrong 0
//                     L2 image: 1 − penalty·wrongGuesses, capped 0.75 (hint) / 0.5 (answer), ≥ 0
//   earlyGuessBonus = Σ L2 earlyBonus / L2 dealt   (earlyBonus = share of tiles still covered)
//   auditCatch      = clamp((caught − 0.5·falseFlags) / wrong predictions dealt, 0, 1)
//   boxScore        = mean over dealt boxes of min(1, iou / perfect)   (bonus L3, full mode)
//   stageScore      = min(1, 0.55·label + 0.15·early + 0.30·audit + 0.05·(box ?? 0))
//   stars           = stage2.json `stars` thresholds on stageScore
//   modelAccuracy   = state/scoring.ts modelAccuracy(label, data.accuracy, audit) (§3.2)
// The tutorial scores nothing.
import { LABELS, type AiImage, type AuditItem, type Box, type Label, type Stage2Content } from '../../content/stage2Schema';
import { boxGrade, iou, type BoxGrade } from '../../sim/iou';
import { hintLevel, type HintLevel } from '../../state/hints';
import { clamp, modelAccuracy } from '../../state/scoring';
import type { Scores, StarCount } from '../../state/types';
import { ASSIST_POINTS, mulberry32, shuffleInPlace, type Rng } from '../data/logic';

export { mulberry32, shuffleInPlace, type Rng };

export const STREAK_MIN = 3;
/** Box Deck: true box area as a share of the canvas. */
/** Where the player's box starts in Draw the Box (centred, 40×40). */
export const START_BOX: Box = [30, 30, 40, 40];
export const BOX_AREA_MIN = 0.06;
export const BOX_AREA_MAX = 0.5;

export type ImagesById = ReadonlyMap<string, AiImage>;
export const indexImages = (images: readonly AiImage[]): Map<string, AiImage> => new Map(images.map((i) => [i.id, i]));

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

/** Training images: day only. Night images never train the model (§5.3). */
export function trainingPool(images: readonly AiImage[]): AiImage[] {
  return images.filter((i) => i.variant === 'day');
}

/** Most times one class may appear in a label deck of `count`. */
export const maxPerClass = (count: number): number => Math.ceil(count / LABELS.length) + 1;

/**
 * Round-robin deal: group by label (each group shuffled), then take one image per class per round
 * in a freshly shuffled class order until `count`. Result shuffled. Balanced by construction.
 */
function dealBalanced(pool: AiImage[], count: number, rng: Rng, what: string): AiImage[] {
  const groups = new Map<Label, AiImage[]>();
  for (const img of pool) {
    const g = groups.get(img.label);
    if (g) g.push(img);
    else groups.set(img.label, [img]);
  }
  const classes = LABELS.filter((l) => groups.has(l));
  for (const l of classes) shuffleInPlace(groups.get(l) as AiImage[], rng);
  const out: AiImage[] = [];
  while (out.length < count) {
    const round = shuffleInPlace(classes.filter((l) => (groups.get(l) as AiImage[]).length > 0), rng);
    if (round.length === 0) throw new Error(`${what}: pool has only ${out.length}/${count} usable images`);
    for (const l of round) {
      if (out.length >= count) break;
      out.push((groups.get(l) as AiImage[]).pop() as AiImage);
    }
  }
  return shuffleInPlace(out, rng);
}

/**
 * L1 deck: `count` distinct day images (minus `exclude` ids), classes balanced: no class more than
 * maxPerClass(count) times and every class at least once when count ≥ 8. Throws if the pool can't.
 */
export function buildLabelDeck(images: readonly AiImage[], count: number, rng: Rng, exclude?: ReadonlySet<string>): AiImage[] {
  const pool = trainingPool(images).filter((i) => !exclude?.has(i.id));
  const deck = dealBalanced(pool, count, rng, 'buildLabelDeck');
  const counts = new Map<Label, number>();
  for (const i of deck) counts.set(i.label, (counts.get(i.label) ?? 0) + 1);
  for (const [l, n] of counts) if (n > maxPerClass(count)) throw new Error(`buildLabelDeck: too few classes in pool (${l} ×${n})`);
  if (count >= LABELS.length && counts.size < LABELS.length) throw new Error('buildLabelDeck: pool lacks some classes');
  return deck;
}

/** Tutorial deck: `count` day images flagged `tutorial`, distinct labels where possible. */
export function buildTutorialDeck(images: readonly AiImage[], count: number, rng: Rng): AiImage[] {
  return dealBalanced(
    trainingPool(images).filter((i) => i.tutorial),
    count,
    rng,
    'buildTutorialDeck',
  );
}

/**
 * `n` distinct label options including `correct`, shuffled. When `correct` has a confusable
 * partner and n ≥ 3, one partner is included (picked by rng if there are several).
 */
export function labelOptions(correct: Label, n: number, confusable: readonly (readonly [Label, Label])[], rng: Rng): Label[] {
  const size = Math.max(1, Math.min(n, LABELS.length));
  const out: Label[] = [correct];
  if (size >= 3) {
    const partners = [
      ...new Set(confusable.flatMap(([a, b]) => (a === correct && b !== correct ? [b] : b === correct && a !== correct ? [a] : []))),
    ];
    if (partners.length > 0) out.push(partners[Math.floor(rng() * partners.length)] as Label);
  }
  const rest = shuffleInPlace(
    LABELS.filter((l) => !out.includes(l)),
    rng,
  );
  for (const l of rest) {
    if (out.length >= size) break;
    out.push(l);
  }
  return shuffleInPlace(out, rng);
}

/** Box area as a share of the 100×100 canvas. */
export const boxArea = (b: Box): number => (b[2] * b[3]) / 10000;
export const isBoxable = (i: AiImage): boolean =>
  i.variant === 'day' && boxArea(i.box) >= BOX_AREA_MIN && boxArea(i.box) <= BOX_AREA_MAX;

/** Draw the Box deck: `count` day images with box area 6–50%, distinct labels where possible. */
export function buildBoxDeck(images: readonly AiImage[], count: number, rng: Rng): AiImage[] {
  return dealBalanced(images.filter(isBoxable), count, rng, 'buildBoxDeck');
}

// ---------------------------------------------------------------------------
// Audit set (L4)
// ---------------------------------------------------------------------------

export type AuditConfig = Stage2Content['audit'];

/** True when the model's prediction differs from the image's true label. Throws on unknown image. */
export function isPredictionWrong(item: AuditItem, imagesById: ImagesById): boolean {
  const img = imagesById.get(item.imageId);
  if (!img) throw new Error(`audit item ${item.id}: unknown image ${item.imageId}`);
  return img.label !== item.predicted;
}

/**
 * Deal exactly cfg.count items with exactly cfg.wrongPerSet wrong predictions, including ≥1
 * high-confidence wrong (confidence ≥ cfg.high) and ≥1 low-confidence correct (< cfg.low), no
 * image repeated, shuffled. Throws a clear error if the pool can't comply.
 */
export function buildAuditSet(pool: readonly AuditItem[], imagesById: ImagesById, cfg: AuditConfig, rng: Rng): AuditItem[] {
  const fail = (why: string): never => {
    throw new Error(`buildAuditSet: pool can't satisfy ${cfg.id} (${why})`);
  };
  if (cfg.wrongPerSet < 1 || cfg.wrongPerSet >= cfg.count) fail(`wrongPerSet ${cfg.wrongPerSet} must be 1..count-1`);
  const usable = shuffleInPlace(
    pool.filter((i) => imagesById.has(i.imageId)),
    rng,
  );
  const wrong = usable.filter((i) => isPredictionWrong(i, imagesById));
  const right = usable.filter((i) => !isPredictionWrong(i, imagesById));
  const chosen: AuditItem[] = [];
  const usedImages = new Set<string>();
  const usedIds = new Set<string>();
  const take = (from: readonly AuditItem[], pred: (i: AuditItem) => boolean, n: number): number => {
    let got = 0;
    for (const i of from) {
      if (got >= n) break;
      if (usedIds.has(i.id) || usedImages.has(i.imageId) || !pred(i)) continue;
      chosen.push(i);
      usedIds.add(i.id);
      usedImages.add(i.imageId);
      got++;
    }
    return got;
  };
  const any = () => true;
  if (take(wrong, (i) => i.confidence >= cfg.high, 1) < 1) fail('needs a high-confidence wrong prediction');
  if (take(right, (i) => i.confidence < cfg.low, 1) < 1) fail('needs a low-confidence correct prediction');
  const needWrong = cfg.wrongPerSet - 1;
  const gotWrong = take(wrong, any, needWrong);
  if (gotWrong < needWrong) fail(`only ${gotWrong + 1}/${cfg.wrongPerSet} wrong predictions on distinct images`);
  const needRight = cfg.count - cfg.wrongPerSet - 1;
  if (take(right, any, needRight) < needRight) fail(`not enough correct predictions for ${cfg.count} items`);
  return shuffleInPlace(chosen, rng);
}

/** Content check: unknown images, duplicate ids, bad thresholds, and failed deals over 200 seeds. */
export function auditPoolProblems(pool: readonly AuditItem[], imagesById: ImagesById, cfg: AuditConfig): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const i of pool) {
    if (ids.has(i.id)) problems.push(`duplicate audit id ${i.id}`);
    ids.add(i.id);
    if (!imagesById.has(i.imageId)) problems.push(`${i.id}: unknown image ${i.imageId}`);
  }
  if (!(cfg.low <= cfg.high)) problems.push(`low (${cfg.low}) must be ≤ high (${cfg.high})`);
  const known = pool.filter((i) => imagesById.has(i.imageId));
  const wrong = known.filter((i) => isPredictionWrong(i, imagesById));
  const right = known.filter((i) => !isPredictionWrong(i, imagesById));
  const distinct = (xs: readonly AuditItem[]) => new Set(xs.map((i) => i.imageId)).size;
  if (!wrong.some((i) => i.confidence >= cfg.high)) problems.push('no high-confidence wrong prediction');
  if (!right.some((i) => i.confidence < cfg.low)) problems.push('no low-confidence correct prediction');
  if (distinct(wrong) < cfg.wrongPerSet) problems.push(`wrong predictions on ${distinct(wrong)} images, need ${cfg.wrongPerSet}`);
  if (distinct(right) < cfg.count - cfg.wrongPerSet)
    problems.push(`correct predictions on ${distinct(right)} images, need ${cfg.count - cfg.wrongPerSet}`);
  if (problems.length === 0) {
    for (let seed = 1; seed <= 200; seed++) {
      try {
        buildAuditSet(pool, imagesById, cfg, mulberry32(seed));
      } catch (e) {
        problems.push(`seed ${seed}: ${(e as Error).message}`);
        break;
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Label levels (tutorial + L1): same hint ladder as Stage 1 card levels
// ---------------------------------------------------------------------------

/** Points for one label card: right 1 / 0.75 after hint / 0.5 with answer shown; wrong 0. */
export function labelCardPoints(correct: boolean, assist: HintLevel): number {
  return correct ? ASSIST_POINTS[assist] : 0;
}

export interface LabelResult {
  imageId: string;
  picked: Label;
  expected: Label;
  correct: boolean;
  /** Hint level showing when this card was answered. */
  assist: HintLevel;
  points: number;
}

export interface LabelLevelState {
  deck: readonly AiImage[];
  index: number;
  results: LabelResult[];
  /** Wrong answers so far in the level (correct answers never reset it). */
  wrongCount: number;
  /** Hint for the current card: after a wrong answer hintLevel(wrongCount); after a right one 'none'. */
  hint: HintLevel;
  streak: number;
  bestStreak: number;
  done: boolean;
  endReason: 'complete' | 'timeUp' | null;
}

export type LabelAction = { type: 'answer'; label: Label } | { type: 'timeUp' };

export function createLabelState(deck: readonly AiImage[]): LabelLevelState {
  const empty = deck.length === 0;
  return {
    deck,
    index: 0,
    results: [],
    wrongCount: 0,
    hint: 'none',
    streak: 0,
    bestStreak: 0,
    done: empty,
    endReason: empty ? 'complete' : null,
  };
}

export const labelStreakActive = (s: { streak: number }): boolean => s.streak >= STREAK_MIN;

export function labelReducer(state: LabelLevelState, action: LabelAction): LabelLevelState {
  if (state.done) return state;
  if (action.type === 'timeUp') return { ...state, done: true, endReason: 'timeUp' };
  const img = state.deck[state.index];
  if (!img) return { ...state, done: true, endReason: 'complete' };
  const correct = action.label === img.label;
  const wrongCount = state.wrongCount + (correct ? 0 : 1);
  const streak = correct ? state.streak + 1 : 0;
  const index = state.index + 1;
  const done = index >= state.deck.length;
  const result: LabelResult = {
    imageId: img.id,
    picked: action.label,
    expected: img.label,
    correct,
    assist: state.hint,
    points: labelCardPoints(correct, state.hint),
  };
  return {
    ...state,
    index,
    results: [...state.results, result],
    wrongCount,
    hint: done || correct ? 'none' : hintLevel(wrongCount),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    done,
    endReason: done ? 'complete' : null,
  };
}

/** The current card's true label (what the 'answer' helper reveals). */
export const labelCurrentAnswer = (s: LabelLevelState): Label | null => s.deck[s.index]?.label ?? null;

// ---------------------------------------------------------------------------
// Audit level (L4)
// ---------------------------------------------------------------------------

export type AuditVerdict = 'right' | 'flag';
export type AuditKind = 'caught' | 'missed' | 'falseFlag' | 'trusted';

export interface AuditResult {
  itemId: string;
  imageId: string;
  verdict: AuditVerdict;
  kind: AuditKind;
  /** caught or trusted. */
  correct: boolean;
  assist: HintLevel;
}

export interface AuditLevelState {
  items: readonly AuditItem[];
  /** Per item: whether the prediction is wrong (precomputed from the images). */
  wrong: readonly boolean[];
  index: number;
  results: AuditResult[];
  wrongCount: number;
  hint: HintLevel;
  streak: number;
  bestStreak: number;
  done: boolean;
  endReason: 'complete' | 'timeUp' | null;
}

export type AuditAction = { type: 'judge'; verdict: AuditVerdict } | { type: 'timeUp' };

export function auditKind(predictionWrong: boolean, verdict: AuditVerdict): AuditKind {
  if (predictionWrong) return verdict === 'flag' ? 'caught' : 'missed';
  return verdict === 'flag' ? 'falseFlag' : 'trusted';
}

export function createAuditState(items: readonly AuditItem[], imagesById: ImagesById): AuditLevelState {
  const empty = items.length === 0;
  return {
    items,
    wrong: items.map((i) => isPredictionWrong(i, imagesById)),
    index: 0,
    results: [],
    wrongCount: 0,
    hint: 'none',
    streak: 0,
    bestStreak: 0,
    done: empty,
    endReason: empty ? 'complete' : null,
  };
}

export function auditReducer(state: AuditLevelState, action: AuditAction): AuditLevelState {
  if (state.done) return state;
  if (action.type === 'timeUp') return { ...state, done: true, endReason: 'timeUp' };
  const item = state.items[state.index];
  if (!item) return { ...state, done: true, endReason: 'complete' };
  const kind = auditKind(state.wrong[state.index] ?? false, action.verdict);
  const correct = kind === 'caught' || kind === 'trusted';
  const wrongCount = state.wrongCount + (correct ? 0 : 1);
  const streak = correct ? state.streak + 1 : 0;
  const index = state.index + 1;
  const done = index >= state.items.length;
  return {
    ...state,
    index,
    results: [...state.results, { itemId: item.id, imageId: item.imageId, verdict: action.verdict, kind, correct, assist: state.hint }],
    wrongCount,
    hint: done || correct ? 'none' : hintLevel(wrongCount),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    done,
    endReason: done ? 'complete' : null,
  };
}

/** Right verdict for the current item (what the 'answer' helper reveals). */
export function auditCurrentAnswer(s: AuditLevelState): AuditVerdict | null {
  if (s.index >= s.items.length) return null;
  return s.wrong[s.index] ? 'flag' : 'right';
}

/** Wrong predictions dealt in the set (auditCatch denominator). */
export const auditWrongDealt = (s: AuditLevelState): number => s.wrong.filter(Boolean).length;

// ---------------------------------------------------------------------------
// Draw the Box (bonus L3)
// ---------------------------------------------------------------------------

export function judgeBox(drawn: Box, truth: Box, cfg: { good: number; perfect: number }): { iou: number; grade: BoxGrade } {
  const v = iou(drawn, truth);
  return { iou: v, grade: boxGrade(v, cfg.good, cfg.perfect) };
}

/** Helper after missed boxes in the level: 2 → 'hint', 3+ → 'answer' (show the true box). */
export const boxHintLevel = (misses: number): HintLevel => hintLevel(misses);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** (Σ L1 points + Σ L2 coveredPoints) / (l1Dealt + l2Dealt), 0–1. */
export function labelAccuracy(
  l1Results: readonly { points: number }[],
  l1Dealt: number,
  l2Points: readonly number[],
  l2Dealt: number,
): number {
  const dealt = Math.max(0, l1Dealt) + Math.max(0, l2Dealt);
  if (dealt <= 0) return 0;
  let pts = 0;
  for (const r of l1Results) pts += r.points;
  for (const p of l2Points) pts += p;
  return clamp(pts / dealt, 0, 1);
}

/** Σ L2 early bonuses / L2 dealt, 0–1. */
export function earlyGuessBonus(l2Bonuses: readonly number[], l2Dealt: number): number {
  if (l2Dealt <= 0) return 0;
  let s = 0;
  for (const b of l2Bonuses) s += b;
  return clamp(s / l2Dealt, 0, 1);
}

/**
 * clamp((Σ caught credit − 0.5·falseFlags) / wrongDealt, 0, 1). A catch is worth 1, or
 * 0.75 / 0.5 when the hint / answer was showing (§2: "the answer with reduced score").
 */
export function auditCatch(results: readonly { kind: AuditKind; assist?: HintLevel }[], wrongDealt: number): number {
  if (wrongDealt <= 0) return 0;
  let caught = 0;
  let falseFlags = 0;
  for (const r of results) {
    if (r.kind === 'caught') caught += ASSIST_POINTS[r.assist ?? 'none'];
    else if (r.kind === 'falseFlag') falseFlags++;
  }
  return clamp((caught - 0.5 * falseFlags) / wrongDealt, 0, 1);
}

/** Mean over dealt boxes of min(1, iou / perfect); boxes not drawn count 0. */
export function boxScore(ious: readonly number[], dealt: number, perfect: number): number {
  if (dealt <= 0) return 0;
  let s = 0;
  for (const v of ious) s += perfect > 0 ? clamp(v / perfect, 0, 1) : v > 0 ? 1 : 0;
  return clamp(s / dealt, 0, 1);
}

export interface AiStageScoreInput {
  labelAccuracy: number;
  early: number;
  audit: number;
  /** boxScore in full mode; null in booth mode (L3 not played). */
  box: number | null;
}

/** min(1, 0.55·label + 0.15·early + 0.30·audit + 0.05·(box ?? 0)). */
export function stageScore({ labelAccuracy: l, early, audit, box }: AiStageScoreInput): number {
  const u = (x: number) => clamp(x, 0, 1);
  return clamp(0.55 * u(l) + 0.15 * u(early) + 0.3 * u(audit) + 0.05 * u(box ?? 0), 0, 1);
}

/** Stars from the stage score and stage2.json `stars` thresholds. */
export function aiStars(score: number, t: { one: number; two: number; three: number }): StarCount {
  if (score >= t.three) return 3;
  if (score >= t.two) return 2;
  if (score >= t.one) return 1;
  return 0;
}

/** GameState['scores']['ai']; modelAccuracy per §3.2 using Stage 1's data accuracy. */
export function toAiScores(s: { labelAccuracy: number; early: number; audit: number }, dataAccuracy: number): Scores['ai'] {
  const label = clamp(s.labelAccuracy, 0, 1);
  const audit = clamp(s.audit, 0, 1);
  return {
    labelAccuracy: label,
    earlyGuessBonus: clamp(s.early, 0, 1),
    auditCatch: audit,
    modelAccuracy: modelAccuracy(label, dataAccuracy, audit),
  };
}
