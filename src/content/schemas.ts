import { z } from 'zod';

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const levelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bonus: z.boolean(),
});

export const stageSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  discipline: z.enum(['data', 'ai', 'logic', 'cloud']),
  specialisation: z.enum([
    'Data Science',
    'Artificial Intelligence Engineering',
    'Software Development',
    'Cloud Engineering',
  ]),
  short: z.string().min(1).max(10),
  title: z.string().min(1),
  icon: z.string().min(1),
  colour: hex,
  levels: z.array(levelSchema).min(1),
});

export const stagesFileSchema = z.object({
  stages: z.array(stageSchema).length(4),
});

const text = z.string().min(1);
export const copySchema = z.object({
  home: z.object({
    title: text, tagline: text, playSolo: text, createGroup: text, joinGroup: text,
    leaderboard: text, comingSoon: text, resume: text, newRun: text,
  }),
  length: z.object({
    heading: text, booth: text, boothDetail: text, full: text, fullDetail: text,
    stageHeading: text, fromStart: text, finale: text, devNote: text,
  }),
  settings: z.object({
    heading: text, theme: text, themeSystem: text, themeLight: text, themeDark: text,
    sound: text, relaxed: text, quit: text, close: text,
  }),
  placeholder: z.object({ note: text, finishLevel: text, finale: text, finaleNote: text, backHome: text }),
  leaderboard: z.object({
    heading: text, tabsLabel: text, today: text, all: text, dateLabel: text, allTime: text,
    allTimeNote: text, dateNote: text, todayNote: text, loading: text, emptyToday: text,
    emptyDate: text, emptyAll: text, error: text, unavailable: text, retry: text, back: text,
    rank: text, players: text, families: text, finished: text, you: text, pinned: text,
    soloNote: text, count: text, testSubmit: text, testSubmitted: text, testFailed: text,
  }),
  host: z.object({
    heading: text, scan: text, qrAlt: text, board: text, updated: text, playing: text,
    playingSoon: text, facilitator: text, facilitatorNote: text, pinLabel: text, unlock: text,
    lock: text, refresh: text, checking: text, wrongPin: text, locked: text, notConfigured: text,
    networkError: text, noneToday: text, hide: text, unhide: text, hiddenTag: text,
    hiddenDone: text, shownDone: text, stale: text,
  }),
  components: z.object({
    timeLeft: text, secondsLeft: text, timeUp: text, paused: text, starsLabel: text, continue: text,
    next: text, skip: text, done: text, cardOf: text, gotIt: text, tutorialLabel: text,
    handoffHeading: text, handoffSoloHeading: text, handoffBody: text, handoffSoloBody: text,
    ready: text, rulebook: text, newRule: text, rulesInPlay: text, close: text, hint: text,
    answer: text, devHeading: text, extend: text, extendLabel: text, extended: text,
    toastSuccess: text, toastError: text, tutorialHint: text,
  }),
});

export type StageContent = z.infer<typeof stageSchema>;
export type Copy = z.infer<typeof copySchema>;

// ---------------------------------------------------------------------------------------
// M1 shared-component content. Word limits come from CLAUDE.md rule 1 and spec §2/§7.2/§9.
// ---------------------------------------------------------------------------------------
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const maxWords = (n: number) =>
  z.string().min(1).refine((s) => wordCount(s) <= n, { message: `must be ${n} words or fewer` });

const stageNum = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const briefingsFileSchema = z.object({
  briefings: z
    .array(
      z.object({
        stage: stageNum,
        heading: maxWords(6),
        body: maxWords(25),
        go: maxWords(3),
      }),
    )
    .length(4),
});

export const rulebookFileSchema = z.object({
  heading: maxWords(4),
  rules: z
    .array(
      z.object({
        id: z.number().int().min(1).max(5),
        title: maxWords(6),
        body: maxWords(25),
        examples: z.array(z.object({ before: z.string().min(1), after: z.string().min(1) })).max(3),
      }),
    )
    .length(5),
});

export const realityVisual = z.enum([
  'records-to-millions',
  'training-curve',
  'night-road',
  'blocks-to-python',
  'test-maps',
  'pods',
  'load-balancer',
  'autoscaler',
  'self-healing',
  'rolling-update',
  'sre-alerts',
]);

/** Placeholders a Reality Check card may use, with defaults so `{name}` never shows raw. */
export const REALITY_DEFAULTS = { handCleaned: 20, failing: 0, labelled: 20 };
export type RealityVars = typeof REALITY_DEFAULTS;

export const realityCheckSchema = z.object({
  id: z.enum(['data', 'ai', 'logic', 'cloud-k8s', 'cloud-end']),
  heading: maxWords(6),
  /** Career/DIS-facing copy must be approved by the owner before release (D14). */
  needsApproval: z.boolean(),
  cards: z.array(z.object({ visual: realityVisual, title: maxWords(5).optional(), body: maxWords(40) })).min(1).max(6),
});

export const realityChecksFileSchema = z
  .object({ checks: z.array(realityCheckSchema).length(5) })
  .refine(
    (f) => f.checks.find((c) => c.id === 'cloud-k8s')?.cards.every((c) => wordCount(c.body) <= 20) ?? false,
    { message: 'Kubernetes cards must be 20 words or fewer (§7.2)' },
  );

export type Briefing = z.infer<typeof briefingsFileSchema>['briefings'][number];
export type Rule = z.infer<typeof rulebookFileSchema>['rules'][number];
export type RealityCheckContent = z.infer<typeof realityCheckSchema>;
export type RealityVisual = z.infer<typeof realityVisual>;

/**
 * Feature flags (src/content/flags.json). stageSelect: solo players pick a starting stage after the
 * run length (dev/testing; switch off before the event so solo runs play in order).
 */
export const flagsSchema = z.object({ stageSelect: z.boolean() });
