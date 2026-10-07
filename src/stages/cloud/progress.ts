import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ClusterConfig } from '../../sim/cluster';
import { safeStorage } from '../../state/storage';

/**
 * Stage 4 results kept until the stage result is saved to the run: Phase A uptime, the chosen
 * config, Phase C result. Persisted so a reload between phases keeps them. Keyed by run.
 */
export type EndPhase = 'reality' | 'result';

export interface AutoResult {
  uptime: number;
  cost: number;
  budget: number;
}

interface Stage4Progress {
  runId: number | null;
  manualUptime: number | null;
  config: ClusterConfig | null;
  auto: AutoResult | null;
  /** Times the player went back to tweak settings after a replay. */
  tweaks: number;
  endPhase: EndPhase | null;
  patch: (runId: number, p: Partial<Omit<Stage4Progress, 'runId' | 'patch'>>) => void;
}

const empty = { manualUptime: null, config: null, auto: null, tweaks: 0, endPhase: null };
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export const useStage4Progress = create<Stage4Progress>()(
  persist(
    (set) => ({
      runId: null,
      ...empty,
      patch: (runId, p) => set((s) => (s.runId === runId ? p : { ...empty, runId, ...p })),
    }),
    {
      name: 'ship-it-stage4',
      storage: createJSONStorage(() => safeStorage),
      // Saved data is untrusted: anything malformed starts the stage fresh.
      merge: (persisted, current) => {
        const p = persisted as Partial<Stage4Progress> | null;
        if (!p || !isNum(p.runId)) return current;
        const c = p.config;
        const configOk =
          c === null ||
          (typeof c === 'object' &&
            typeof c.loadBalancer === 'boolean' &&
            isNum(c.minPods) &&
            isNum(c.maxPods) &&
            isNum(c.scaleUpCpu) &&
            typeof c.selfHealing === 'boolean' &&
            typeof c.rollingUpdate === 'boolean');
        const a = p.auto;
        const autoOk = a === null || (typeof a === 'object' && isNum(a.uptime) && isNum(a.cost) && isNum(a.budget));
        if (!configOk || !autoOk) return current;
        return {
          ...current,
          runId: p.runId,
          manualUptime: isNum(p.manualUptime) ? p.manualUptime : null,
          config: c ?? null,
          auto: a ?? null,
          tweaks: isNum(p.tweaks) ? p.tweaks : 0,
          endPhase: (['reality', 'result'] as const).find((x) => x === p.endPhase) ?? null,
        };
      },
    },
  ),
);

export function stage4For(runId: number) {
  const s = useStage4Progress.getState();
  return s.runId === runId
    ? { manualUptime: s.manualUptime, config: s.config, auto: s.auto, tweaks: s.tweaks, endPhase: s.endPhase }
    : { ...empty };
}
