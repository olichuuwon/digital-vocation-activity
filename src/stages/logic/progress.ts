import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { programSchema, type Program } from '../../content/stage3Schema';
import { safeStorage } from '../../state/storage';
import type { LevelOutcome } from './logic';

/**
 * Stage 3 level outcomes, kept until the stage result is saved to the run. Persisted so a reload
 * between levels keeps earlier results. Keyed by run (startedAt); a new run starts empty.
 * `programs` keeps the player's solved programs: the Reality Check turns one into Python.
 */
export type EndPhase = 'reality' | 'result' | 'handoff';

interface Stage3Progress {
  runId: number | null;
  outcomes: Record<string, LevelOutcome>;
  programs: Record<string, Program>;
  endPhase: EndPhase | null;
  saveLevel: (runId: number, outcome: LevelOutcome, program: Program | null) => void;
  setEnd: (runId: number, endPhase: EndPhase | null) => void;
}

export const useStage3Progress = create<Stage3Progress>()(
  persist(
    (set) => ({
      runId: null,
      outcomes: {},
      programs: {},
      endPhase: null,
      saveLevel: (runId, outcome, program) =>
        set((s) => {
          const same = s.runId === runId;
          const programs = { ...(same ? s.programs : {}) };
          if (program) programs[outcome.levelId] = program;
          return {
            runId,
            endPhase: same ? s.endPhase : null,
            outcomes: { ...(same ? s.outcomes : {}), [outcome.levelId]: outcome },
            programs,
          };
        }),
      setEnd: (runId, endPhase) =>
        set((s) => (s.runId === runId ? { endPhase } : { runId, outcomes: {}, programs: {}, endPhase })),
    }),
    {
      name: 'ship-it-stage3',
      storage: createJSONStorage(() => safeStorage),
      // Saved data is untrusted: anything malformed starts the stage's tally fresh.
      merge: (persisted, current) => {
        const p = persisted as Partial<Stage3Progress> | null;
        const ok =
          p &&
          typeof p.runId === 'number' &&
          typeof p.outcomes === 'object' &&
          p.outcomes !== null &&
          Object.values(p.outcomes).every((o) => o && typeof o.solved === 'boolean' && typeof o.blocks === 'number') &&
          typeof p.programs === 'object' &&
          p.programs !== null &&
          Object.values(p.programs).every((prog) => programSchema.safeParse(prog).success);
        return ok
          ? {
              ...current,
              runId: p.runId!,
              outcomes: p.outcomes!,
              programs: p.programs!,
              endPhase: (['reality', 'result', 'handoff'] as const).find((x) => x === p.endPhase) ?? null,
            }
          : current;
      },
    },
  ),
);

/** This run's outcomes and programs only. */
export function stage3For(runId: number) {
  const s = useStage3Progress.getState();
  return s.runId === runId
    ? { outcomes: s.outcomes, programs: s.programs, endPhase: s.endPhase }
    : { outcomes: {} as Record<string, LevelOutcome>, programs: {} as Record<string, Program>, endPhase: null };
}
