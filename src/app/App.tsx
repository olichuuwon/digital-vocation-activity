import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { DebugPanel } from './DebugPanel';
import { parseParams } from './params';
import { PipelineStrip } from './PipelineStrip';
import { useAnnouncer } from './screenFocus';
import { Home } from './screens/Home';
import { StagePlaceholder } from './screens/StagePlaceholder';
import { SettingsDialog } from './SettingsDialog';
import ui from './ui.module.css';
import { useTheme } from './useTheme';

export function App() {
  const params = useMemo(() => parseParams(window.location.search), []);
  const run = useGame((s) => s.run);
  const theme = useGame((s) => s.settings.theme);
  const announcement = useAnnouncer((s) => s.message);
  // Reopening with a saved run lands on Home so the player can choose Resume (§3.1).
  const [onHome, setOnHome] = useState(() => !(params.debug && params.stage !== null));
  const [settingsOpen, setSettingsOpen] = useState(false);
  useTheme(theme);

  // Facilitator and debug params apply once on load.
  useEffect(() => {
    const g = useGame.getState();
    if (params.relaxed) useGame.setState({ relaxedThisSession: true });
    if (params.debug && params.stage !== null) {
      if (!g.run) g.startRun(params.mode ?? 'booth');
      // Only jump if not already there, so reloading mid-stage still resumes the level.
      if (useGame.getState().run?.stage !== params.stage) useGame.getState().jumpToStage(params.stage);
    }
  }, [params]);

  const inRun = run !== null && !onHome;

  return (
    <div className={ui.shell}>
      <header className={ui.topbar}>
        {inRun ? <PipelineStrip stage={run.stage} /> : <span style={{ flex: 1 }} />}
        <button
          type="button"
          className={ui.iconBtn}
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <span aria-hidden="true">⚙️</span>
        </button>
      </header>
      {inRun ? (
        <StagePlaceholder
          key={`${run.stage}-${run.levelIndex}`}
          run={run}
          onHome={() => setOnHome(true)}
        />
      ) : (
        <Home facilitatorMode={params.mode} onEnter={() => setOnHome(false)} />
      )}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      {params.debug && <DebugPanel />}
    </div>
  );
}
