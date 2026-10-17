import { LazyMotion, MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ToastHost } from '../components/Toast';
import { groupActions, useGroup, useGroupStore } from '../net/group';
import { useTeamRelaxedSync } from '../net/group/relaxedSync';
import { useGame } from '../state/store';
import type { Stage } from '../state/types';
import { DebugPanel } from './DebugPanel';
import { isDevComponentsPath, isHostPath, parseParams } from './params';
import { PipelineStrip } from './PipelineStrip';
import { useAnnouncer } from './screenFocus';
import { ScreenBoundary } from './ScreenBoundary';
import { GroupDebugBar } from './screens/GroupDebugBar';
import { GroupEnded } from './screens/GroupEnded';
import { GroupPill } from './screens/GroupPill';
import { Home } from './screens/Home';
import { StagePlaceholder } from './screens/StagePlaceholder';
import { SettingsDialog } from './SettingsDialog';
import ui from './ui.module.css';
import { useTheme } from './useTheme';

// Booth screen code (incl. the QR encoder) only loads on /host.
const Host = lazy(() => import('./screens/Host'));
const DevComponents = lazy(() => import('./screens/DevComponents'));
// Everything past Home loads on demand too (M7 perf: Lighthouse mobile ≥ 90). Stage 1 is
// prefetched once Home has painted, so Play starts without a wait.
const loadDataStage = () => import('../stages/data/DataStage');
const loadGroupLobby = () => import('./screens/GroupLobby');
const loadWaitingScreen = () => import('./screens/WaitingScreen');
const DataStage = lazy(() => loadDataStage().then((m) => ({ default: m.DataStage })));
const GroupCreate = lazy(() => import('./screens/GroupCreate').then((m) => ({ default: m.GroupCreate })));
const GroupJoin = lazy(() => import('./screens/GroupJoin').then((m) => ({ default: m.GroupJoin })));
const GroupLobby = lazy(() => loadGroupLobby().then((m) => ({ default: m.GroupLobby })));
const Leaderboard = lazy(() => import('./screens/Leaderboard').then((m) => ({ default: m.Leaderboard })));
const WaitingScreen = lazy(() => loadWaitingScreen().then((m) => ({ default: m.WaitingScreen })));
// Stages after the first load on demand, keeping the first load small (§11 perf budget).
const AiStage = lazy(() => import('../stages/ai/AiStage'));
const LogicStage = lazy(() => import('../stages/logic/LogicStage'));
const CloudStage = lazy(() => import('../stages/cloud/CloudStage'));
const FinaleStage = lazy(() => import('../stages/finale/FinaleStage'));

const loadMotion = () => import('./motionFeatures').then((r) => r.default);

export function App() {
  const route = useMemo(() => {
    const { pathname } = window.location;
    const base = import.meta.env.BASE_URL;
    return isHostPath(pathname, base) ? 'host' : isDevComponentsPath(pathname, base) ? 'dev' : 'game';
  }, []);
  // Framer Motion honours prefers-reduced-motion everywhere (§10). Its features load after first
  // paint (`m` components, LazyMotion strict), keeping ~30 KB gz off the critical path (M7 perf).
  return (
    <LazyMotion features={loadMotion} strict>
      <MotionConfig reducedMotion="user">
        {route === 'host' ? <HostApp /> : route === 'dev' ? <DevApp /> : <GameApp />}
      </MotionConfig>
    </LazyMotion>
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
  const theme = useGame((s) => s.settings.theme);
  useTheme(theme);
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}

function GameApp() {
  const params = useMemo(() => parseParams(window.location.search), []);
  const run = useGame((s) => s.run);
  const theme = useGame((s) => s.settings.theme);
  const announcement = useAnnouncer((s) => s.message);
  useTeamRelaxedSync();
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500));
    // Stage 1 and the team screens most players reach next, fetched while Home sits idle.
    idle(() => void Promise.all([loadDataStage(), loadGroupLobby(), loadWaitingScreen()]).catch(() => {}));
  }, []);
  // Reopening with a saved run lands on Home so the player can choose Resume (§3.1).
  // A ?join=CODE link (the lobby QR) opens Join with the code filled in.
  const [onHome, setOnHome] = useState(() => !(params.debug && params.stage !== null) && !params.join);
  const [boardOpen, setBoardOpen] = useState(false);
  const [groupScreen, setGroupScreen] = useState<'create' | 'join' | null>(params.join ? 'join' : null);
  const group = useGroup();
  const settingsOpen = useGame((s) => s.settingsOpen);
  const setSettingsOpen = (open: boolean) => useGame.setState({ settingsOpen: open });
  useTheme(theme);

  // Facilitator and debug params apply once on load.
  useEffect(() => {
    const g = useGame.getState();
    if (params.relaxed) useGame.setState({ relaxedThisSession: true });
    if (params.debug && params.stage !== null) {
      if (!g.run) g.startRun();
      // Only jump if not already there, so reloading mid-stage still resumes the level.
      if (useGame.getState().run?.stage !== params.stage) useGame.getState().jumpToStage(params.stage);
    }
  }, [params]);

  // Group play (§3.5): rejoin from this device's token after a reload; drop ?join from the
  // address bar so a later reload doesn't reopen Join.
  useEffect(() => {
    groupActions.resumeIfStored();
    if (params.join) {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      window.history.replaceState(null, '', url);
    }
  }, [params]);
  // Leaving a team goes straight Home (or, for free play after the debrief, into the stage
  // picked); a lobby or run reached from Create/Join replaces that screen.
  const leavingToReplay = useRef(false);
  useEffect(
    () =>
      useGroupStore.subscribe(({ snap }, prev) => {
        if (snap.ended === 'left' && prev.snap.ended !== 'left') {
          groupActions.dismiss();
          setGroupScreen(null);
          if (!leavingToReplay.current) setOnHome(true);
          leavingToReplay.current = false;
        }
        if (snap.status !== prev.snap.status && (snap.status === 'lobby' || snap.status === 'playing')) setGroupScreen(null);
      }),
    [],
  );

  const groupRun = group.active && run !== null && run.startedAt === group.snap.session?.startedAt;
  // Teammates not playing this stage see the waiting screen; the player (and everyone at the
  // debrief) sees the game.
  const waitingView = group.active && !onHome && (!groupRun || (!group.amMain && !run?.finishedAt));
  const inRun = run !== null && !onHome && (!group.active || groupRun);
  const leaveFinishedGroup = () => {
    if (group.active) groupActions.leave();
    setOnHome(true);
  };
  // Free play (§8.3): any stage, solo, on this phone. A team member leaves the team first.
  const replayStage = (stage: Stage) => {
    if (group.active) {
      leavingToReplay.current = true;
      groupActions.leave();
    }
    useGame.getState().replayFrom(stage);
    setOnHome(false);
  };

  return (
    <div className={ui.shell}>
      <header className={ui.topbar}>
        {run && (inRun || (waitingView && groupRun)) ? <PipelineStrip stage={run.stage} /> : <span style={{ flex: 1 }} />}
        <button
          type="button"
          className={ui.iconBtn}
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <span aria-hidden="true">⚙️</span>
        </button>
      </header>
      <ScreenBoundary>
      {group.snap.ended && group.snap.ended !== 'left' ? (
        <GroupEnded
          reason={group.snap.ended}
          onOk={() => {
            groupActions.dismiss();
            setOnHome(true);
          }}
        />
      ) : groupScreen === 'join' && (group.status === 'idle' || group.status === 'joining') ? (
        <GroupJoin
          initialCode={params.join ?? ''}
          onBack={() => {
            setGroupScreen(null);
            setOnHome(true);
          }}
        />
      ) : groupScreen === 'create' && group.status === 'idle' ? (
        <GroupCreate
          onBack={() => {
            setGroupScreen(null);
            setOnHome(true);
          }}
        />
      ) : !onHome && group.status === 'lobby' ? (
        <GroupLobby />
      ) : waitingView ? (
        <WaitingScreen />
      ) : inRun && run.stage === 1 ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <DataStage key={`${run.startedAt}-1-${run.levelIndex}`} run={run} debug={params.debug} />
        </main>
      ) : inRun && run.stage === 2 ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <AiStage key={`${run.startedAt}-2-${run.levelIndex}`} run={run} debug={params.debug} />
        </main>
      ) : inRun && run.stage === 3 ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <LogicStage key={`${run.startedAt}-3-${run.levelIndex}`} run={run} debug={params.debug} />
        </main>
      ) : inRun && run.stage === 4 ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <CloudStage key={`${run.startedAt}-4-${run.levelIndex}`} run={run} debug={params.debug} />
        </main>
      ) : inRun && run.stage === 5 ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <FinaleStage
            key={`${run.startedAt}-5`}
            run={run}
            onHome={leaveFinishedGroup}
            onReplay={replayStage}
            onLeaderboard={() => {
              setOnHome(true);
              setBoardOpen(true);
            }}
          />
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
          onEnter={() => setOnHome(false)}
          onLeaderboard={() => setBoardOpen(true)}
          onCreateGroup={() => {
            setGroupScreen('create');
            setOnHome(false);
          }}
          onJoinGroup={() => {
            setGroupScreen('join');
            setOnHome(false);
          }}
        />
      )}
      </ScreenBoundary>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
      <ToastHost />
      <GroupPill />
      {params.debug && <DebugPanel />}
      {params.debug && params.fakePeers > 0 && <GroupDebugBar />}
    </div>
  );
}
