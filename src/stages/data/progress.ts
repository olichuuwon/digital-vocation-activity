import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../state/storage';
import type { LevelOutcome } from './logic';

/**
 * Stage 1 level outcomes, kept until the stage result is saved to the run. Persisted so a
 * reload between L1 and L2 doesn't lose L1. Keyed by run (startedAt); a new run starts empty.
 */
export type EndPhase = 'reality' | 'automate' | 'result' | 'handoff';

interface Stage1Progress {
  runId: number | null;
  outcomes: Record<string, LevelOutcome>;
  outlier: number | null;
  /** After the last level: where the player is, so a reload resumes there (and can't re-roll stars). */
  endPhase: EndPhase | null;
  ruleChosen: boolean;
  setEnd: (runId: number, endPhase: EndPhase | null, ruleChosen?: boolean) => void;
  saveLevel: (runId: number, outcome: LevelOutcome) => void;
  saveOutlier: (runId: number, bonus: number) => void;
}

const empty = { outcomes: {}, outlier: null, endPhase: null, ruleChosen: false };

export const useStage1Progress = create<Stage1Progress>()(
  persist(
    (set) => ({
      runId: null,
      ...empty,
      saveLevel: (runId, outcome) =>
        set((s) => ({
          runId,
          outlier: s.runId === runId ? s.outlier : null,
          outcomes: { ...(s.runId === runId ? s.outcomes : {}), [outcome.levelId]: outcome },
        })),
      saveOutlier: (runId, bonus) =>
        set((s) => ({ runId, outlier: bonus, outcomes: s.runId === runId ? s.outcomes : {} })),
      setEnd: (runId, endPhase, ruleChosen) =>
        set((s) =>
          s.runId === runId
            ? { endPhase, ruleChosen: ruleChosen ?? s.ruleChosen }
            : { ...empty, runId, endPhase, ruleChosen: ruleChosen ?? false },
        ),
    }),
    {
      name: 'ship-it-stage1',
      storage: createJSONStorage(() => safeStorage),
      // Saved data is untrusted: anything malformed just starts the stage's tally fresh.
      merge: (persisted, current) => {
        const p = persisted as Partial<Stage1Progress> | null;
        const ok =
          p && typeof p.runId === 'number' && typeof p.outcomes === 'object' && p.outcomes !== null &&
          Object.values(p.outcomes).every((o) => o && Array.isArray(o.results) && typeof o.dealt === 'number');
        return ok
          ? {
              ...current,
              runId: p.runId!,
              outcomes: p.outcomes!,
              outlier: typeof p.outlier === 'number' ? p.outlier : null,
              endPhase: (['reality', 'automate', 'result', 'handoff'] as const).find((x) => x === p.endPhase) ?? null,
              ruleChosen: p.ruleChosen === true,
            }
          : current;
      },
    },
  ),
);

/** Outcomes and bonus for this run only. */
export function stage1For(runId: number) {
  const s = useStage1Progress.getState();
  return s.runId === runId
    ? { outcomes: Object.values(s.outcomes), outlier: s.outlier, endPhase: s.endPhase, ruleChosen: s.ruleChosen }
    : { outcomes: [], outlier: null, endPhase: null, ruleChosen: false };
}
