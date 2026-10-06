import { useGame } from '../state/store';
import type { Stage } from '../state/types';

const STAGES: Stage[] = [0, 1, 2, 3, 4, 5];

/** ?debug=1 overlay (§11): stage skip buttons, seed and live scores. */
export function DebugPanel() {
  const run = useGame((s) => s.run);
  const jumpToStage = useGame((s) => s.jumpToStage);
  if (!run) return null;
  return (
    <details className="debug-panel">
      <summary>Debug</summary>
      <div className="debug-row">
        {STAGES.map((st) => (
          <button key={st} type="button" onClick={() => jumpToStage(st)} aria-pressed={run.stage === st}>
            {st === 0 ? 'P' : st === 5 ? 'F' : st}
          </button>
        ))}
      </div>
      <p>
        mode {run.mode} · stage {run.stage} · level {run.levelIndex} · seed {run.startedAt}
      </p>
      <pre>{JSON.stringify({ scores: run.scores, stars: run.stars }, null, 1)}</pre>
    </details>
  );
}
