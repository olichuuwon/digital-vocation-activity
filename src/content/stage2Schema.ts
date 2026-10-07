import { z } from 'zod';

/*
 * Stage 2 "Teach the Machine to See" content contract (spec §5). Images live in
 * src/content/aiImages.json, level config in src/content/stage2.json, text in
 * src/content/stage2Copy.json. Logic: src/stages/ai/logic.ts, src/sim/iou.ts, src/sim/reveal.ts.
 *
 * Images are flat SVG scenes drawn in-repo (§5.4) on a 100×100 canvas. The labelled item is
 * drawn to fill `box` exactly, so the box is true by construction (Draw the Box uses it).
 */

/** The 8 relief classes (§5.2). */
export const LABELS = [
  'water',
  'food',
  'medical-kit',
  'blanket',
  'tent',
  'generator',
  'flooded-road',
  'clear-road',
] as const;
export const labelSchema = z.enum(LABELS);
export type Label = z.infer<typeof labelSchema>;

/** [x, y, w, h] in canvas units (0–100). */
export const boxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([x, y, w, h]) => x >= 0 && y >= 0 && w >= 12 && h >= 12 && x + w <= 100 && y + h <= 100, {
    message: 'box must sit inside the 100×100 canvas and be at least 12×12',
  });
export type Box = z.infer<typeof boxSchema>;

/** Small background props. Never people or faces (§5.4). */
export const decorKind = z.enum(['tree', 'house', 'cloud', 'crate', 'puddle', 'lamp', 'sign', 'bush']);

export const aiImageSchema = z.object({
  id: z.string().regex(/^ai\d{2,3}$/),
  label: labelSchema,
  /** Night images are kept out of training levels: "your model never saw night photos" (§5.3). */
  variant: z.enum(['day', 'night']),
  /** Backdrop the item sits on. */
  bg: z.enum(['street', 'shelter', 'field', 'warehouse']),
  /** Where the item is drawn (and its true bounding box). */
  box: boxSchema,
  /** Colour/shape variation of the item drawing, 0–2. */
  style: z.number().int().min(0).max(2),
  /** Props drawn behind the item. Each centre (x, y) must sit outside `box`. */
  decor: z
    .array(z.object({ kind: decorKind, x: z.number().min(0).max(100), y: z.number().min(0).max(100), s: z.number().min(4).max(30) }))
    .max(4)
    .default([]),
  /** Fit for the untimed tutorial: one glance, unmistakable. */
  tutorial: z.boolean().optional(),
  /** Attribution (§5.4). In-repo SVGs: "Ship It (in-repo SVG)" / "Project-owned". */
  source: z.string().min(1),
  licence: z.string().min(1),
});
export type AiImage = z.infer<typeof aiImageSchema>;

export const aiImagesFileSchema = z
  .object({ images: z.array(aiImageSchema).min(56) })
  .superRefine((f, ctx) => {
    const ids = new Set(f.images.map((i) => i.id));
    if (ids.size !== f.images.length) ctx.addIssue({ code: 'custom', message: 'duplicate image ids' });
    for (const l of LABELS) {
      const n = f.images.filter((i) => i.label === l && i.variant === 'day').length;
      if (n < 6) ctx.addIssue({ code: 'custom', message: `need ≥6 day images of ${l}, have ${n}` });
    }
    const night = f.images.filter((i) => i.variant === 'night');
    if (night.length < 6) ctx.addIssue({ code: 'custom', message: 'need ≥6 night images (§5.4)' });
    if (night.some((i) => i.label !== 'flooded-road' && i.label !== 'clear-road'))
      ctx.addIssue({ code: 'custom', message: 'night images are road images only' });
    for (const i of f.images) {
      const [x, y, w, h] = i.box;
      for (const d of i.decor)
        if (d.x > x && d.x < x + w && d.y > y && d.y < y + h)
          ctx.addIssue({ code: 'custom', message: `${i.id}: decor centre inside the item box` });
    }
  });

/** One "your model says…" row for Audit the AI (§5.1 L4). */
export const auditItemSchema = z.object({
  id: z.string().regex(/^au\d{2}$/),
  imageId: z.string(),
  predicted: labelSchema,
  /** 0–1. Shown as a percentage. */
  confidence: z.number().min(0.3).max(0.99),
});
export type AuditItem = z.infer<typeof auditItemSchema>;

const seconds = z.number().int().positive();

export const stage2FileSchema = z.object({
  tutorial: z.object({
    id: z.literal('ai-tutorial'),
    /** Images shown (untimed), with `options` labels each. */
    count: z.number().int().min(1).max(3),
    options: z.number().int().min(2).max(4),
  }),
  label: z.object({
    id: z.literal('ai-l1'),
    count: z.number().int().min(6).max(20),
    seconds,
    options: z.literal(4),
  }),
  covered: z.object({
    id: z.literal('ai-l2'),
    count: z.number().int().min(4).max(12),
    seconds,
    options: z.literal(4),
    /** Tile grid side (4 → 4×4). */
    grid: z.number().int().min(3).max(6),
    /** One tile uncovers every N ms (§5.1: 600). */
    revealEveryMs: z.number().int().min(200).max(2000),
    /** Tiles uncovered before the first auto-reveal. */
    startTiles: z.number().int().min(0).max(4),
    /** Extra tiles uncovered by a wrong guess (§5.1: 1). */
    wrongGuessTiles: z.number().int().min(0).max(4),
    /** Points lost per wrong guess (0–1 scale per image). */
    wrongGuessPenalty: z.number().min(0).max(0.5),
    /** Solo stand-in for the support's Reveal power (§3.5.2): uncover-one-tile taps per level. */
    revealCharges: z.number().int().min(0).max(5),
  }),
  box: z.object({
    id: z.literal('ai-l3'),
    count: z.number().int().min(3).max(8),
    seconds,
    /** IoU thresholds (§5.1). */
    good: z.number().min(0).max(1),
    perfect: z.number().min(0).max(1),
  }),
  audit: z.object({
    id: z.literal('ai-l4'),
    count: z.number().int().min(6).max(10),
    seconds,
    /** Wrong predictions per dealt set (including the high-confidence wrong one). */
    wrongPerSet: z.number().int().min(2).max(5),
    /** "Low confidence" is below this; "high confidence" is at or above `high`. */
    low: z.number(),
    high: z.number(),
    pool: z.array(auditItemSchema).min(16),
  }),
  /** Label pairs that look alike, used as the "tricky" distractor in label options. */
  confusable: z.array(z.tuple([labelSchema, labelSchema])).min(3),
  /** Star thresholds on the stage score (0–1), see logic.ts. */
  stars: z.object({ one: z.number(), two: z.number(), three: z.number() }),
});
export type Stage2Content = z.infer<typeof stage2FileSchema>;

// ---------------------------------------------------------------------------------------
// Copy (content-writer). Word limits: CLAUDE.md rule 1 (≤25 per instruction card).
// ---------------------------------------------------------------------------------------
const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });

const perLabel = <T extends z.ZodTypeAny>(t: T) =>
  z.object({
    water: t,
    food: t,
    'medical-kit': t,
    blanket: t,
    tent: t,
    generator: t,
    'flooded-road': t,
    'clear-road': t,
  });

export const stage2CopySchema = z.object({
  levelIntro: z.object({
    'ai-tutorial': words(25),
    'ai-l1': words(25),
    'ai-l2': words(25),
    'ai-l3': words(25),
    'ai-l4': words(25),
  }),
  tutorialHint: words(12),
  /** Short label names on buttons ("Medical kit"). */
  labels: perLabel(words(3)),
  /** Field guide (§3.5.2 support card, solo as a sheet): what each class looks like. */
  fieldGuide: z.object({
    button: words(3),
    heading: words(4),
    intro: words(15),
    entries: perLabel(words(12)),
  }),
  question: words(6),
  imageAlt: txt,
  nextImage: words(10),
  toast: z.object({
    correct: words(8),
    wrong: words(10),
    streak: words(8),
  }),
  hint: words(15),
  answer: words(15),
  timeUp: words(8),
  covered: z.object({
    instruction: words(20),
    tilesLeft: txt,
    reveal: words(4),
    revealLeft: txt,
    early: words(8),
    wrongTile: words(12),
    allShown: words(12),
  }),
  box: z.object({
    instruction: words(20),
    findLabel: words(8),
    lock: words(3),
    move: words(3),
    resize: words(3),
    left: txt,
    right: txt,
    up: txt,
    down: txt,
    wider: txt,
    narrower: txt,
    taller: txt,
    shorter: txt,
    perfect: words(10),
    good: words(10),
    miss: words(12),
    hint: words(15),
    answer: words(15),
    overlap: txt,
    credit: words(25),
  }),
  audit: z.object({
    instruction: words(20),
    says: txt,
    confidence: txt,
    right: words(3),
    flag: words(3),
    caught: words(10),
    missed: words(12),
    falseFlag: words(12),
    trusted: words(10),
    hint: words(15),
    answer: words(15),
  }),
  result: z.object({
    heading3: txt,
    heading2: txt,
    heading1: txt,
    heading0: txt,
    labels: txt,
    early: txt,
    audit: txt,
    model: txt,
    box: txt,
  }),
  learned: words(25),
  /** Screen-reader-only text (§10). */
  a11y: z.object({
    suggested: txt,
    ruledOut: txt,
    night: words(8),
    where: txt,
    places: z.object({ top: txt, middle: txt, bottom: txt, left: txt, centre: txt, right: txt }),
    boxReadout: txt,
  }),
});
export type Stage2Copy = z.infer<typeof stage2CopySchema>;
