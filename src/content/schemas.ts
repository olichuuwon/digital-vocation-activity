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
  length: z.object({ heading: text, booth: text, boothDetail: text, full: text, fullDetail: text }),
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
});

export type StageContent = z.infer<typeof stageSchema>;
export type Copy = z.infer<typeof copySchema>;
