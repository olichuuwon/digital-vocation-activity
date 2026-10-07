import { MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ToastHost } from '../components/Toast';
import { useGame } from '../state/store';
import { DebugPanel } from './DebugPanel';
import { isDevComponentsPath, isHostPath, parseParams } from './params';
import { PipelineStrip } from './PipelineStrip';
import { useAnnouncer } from './screenFocus';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { StagePlaceholder } from './screens/StagePlaceholder';
import { DataStage } from '../stages/data/DataStage';
import { SettingsDialog } from './SettingsDialog';
import ui from './ui.module.css';
import { useTheme } from './useTheme';

// Booth screen code (incl. the QR encoder) only loads on /host.
const Host = lazy(() => import('./screens/Host'));
const DevComponents = lazy(() => import('./screens/DevComponents'));

export function App() {
  const route = useMemo(() => {
    const { pathname } = window.location;
    const base = import.meta.env.BASE_URL;
    return isHostPath(pathname, base) ? 'host' : isDevComponentsPath(pathname, base) ? 'dev' : 'game';
  }, []);
  // Framer Motion honours prefers-reduced-motion everywhere (§10).
  return (
    <MotionConfig reducedMotion="user">
      {route === 'host' ? <HostApp /> : route === 'dev' ? <DevApp /> : <GameApp />}
    </MotionConfig>
  );
}

function DevApp() {
  const theme = useGame((s) => s.settings.theme);
  const announcement = useAnnouncer((s) => s.message);
  useTheme(theme);
  return (
    <div className={ui.shell}>
      <Suspense fallback={null}>
        <DevComponents />
      </Suspense>
      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </div>
  );
}

function HostApp() {
  const params = useMemo(() => parseParams(window.location.search), []);
  const theme = useGame((s) => s.settings.theme);
  useTheme(theme);
  return (
    <Suspense fallback={null}>
      <Host mode={params.mode} />
    </Suspense>
  );
}

function GameApp() {
  const params = useMemo(() => parseParams(window.location.search), []);
  const run = useGame((s) => s.run);
  const theme = useGame((s) => s.settings.theme);
  const announcement = useAnnouncer((s) => s.message);
  // Reopening with a saved run lands on Home so the player can choose Resume (§3.1).
  const [onHome, setOnHome] = useState(() => !(params.debug && params.stage !== null));
  const [boardOpen, setBoardOpen] = useState(false);
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
      {inRun && run.stage === 1 ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <DataStage key={`${run.startedAt}-1-${run.levelIndex}`} run={run} debug={params.debug} />
        </main>
      ) : inRun ? (
        <StagePlaceholder
          key={`${run.stage}-${run.levelIndex}`}
          run={run}
          onHome={() => setOnHome(true)}
        />
      ) : boardOpen ? (
        <Leaderboard debug={params.debug} onBack={() => setBoardOpen(false)} />
      ) : (
        <Home
          facilitatorMode={params.mode}
          onEnter={() => setOnHome(false)}
          onLeaderboard={() => setBoardOpen(true)}
        />
      )}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      <ToastHost />
      {params.debug && <DebugPanel />}
    </div>
  );
}
