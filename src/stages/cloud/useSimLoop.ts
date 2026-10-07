import { useEffect, useRef, useState } from 'react';
import type { Action, SimState } from '../../sim/cluster';

/**
 * Drives a cluster sim from requestAnimationFrame. `step` is stepManual/stepCluster. Pauses while
 * `running` is false or the tab is hidden; `speed` < 1 slows sim time (relaxed mode, §10).
 * Taps go through `act`, applied on the next frame. Re-renders at most every 100 ms (one tick).
 * `podHistory` samples the pod count once per sim second (for the pods graph, §7.4).
 */
export function useSimLoop(
  init: () => SimState,
  step: (s: SimState, dtMs: number, action: Action | null) => SimState,
  { running, speed = 1 }: { running: boolean; speed?: number },
) {
  const [view, setView] = useState<{ state: SimState; podHistory: number[] }>(() => {
    const s0 = init();
    return { state: s0, podHistory: [s0.pods.length] };
  });
  const ref = useRef(view.state);
  const history = useRef(view.podHistory);
  const pending = useRef<Action | null>(null);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let lastRender = 0;
    const frame = (now: number) => {
      const dt = Math.min(now - last, 250) * speed;
      last = now;
      if (!document.hidden && !ref.current.done) {
        const action = pending.current;
        pending.current = null;
        const next = stepRef.current(ref.current, dt, action);
        ref.current = next;
        const sec = Math.floor(next.tick / 10);
        if (history.current.length <= sec) history.current = [...history.current, next.pods.length];
        if (action || next.done || now - lastRender >= 100) {
          lastRender = now;
          setView({ state: next, podHistory: history.current });
        }
      }
      if (!ref.current.done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  const act = (a: Action) => {
    pending.current = a;
  };
  return { state: view.state, podHistory: view.podHistory, act };
}
