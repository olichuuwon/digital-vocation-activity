import { z } from 'zod';

/*
 * Finale "Mission Live" + Debrief content contract (spec §8). Numbers live in
 * src/content/finale.json (game-designer), words in src/content/finaleCopy.json (content-writer).
 * Families: base from the §3.2 formula (src/state/scoring.ts familiesReached), then Live Ops
 * incidents add or remove families; the total is clamped to 0–1200.
 */
const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });

export const TEAMS = ['data', 'ai', 'logic', 'cloud'] as const;
export const teamSchema = z.enum(TEAMS);
export type Team = z.infer<typeof teamSchema>;

export const incidentSchema = z.object({
  id: z.string().regex(/^inc\d{2}$/),
  team: teamSchema,
});

export const finaleFileSchema = z.object({
  /** Seconds the pipeline reveal counter takes (§8.1 ~20 s incl. reading). */
  revealSeconds: z.number().positive().max(30),
  liveOps: z.object({
    /** Incidents dealt per run (§8.2 "~8"), drawn from `incidents`, shuffled. */
    count: z.number().int().min(4).max(12),
    /** Seconds to route each incident (§8.2: 8). */
    secondsEach: z.number().int().min(3).max(20),
    /** Families added for a correct route and lost for a wrong route or time-out. */
    reward: z.number().int().min(0).max(200),
    penalty: z.number().int().min(0).max(200),
    /** Pause between incidents (ms), so feedback can be read. */
    gapMs: z.number().int().min(0).max(3000),
    /** Group mode with supports: "all hands" calls added to the deal (§8.2: 2). */
    allHandsCount: z.number().int().min(0).max(4),
    /** Seconds for every member to tap Ready on an all-hands call (§8.2: 5). */
    allHandsSeconds: z.number().int().min(3).max(15),
  }),
  incidents: z.array(incidentSchema).min(8),
  /** Rank titles by families reached (ascending thresholds; the highest met wins). */
  ranks: z.array(z.object({ id: z.string().min(1), min: z.number().int().min(0).max(1200) })).min(3),
});
export type FinaleContent = z.infer<typeof finaleFileSchema>;

const perTeam = <T extends z.ZodTypeAny>(t: T) => z.object({ data: t, ai: t, logic: t, cloud: t });

export const finaleCopySchema = z.object({
  reveal: z.object({
    heading: words(5),
    intro: words(20),
    data: txt,
    model: txt,
    logic: txt,
    uptime: txt,
    families: txt,
    go: words(4),
    notPlayed: txt,
  }),
  liveOps: z.object({
    heading: words(4),
    intro: words(25),
    start: words(3),
    incidentOf: txt,
    route: words(6),
    right: words(12),
    wrong: words(12),
    timeout: words(12),
    families: txt,
    done: words(10),
  }),
  /** Incident text keyed by finale.json incident id (§8.2 table + more). */
  incidents: z.record(z.string().regex(/^inc\d{2}$/), z.object({ text: words(14), why: words(16) })),
  /** Short team names on routing buttons: the specialisation names (D6, §8.2). */
  teamButtons: perTeam(words(4)),
  debrief: z.object({
    heading: words(5),
    familiesOf: txt,
    newBest: words(4),
    rankLabel: txt,
    /** Rank titles keyed by finale.json rank id. */
    ranks: z.record(z.string(), words(5)),
    matchHeading: words(5),
    matchIntro: words(15),
    /** One-liners (§8.3). DIS/career copy: NEEDS OWNER APPROVAL (D14). */
    roles: perTeam(words(15)),
    learnedHeading: words(5),
    whyHeading: words(6),
    /** 2–3 cards on why digital matters to DIS (§8.3). NEEDS OWNER APPROVAL (D14). */
    why: z.array(z.object({ title: words(6), body: words(35) })).min(2).max(3),
    soloNote: words(15),
    date: txt,
    playAgain: words(3),
    replayStage: words(4),
    chapterHeading: words(4),
    chapterIntro: words(15),
    leaderboard: words(3),
    home: words(3),
    back: words(4),
    /** "What you learned" for a stage skipped with stage select (never invent numbers). */
    skipped: words(10),
  }),
});
export type FinaleCopy = z.infer<typeof finaleCopySchema>;
