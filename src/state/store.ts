import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { levelsFor, stageContent } from '../content';
import { nextPosition } from './progress';
import { gameStateSchema, settingsSchema } from './schema';
import { safeStorage } from './storage';
import type { Discipline, GameState, Mode, Scores, Settings, Stage, StarCount } from './types';

export const STORAGE_KEY = 'ship-it';

export const DEFAULT_SETTINGS: Settings = { theme: 'system', sound: false, relaxed: false };

type Persisted = Pick<Store, 'run' | 'bestFamilies' | 'settings' | 'chapterUnlocked'>;

/** Validates saved data so a bad save falls back to defaults instead of crashing (no dead ends). */
export function sanitisePersisted(raw: unknown): Persisted {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const settings = settingsSchema.safeParse(p.settings);
  const best = typeof p.bestFamilies === 'number' && p.bestFamilies >= 0 ? Math.floor(p.bestFamilies) : 0;
  const parsed = gameStateSchema.safeParse(p.run);
  let run: GameState | null = parsed.success ? parsed.data : null;
  if (run) {
    const content = stageContent(run.stage);
    const max = content ? levelsFor(content, run.mode).length - 1 : 0;
    run = { ...run, levelIndex: Math.min(run.levelIndex, max) };
  }
  return {
    run,
    bestFamilies: best,
    settings: settings.success ? settings.data : DEFAULT_SETTINGS,
    chapterUnlocked: p.chapterUnlocked === true,
  };
}

export function newRun(mode: Mode, now = Date.now()): GameState {
  return {
    mode,
    stage: 0,
    levelIndex: 0,
    scores: {
      data: { accuracy: 0, fixedCount: 0, ruleChosen: false },
      ai: { labelAccuracy: 0, earlyGuessBonus: 0, auditCatch: 0, modelAccuracy: 0 },
      logic: { puzzlesSolved: 0, hintsUsed: 0, efficiency: 0, extraBlocks: 0 },
      cloud: { manualUptime: 0, autoUptime: 0, costEfficiency: 0 },
      finale: { familiesReached: 0, incidentsRouted: 0 },
    },
    stars: { data: 0, ai: 0, logic: 0, cloud: 0 },
    bestFamilies: 0,
    startedAt: now,
  };
}

interface Store {
  run: GameState | null;
  /** Best families across runs; survives starting a new run. */
  bestFamilies: number;
  /** "Replay a stage" (chapter select) unlocks after the first finished run (§8.3). */
  chapterUnlocked: boolean;
  settings: Settings;
  /** ?relaxed=1 for this page load only, so a shared booth phone doesn't stay relaxed. */
  relaxedThisSession: boolean;
  /** Group mode: a teammate has relaxed timers on, so the main phone's timers relax too. Not persisted. */
  teamRelaxed: boolean;
  /** Settings sheet open: every level timer and sim clock pauses (WCAG 2.2.1). Not persisted. */
  settingsOpen: boolean;
  startRun: (mode: Mode) => void;
  completeLevel: () => void;
  /** Save a stage's normalised scores and stars (persisted with the run). */
  recordStage: <D extends Discipline>(d: D, scores: Scores[D], stars: StarCount) => void;
  jumpToStage: (stage: Stage) => void;
  /** Debrief reached: record families, best score, unlock chapter select. Idempotent per run. */
  finishRun: (families: number, incidentsRouted?: number) => void;
  /** Chapter select: replay from a stage (keeps earlier scores; the run continues from there). */
  replayFrom: (stage: Stage) => void;
  quitRun: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

export const useGame = create<Store>()(
  persist(
    (set) => ({
      run: null,
      bestFamilies: 0,
      chapterUnlocked: false,
      settings: DEFAULT_SETTINGS,
      relaxedThisSession: false,
      teamRelaxed: false,
      settingsOpen: false,
      startRun: (mode) => set((s) => ({ run: { ...newRun(mode), bestFamilies: s.bestFamilies } })),
      completeLevel: () =>
        set((s) => (s.run ? { run: { ...s.run, ...nextPosition(s.run, s.run.mode) } } : s)),
      recordStage: (d, scores, stars) =>
        set((s) =>
          s.run ? { run: { ...s.run, scores: { ...s.run.scores, [d]: scores }, stars: { ...s.run.stars, [d]: stars } } } : s,
        ),
      jumpToStage: (stage) => set((s) => (s.run ? { run: { ...s.run, stage, levelIndex: 0 } } : s)),
      finishRun: (families, incidentsRouted = 0) =>
        set((s) => {
          if (!s.run) return s;
          const best = Math.max(s.bestFamilies, families);
          return {
            bestFamilies: best,
            chapterUnlocked: true,
            run: {
              ...s.run,
              finishedAt: s.run.finishedAt ?? Date.now(),
              scores: { ...s.run.scores, finale: { familiesReached: families, incidentsRouted } },
            },
          };
        }),
      replayFrom: (stage) =>
        set((s) => {
          if (!s.run) return s;
          const { finishedAt: _done, ...rest } = s.run;
          void _done;
          return { run: { ...rest, stage, levelIndex: 0, replays: (rest.replays ?? 0) + 1 } };
        }),
      quitRun: () => set({ run: null }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): Persisted => ({ run: s.run, bestFamilies: s.bestFamilies, settings: s.settings, chapterUnlocked: s.chapterUnlocked }),
      // Older save versions go through the same validation as current ones.
      migrate: (persisted) => sanitisePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitisePersisted(persisted) }),
    },
  ),
);

/** Effective relaxed-timer setting (§10): the player's choice or the facilitator's URL param. */
export const useRelaxed = () => useGame((s) => s.settings.relaxed || s.relaxedThisSession || s.teamRelaxed);
