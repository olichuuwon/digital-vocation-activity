import { z } from 'zod';

/*
 * Stage 1 "Clean the Data" content contract (spec §4). Records and level config live in
 * src/content/records.json and src/content/stage1.json; logic in src/stages/data/logic.ts.
 */

const ruleId = z.number().int().min(1).max(5);

/** A household request card. Raw values as the player sees them (typos and units included). */
export const recordSchema = z
  .object({
    id: z.string().regex(/^r\d{2,3}$/),
    /** Household ID shown on the card, e.g. "H-1042". Rule 3 duplicates reuse another record's household. */
    household: z.string().regex(/^H-\d{4}$/),
    /** Raw sector text; null = missing. Valid clean values are single capital letters A–F. */
    sector: z.string().min(1).max(12).nullable(),
    people: z.number().int().nullable(),
    /** Raw water amount; null = missing. Valid range 5–200 L per household (rule 2). */
    water: z.object({ value: z.number(), unit: z.enum(['L', 'ml']) }).nullable(),
    status: z.enum(['valid', 'fixable', 'invalid']),
    /**
     * The rule that decides this card: the rule broken (invalid/fixable), or 5 for a valid
     * outlier ("unusual but possible"). Null for plain valid records.
     */
    rule: ruleId.nullable(),
    /** Fixable records only: 2–3 options, one correct. */
    fix: z
      .object({
        field: z.enum(['sector', 'water']),
        options: z.array(z.string().min(1)).min(2).max(3),
        correct: z.number().int().min(0).max(2),
      })
      .optional(),
    /** Rule 3 only: id of the record this one duplicates (must appear earlier in the deck). */
    duplicateOf: z.string().optional(),
    /** Fit for the 3-card tutorial: one-glance obvious, rule 1 only. */
    tutorial: z.boolean().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.status === 'fixable' && (!r.fix || r.fix.correct >= r.fix.options.length))
      ctx.addIssue({ code: 'custom', message: `${r.id}: fixable needs fix options with a valid correct index` });
    if (r.status !== 'fixable' && r.fix) ctx.addIssue({ code: 'custom', message: `${r.id}: only fixable records have fix` });
    if (r.status !== 'valid' && r.rule === null) ctx.addIssue({ code: 'custom', message: `${r.id}: needs the rule broken` });
    if (r.rule === 3 && !r.duplicateOf) ctx.addIssue({ code: 'custom', message: `${r.id}: rule 3 needs duplicateOf` });
  });

export const recordsFileSchema = z
  .object({ records: z.array(recordSchema).min(40) })
  .superRefine((f, ctx) => {
    const ids = new Set(f.records.map((r) => r.id));
    if (ids.size !== f.records.length) ctx.addIssue({ code: 'custom', message: 'duplicate record ids' });
    for (const r of f.records) {
      if (!r.duplicateOf) continue;
      const orig = f.records.find((o) => o.id === r.duplicateOf);
      if (!orig) ctx.addIssue({ code: 'custom', message: `${r.id}: duplicateOf ${r.duplicateOf} missing` });
      else if (orig.household !== r.household)
        ctx.addIssue({ code: 'custom', message: `${r.id}: household must match ${orig.id}` });
    }
  });

const cardLevel = z.object({
  id: z.enum(['data-tutorial', 'data-l1', 'data-l2']),
  /** Cards dealt per run (drawn from records allowed by `rules`). */
  count: z.number().int().min(3).max(15),
  /** Base seconds before relaxed ×1.5; null = untimed (tutorial). */
  seconds: z.number().int().positive().nullable(),
  /** Rules in play. Cards are only drawn if their rule is in this set (or they're plain valid). */
  rules: z.array(ruleId).min(1),
  /** Rules shown as "New rule" cards before the level starts. */
  newRules: z.array(ruleId),
  /** Whether the Fix action is available. */
  allowFix: z.boolean(),
  /** Minimum mix per run, e.g. { valid: 3, fixable: 3, invalid: 3 }. */
  mix: z.object({ valid: z.number().int().min(0), fixable: z.number().int().min(0), invalid: z.number().int().min(0) }),
});

const outlierChart = z.object({
  id: z.string(),
  /** What the bars show. */
  measure: z.enum(['people', 'water']),
  /** 20 households. */
  bars: z
    .array(z.object({ household: z.string().regex(/^H-\d{4}$/), value: z.number() }))
    .length(20),
  /** Indexes into `bars` that are errors (rule 2). Unusual-but-possible values are NOT errors (rule 5). */
  errors: z.array(z.number().int().min(0).max(19)).min(1).max(5),
});

export const stage1FileSchema = z.object({
  levels: z.array(cardLevel).length(3),
  outlier: z.object({
    id: z.literal('data-l3'),
    seconds: z.number().int().positive(),
    rules: z.array(ruleId),
    newRules: z.array(ruleId),
    charts: z.array(outlierChart).length(3),
  }),
  /** Reality Check follow-up (§4.3): one tap to pick the rule to automate. */
  automate: z.object({
    options: z
      .array(z.object({ id: z.string(), correct: z.boolean() }))
      .length(3)
      .refine((o) => o.filter((x) => x.correct).length === 1, 'exactly one correct option'),
  }),
  /** Star thresholds on the stage score (0–1), see logic.ts. */
  stars: z.object({ one: z.number(), two: z.number(), three: z.number() }),
});

export type DataRecord = z.infer<typeof recordSchema>;
export type Stage1Content = z.infer<typeof stage1FileSchema>;
export type CardLevel = z.infer<typeof cardLevel>;
export type OutlierChart = z.infer<typeof outlierChart>;

const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });

export const stage1CopySchema = z.object({
  levelIntro: z.object({ 'data-tutorial': words(25), 'data-l1': words(25), 'data-l2': words(25), 'data-l3': words(25) }),
  tutorialHint: z.object({ keep: words(12), trash: words(12) }),
  actions: z.object({ keep: words(2), fix: words(2), trash: words(2) }),
  fixPrompt: words(8),
  fieldLabels: z.object({ household: txt, sector: txt, people: txt, water: txt, missing: txt }),
  ruleShort: z.object({ '1': words(3), '2': words(3), '3': words(3), '4': words(3), '5': words(3) }),
  toast: z.object({
    correct: words(8),
    wrongKeep: words(8),
    wrongTrashValid: words(8),
    wrongTrashFixable: words(8),
    wrongFix: words(8),
    outlierKept: words(8),
    streak: words(8),
  }),
  hint: words(15),
  answer: words(15),
  hintKeep: words(15),
  answerKeep: words(15),
  answerFix: words(15),
  suggested: txt,
  nextCard: words(10),
  timeUp: words(8),
  outlier: z.object({
    instruction: words(20),
    chartPeople: txt,
    chartWater: txt,
    done: txt,
    missed: words(15),
    wrongTap: words(15),
    hintRange: words(20),
    answerErrors: words(15),
    unitPeople: txt,
    unitWater: txt,
    chartOf: txt,
  }),
  automate: z.object({
    question: words(12),
    options: z.object({ dupes: words(10), 'big-households': words(10), typos: words(10) }),
    right: words(20),
    wrong: words(20),
  }),
  result: z.object({
    heading3: txt,
    heading2: txt,
    heading1: txt,
    heading0: txt,
    accuracy: txt,
    fixed: txt,
    automated: txt,
  }),
  learned: words(25),
});

export type Stage1Copy = z.infer<typeof stage1CopySchema>;
