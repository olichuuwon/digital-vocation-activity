import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../state/storage';
import type { RouteResult } from './logic';

/**
 * Finale progress for this run: which incidents were dealt, how each was routed, and the final
 * result once the debrief is reached, so a reload can't replay Live Ops for a better score.
 */
export type FinalePhase = 'reveal' | 'intro' | 'live' | 'debrief';

interface FinaleProgress {
  runId: number | null;
  phase: FinalePhase;
  dealt: string[];
  results: RouteResult[];
  families: number | null;
  newBest: boolean;
  patch: (runId: number, p: Partial<Omit<FinaleProgress, 'runId' | 'patch'>>) => void;
}

const empty = { phase: 'reveal' as FinalePhase, dealt: [] as string[], results: [] as RouteResult[], families: null, newBest: false };
const PHASES: FinalePhase[] = ['reveal', 'intro', 'live', 'debrief'];
const RESULTS: RouteResult[] = ['right', 'wrong', 'timeout'];

export const useFinaleProgress = create<FinaleProgress>()(
  persist(
    (set) => ({
      runId: null,
      ...empty,
      patch: (runId, p) => set((s) => (s.runId === runId ? p : { ...empty, runId, ...p })),
    }),
    {
      name: 'ship-it-finale',
      storage: createJSONStorage(() => safeStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<FinaleProgress> | null;
        if (!p || typeof p.runId !== 'number') return current;
        const dealt = Array.isArray(p.dealt) && p.dealt.every((x) => typeof x === 'string') ? p.dealt : [];
        const results = Array.isArray(p.results) && p.results.every((x) => RESULTS.includes(x)) ? p.results : [];
        return {
          ...current,
          runId: p.runId,
          phase: PHASES.find((x) => x === p.phase) ?? 'reveal',
          dealt,
          results,
          families: typeof p.families === 'number' ? p.families : null,
          newBest: p.newBest === true,
        };
      },
    },
  ),
);

export function finaleFor(runId: number) {
  const s = useFinaleProgress.getState();
  return s.runId === runId
    ? { phase: s.phase, dealt: s.dealt, results: s.results, families: s.families, newBest: s.newBest }
    : { ...empty };
}
