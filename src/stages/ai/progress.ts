import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../state/storage';

/**
 * Stage 2 level outcomes, kept until the stage result is saved to the run. Persisted so a reload
 * between levels keeps earlier results. Keyed by run (startedAt); a new run starts empty.
 */
export type EndPhase = 'reality' | 'result' | 'handoff';

export interface AiOutcome {
  levelId: 'ai-l1' | 'ai-l2' | 'ai-l3' | 'ai-l4';
  /** Items dealt (unanswered at time-up count as 0). */
  dealt: number;
  /** L1/L2: label credit per answered item. L3: IoU per box. L4: unused. */
  points: number[];
  /** L2: early-guess bonus per answered item. */
  bonuses?: number[];
  /** L4: verdict kinds ('caught' | 'missed' | 'falseFlag' | 'trusted'). */
  kinds?: string[];
  /** L4: wrong predictions dealt. */
  wrongDealt?: number;
}

interface Stage2Progress {
  runId: number | null;
  outcomes: Record<string, AiOutcome>;
  endPhase: EndPhase | null;
  saveLevel: (runId: number, outcome: AiOutcome) => void;
  setEnd: (runId: number, endPhase: EndPhase | null) => void;
}

const isNumArr = (x: unknown) => Array.isArray(x) && x.every((n) => typeof n === 'number');

export const useStage2Progress = create<Stage2Progress>()(
  persist(
    (set) => ({
      runId: null,
      outcomes: {},
      endPhase: null,
      saveLevel: (runId, outcome) =>
        set((s) => ({
          runId,
          endPhase: s.runId === runId ? s.endPhase : null,
          outcomes: { ...(s.runId === runId ? s.outcomes : {}), [outcome.levelId]: outcome },
        })),
      setEnd: (runId, endPhase) =>
        set((s) => (s.runId === runId ? { endPhase } : { runId, outcomes: {}, endPhase })),
    }),
    {
      name: 'ship-it-stage2',
      storage: createJSONStorage(() => safeStorage),
      // Saved data is untrusted: anything malformed starts the stage's tally fresh.
      merge: (persisted, current) => {
        const p = persisted as Partial<Stage2Progress> | null;
        const ok =
          p &&
          typeof p.runId === 'number' &&
          typeof p.outcomes === 'object' &&
          p.outcomes !== null &&
          Object.values(p.outcomes).every(
            (o) => o && typeof o.dealt === 'number' && isNumArr(o.points) && (o.bonuses === undefined || isNumArr(o.bonuses)),
          );
        return ok
          ? {
              ...current,
              runId: p.runId!,
              outcomes: p.outcomes!,
              endPhase: (['reality', 'result', 'handoff'] as const).find((x) => x === p.endPhase) ?? null,
            }
          : current;
      },
    },
  ),
);

/** Outcomes for this run only. */
export function stage2For(runId: number) {
  const s = useStage2Progress.getState();
  return s.runId === runId ? { outcomes: s.outcomes, endPhase: s.endPhase } : { outcomes: {}, endPhase: null };
}
