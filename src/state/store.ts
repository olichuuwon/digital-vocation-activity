import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { hasBonus, levelsFor, stageContent } from '../content';
import { nextPosition } from './progress';
import { gameStateSchema, settingsSchema } from './schema';
import { safeStorage } from './storage';
import type { Discipline, GameState, Scores, Settings, Stage, StarCount } from './types';

export const STORAGE_KEY = 'ship-it';

export const DEFAULT_SETTINGS: Settings = { theme: 'system', sound: false, relaxed: false };

type Persisted = Pick<Store, 'run' | 'bestFamilies' | 'settings'>;

/** Validates saved data so a bad save falls back to defaults instead of crashing (no dead ends). */
export function sanitisePersisted(raw: unknown): Persisted {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const settings = settingsSchema.safeParse(p.settings);
  const best = typeof p.bestFamilies === 'number' && p.bestFamilies >= 0 ? Math.floor(p.bestFamilies) : 0;
  const parsed = gameStateSchema.safeParse(p.run);
  let run: GameState | null = parsed.success ? parsed.data : null;
  if (run) {
    const content = stageContent(run.stage);
    const max = content ? levelsFor(content, hasBonus(run)).length - 1 : 0;
    run = { ...run, levelIndex: Math.min(run.levelIndex, max) };
  }
  return {
    run,
    bestFamilies: best,
    settings: settings.success ? settings.data : DEFAULT_SETTINGS,
  };
}

export function newRun(now = Date.now()): GameState {
  return {
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
  settings: Settings;
  /** ?relaxed=1 for this page load only, so a shared booth phone doesn't stay relaxed. */
  relaxedThisSession: boolean;
  /** Group mode: a teammate has relaxed timers on, so the main phone's timers relax too. Not persisted. */
  teamRelaxed: boolean;
  /** Settings sheet open: every level timer and sim clock pauses (WCAG 2.2.1). Not persisted. */
  settingsOpen: boolean;
  startRun: () => void;
  completeLevel: () => void;
  /** Save a stage's normalised scores and stars (persisted with the run). */
  recordStage: <D extends Discipline>(d: D, scores: Scores[D], stars: StarCount) => void;
  jumpToStage: (stage: Stage) => void;
  /** Debrief reached: record families and best score. Idempotent per run. */
  finishRun: (families: number, incidentsRouted?: number) => void;
  /**
   * Free play after a finished run: replay one stage, with the bonus levels unlocked. When it
   * ends the run goes straight back to its debrief (keeping the other scores). Never ranked.
   */
  replayFrom: (stage: Stage) => void;
  quitRun: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

export const useGame = create<Store>()(
  persist(
    (set) => ({
      run: null,
      bestFamilies: 0,
      settings: DEFAULT_SETTINGS,
      relaxedThisSession: false,
      teamRelaxed: false,
      settingsOpen: false,
      startRun: () => set((s) => ({ run: { ...newRun(), bestFamilies: s.bestFamilies } })),
      completeLevel: () =>
        set((s) => {
          if (!s.run) return s;
          const next = nextPosition(s.run);
          // A one-stage replay ends when that stage does: back to the run's debrief.
          if (s.run.replaying !== undefined && next.stage !== s.run.stage) {
            const { replaying: _r, ...rest } = s.run;
            void _r;
            return { run: { ...rest, stage: 5, levelIndex: 0, finishedAt: Date.now() } };
          }
          return { run: { ...s.run, ...next } };
        }),
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
          return { run: { ...rest, stage, levelIndex: 0, replays: (rest.replays ?? 0) + 1, replaying: stage } };
        }),
      quitRun: () => set({ run: null }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): Persisted => ({ run: s.run, bestFamilies: s.bestFamilies, settings: s.settings }),
      // Older save versions go through the same validation as current ones.
      migrate: (persisted) => sanitisePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitisePersisted(persisted) }),
    },
  ),
);

/** Effective relaxed-timer setting (§10): the player's choice or the facilitator's URL param. */
export const useRelaxed = () => useGame((s) => s.settings.relaxed || s.relaxedThisSession || s.teamRelaxed);
