import { useEffect, useMemo, useRef, useState } from 'react';
import { buzz } from '../../app/haptics';
import { useAnnouncer, useScreenHeading } from '../../app/screenFocus';
import { BriefingCard } from '../../components/BriefingCard';
import { HintBox } from '../../components/HintBox';
import { RealityCheck } from '../../components/RealityCheck';
import { StarResult } from '../../components/StarResult';
import { Timer } from '../../components/Timer';
import { toast, useToast } from '../../components/toastStore';
import { TutorialOverlay } from '../../components/TutorialOverlay';
import ui from '../../components/components.module.css';
import { briefingFor, fill, levelsFor, realityCheck, stageContent } from '../../content';
import {
  BASE_RPS,
  CPU_MAX,
  CPU_MIN,
  cloudScores,
  cloudStageScore,
  cloudStars,
  costPerMin,
  createTraffic,
  DEFAULT_CONFIG,
  initCluster,
  initManual,
  normalizeConfig,
  PHASE_TICKS,
  PODS_MAX,
  PODS_MIN,
  previewCluster,
  stepCluster,
  stepManual,
  summarize,
  uptimeSoFar,
  type Action,
  type ClusterConfig,
  type Pod,
  type SimState,
  type Traffic,
} from '../../sim/cluster';
import { useGame, useRelaxed } from '../../state/store';
import { RELAXED_FACTOR } from '../../state/timer';
import type { GameState } from '../../state/types';
import { c, t } from './content';
import { appQuality, diagnose } from './logic';
import { stage4For, useStage4Progress, type EndPhase, type ReplayResult } from './progress';
import { useSimLoop } from './useSimLoop';
import s from './cloud.module.css';
import { publish, useActions } from '../../net/group';
import { sc } from '../support/content';
import { BOOST, CONFIG, RESTART, S4C, S4M, configPatchSchema, podActionSchema, useCoop } from '../support/topics';

type LevelId = 'cloud-manual' | 'cloud-configure' | 'cloud-replay';
type Phase = 'briefing' | 'k8s' | 'intro' | 'play' | EndPhase;

/** Rounded down, so 99.7% uptime never shows as a perfect 100% (3★ needs 99%). */
const pct = (x: number) => Math.floor(x * 100 + 1e-9);
const levelName = (id: LevelId) => stageContent(4)!.levels.find((l) => l.id === id)?.name ?? '';
/** Most "Tweak settings" round trips after a replay. */
const MAX_TWEAKS = 2;
/** Base seconds for Phase B (§7.3 "~60s"); relaxed ×1.5 and +30s apply via Timer. */
const CONFIGURE_SECONDS = 60;
/** A good-enough setup shown as the answer after two tweaks (no dead ends). */
const SUGGESTED: ClusterConfig = { loadBalancer: true, minPods: 2, maxPods: 10, scaleUpCpu: 0.65, selfHealing: true, rollingUpdate: true };

/**
 * `?debug=1&simSpeed=N` runs the storm N× faster (tests and demos only; ignored without debug).
 */
function debugSpeed(debug: boolean): number {
  if (!debug) return 1;
  const n = Number(new URLSearchParams(window.location.search).get('simSpeed'));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 1;
}

/** The storm: same seed for Phase A and C (§7.5); bigger for a better app (§3.2). */
function useTraffic(run: GameState): Traffic {
  return useMemo(() => createTraffic(run.startedAt, { intensity: appQuality(run.scores) }), [run.startedAt, run.scores]);
}

/**
 * Stage 4 "Keep It Alive" (§7). Mounted once per level (App keys it by stage + level).
 * A: manual → Kubernetes Reality Check → B: configure → C: replay → "This is a real job" → stars.
 */
export default function CloudStage({ run, debug }: { run: GameState; debug: boolean }) {
  const stage = stageContent(4)!;
  const levels = levelsFor(stage, run.mode);
  const levelId = (levels[run.levelIndex]?.id ?? 'cloud-manual') as LevelId;
  const saved = stage4For(run.startedAt);
  const isLast = levelId === 'cloud-replay';
  const [phase, setPhaseState] = useState<Phase>(() => {
    if (isLast && saved.endPhase) return saved.endPhase;
    if (levelId === 'cloud-manual') return 'briefing';
    if (levelId === 'cloud-configure' && !saved.cardsSeen) return 'k8s';
    return 'intro';
  });
  const completeLevel = useGame((g) => g.completeLevel);
  const traffic = useTraffic(run);
  const setPhase = (p: Phase) => {
    if (p === 'reality' || p === 'result') useStage4Progress.getState().patch(run.startedAt, { endPhase: p });
    setPhaseState(p);
  };

  if (phase === 'briefing') return <BriefingCard briefing={briefingFor(4)!} stage={stage} onGo={() => setPhase('intro')} />;
  if (phase === 'k8s')
    return (
      <RealityCheck
        check={realityCheck('cloud-k8s')}
        onDone={() => {
          useStage4Progress.getState().patch(run.startedAt, { cardsSeen: true });
          setPhase('intro');
        }}
      />
    );
  if (phase === 'intro') return <LevelIntro levelId={levelId} onStart={() => setPhase('play')} />;

  if (phase === 'play') {
    if (levelId === 'cloud-manual')
      return (
        <ManualPlay
          traffic={traffic}
          debug={debug}
          onDone={(uptime) => {
            useStage4Progress.getState().patch(run.startedAt, { manualUptime: uptime });
            completeLevel();
          }}
        />
      );
    if (levelId === 'cloud-configure')
      return (
        <Configure
          traffic={traffic}
          initial={saved.draft ?? saved.config ?? DEFAULT_CONFIG}
          tweaks={saved.tweaks}
          onDraft={(draft) => useStage4Progress.getState().patch(run.startedAt, { draft })}
          onDone={(config) => {
            useStage4Progress.getState().patch(run.startedAt, { config });
            completeLevel();
          }}
        />
      );
    return (
      <Replay
        traffic={traffic}
        config={saved.config ?? DEFAULT_CONFIG}
        manualUptime={saved.manualUptime ?? 0}
        saved={saved.lastReplay}
        onFinished={(r) => useStage4Progress.getState().patch(run.startedAt, { lastReplay: r })}
        canTweak={saved.tweaks < MAX_TWEAKS}
        debug={debug}
        onTweak={() => {
          useStage4Progress.getState().patch(run.startedAt, { tweaks: saved.tweaks + 1, auto: null, lastReplay: null });
          // Back to Phase B (one level earlier); the Kubernetes cards aren't repeated.
          useGame.setState((g) => (g.run ? { run: { ...g.run, levelIndex: Math.max(0, g.run.levelIndex - 1) } } : g));
        }}
        onAccept={(auto) => {
          useStage4Progress.getState().patch(run.startedAt, { auto });
          setPhase('reality');
        }}
      />
    );
  }

  if (phase === 'reality') return <RealityCheck check={realityCheck('cloud-end')} onDone={() => setPhase('result')} />;

  const auto = saved.auto ?? { uptime: 0, cost: 0, budget: traffic.budget };
  const scores = cloudScores({ manualUptime: saved.manualUptime ?? 0, autoUptime: auto.uptime, cost: auto.cost, budget: auto.budget });
  const stars = cloudStars(cloudStageScore(scores));
  const heading = [c.result.heading0, c.result.heading1, c.result.heading2, c.result.heading3][stars]!;
  return (
    <StarResult
      stars={stars}
      heading={heading}
      lines={[
        fill(c.result.manual, { pct: pct(scores.manualUptime) }),
        fill(c.result.auto, { pct: pct(scores.autoUptime) }),
        fill(c.result.cost, { n: Math.round(auto.cost), budget: auto.budget }),
      ]}
      onContinue={() => {
        useGame.getState().recordStage('cloud', scores, stars);
        // Stage done: a later replay (chapter select, M6) starts fresh.
        useStage4Progress.getState().patch(run.startedAt, { endPhase: null });
        completeLevel();
      }}
    />
  );
}

function LevelIntro({ levelId, onStart }: { levelId: LevelId; onStart: () => void }) {
  const name = levelName(levelId);
  const headingRef = useScreenHeading<HTMLHeadingElement>(name);
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {name}
      </h1>
      <p className={ui.body}>{c.levelIntro[levelId]}</p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onStart}>
          Start
        </button>
      </div>
    </section>
  );
}

/** Phase clock: how much of the storm is left (sim time, so it slows in relaxed mode). */
function Clock({ tick }: { tick: number }) {
  return (
    <div className={s.clock} aria-hidden="true">
      <span className={s.clockFill} style={{ width: `${Math.max(0, 100 - (tick / PHASE_TICKS) * 100)}%` }} />
    </div>
  );
}

/** Ticks left in the storm when "30 seconds left" is spoken (the clock bar is visual only). */
const STORM_WARN_TICKS = 300;
/** Sim ticks between "overloaded" warnings for the same server (5 s). */
const OVERLOAD_WARN_GAP = 50;

/**
 * Live feedback for things that happen to the cluster: one toast or announcement at a time, never
 * per tick. Events the player didn't cause use 'info' toasts (no "Wrong:" prefix) plus a buzz.
 * Screen readers also hear a warning when a server goes over 100% (it crashes 1.5 s later) and
 * when 30 seconds of storm are left.
 */
function useClusterEvents(state: SimState, auto: boolean, selfHealing = false) {
  const announce = useAnnouncer((a) => a.announce);
  const prev = useRef<SimState | null>(null);
  const lastScale = useRef(-1e9);
  const lastWarn = useRef(new Map<number, number>());
  const lastCrash = useRef(-1e9);
  const pendingCrashes = useRef(0);
  const lastHeal = useRef(-1e9);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!p || state.done) return;
    if (p.tick < PHASE_TICKS - STORM_WARN_TICKS && state.tick >= PHASE_TICKS - STORM_WARN_TICKS)
      announce(fill(c.manual.stormLeft, { s: STORM_WARN_TICKS / 10 }));
    const was = new Map(p.pods.map((x) => [x.id, x]));
    // The scripted hardware fault (§7: shows why self-healing matters) gets its own message.
    if (p.faultPod < 0 && state.faultPod >= 0) {
      const n = state.faultPod + 1;
      buzz('error');
      lastCrash.current = state.tick;
      return void toast(
        !auto ? fill(c.manual.faultToast, { n }) : fill(selfHealing ? c.replay.faultHealed : c.replay.faultNoHeal, { n }),
        'info',
      );
    }
    const newlyCrashed = state.pods.filter((x) => x.status === 'crashed' && was.get(x.id)?.status !== 'crashed');
    const crashed = newlyCrashed[0];
    // With self-healing on, Kubernetes fixes crashes: only the "replaced it" news is worth a toast.
    if (crashed && !(auto && selfHealing)) {
      pendingCrashes.current += newlyCrashed.length;
      // One crash toast per 3 s of sim time; a cascade becomes a single "N pods crashed" summary.
      if (state.tick - lastCrash.current >= 30) {
        const n = pendingCrashes.current;
        lastCrash.current = state.tick;
        pendingCrashes.current = 0;
        buzz('error');
        const msg = auto
          ? n > 1
            ? fill(c.replay.crashes, { n })
            : fill(c.replay.podCrashed, { n: crashed.id + 1 })
          : fill(c.manual.crashToast, { n: crashed.id + 1 });
        return void toast(msg, 'info');
      }
      return;
    }
    if (p.deploy !== 'bad' && state.deploy === 'bad') {
      buzz('error');
      return void toast(c.manual.deployToast, 'info');
    }
    if (p.deploy === 'bad' && state.deploy === 'rolledBack') return void toast(c.manual.rolledBack, 'success');
    if (p.deploy === 'canary' && state.deploy === 'rolledBack') return void toast(c.replay.autoRollback, 'info');
    // Manual mode only: the player must act before a hot server crashes (1.5 s later).
    const hot = auto ? undefined : state.pods.find((x) => x.status === 'ready' && x.cpu > 1 && (was.get(x.id)?.cpu ?? 0) <= 1);
    if (hot && state.tick - (lastWarn.current.get(hot.id) ?? -1e9) >= OVERLOAD_WARN_GAP) {
      lastWarn.current.set(hot.id, state.tick);
      announce(fill(c.manual.overloaded, { n: hot.id + 1 }));
    }
    if (!auto) return;
    // "Kubernetes replaced it" only when self-healing did it, at most every 6 s.
    const healed = selfHealing && state.pods.find((x) => x.status === 'ready' && was.get(x.id)?.status === 'crashed');
    if (healed && state.tick - lastHeal.current >= 60) {
      lastHeal.current = state.tick;
      return void toast(c.replay.healed, 'info');
    }
    // Scale events: at most one toast every 6 s of sim time.
    if (state.tick - lastScale.current < 60) return;
    if (state.pods.length > p.pods.length) {
      lastScale.current = state.tick;
      toast(c.replay.scaledUp, 'info');
    } else if (state.pods.length < p.pods.length) {
      lastScale.current = state.tick;
      toast(c.replay.scaledDown, 'info');
    }
  }, [state, auto, selfHealing, announce]);
}

function PodBar({ pod }: { pod: Pod }) {
  const over = pod.cpu > 1;
  return (
    <span className={s.bar} aria-hidden="true">
      <span className={s.barFill} data-over={over || undefined} style={{ width: `${Math.min(100, pct(pod.cpu))}%` }} />
    </span>
  );
}

/**
 * Bottom bar during a storm (thumb zone, §9): Pause/Resume and Roll back. Both stay rendered, so
 * focus never drops when the bad update is rolled back (Roll back is aria-disabled until needed).
 */
function StormBar({
  paused,
  onPause,
  canRollback,
  onRollback,
  fast,
  onFast,
}: {
  paused: boolean;
  onPause: () => void;
  canRollback: boolean;
  onRollback: () => void;
  fast?: boolean;
  onFast?: () => void;
}) {
  return (
    <div className={`${s.go} ${s.stormBar}`}>
      {/* The bad-update notice grows the bar upwards, so the server cards never jump mid-tap. */}
      {canRollback && <BadUpdate />}
      <div className={s.barButtons}>
      {onFast && (
        <button type="button" className={ui.btn} aria-pressed={!!fast} onClick={onFast}>
          <span aria-hidden="true">⏩ </span>
          {c.replay.fastForward}
        </button>
      )}
      <button type="button" className={ui.btn} aria-pressed={paused} onClick={onPause}>
        <span aria-hidden="true">{paused ? '▶ ' : '⏸ '}</span>
        {paused ? c.manual.resume : c.manual.pause}
      </button>
      <button
        type="button"
        className={`${ui.btn} ${s.rollback}`}
        data-kind="rollback"
        aria-disabled={!canRollback || undefined}
        onClick={() => canRollback && onRollback()}
      >
        <span aria-hidden="true">↩ </span>
        {c.manual.rollback}
      </button>
      </div>
    </div>
  );
}

function usePause() {
  const [paused, setPaused] = useState(false);
  const announce = useAnnouncer((a) => a.announce);
  const toggle = () => {
    setPaused((p) => {
      if (!p) announce(c.manual.paused);
      return !p;
    });
  };
  return { paused, toggle };
}

function BadUpdate() {
  return (
    <div className={s.banner}>
      <span>
        <span aria-hidden="true">⚠️ </span>
        {c.manual.badDeploy}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Phase A: manual
// ---------------------------------------------------------------------------------------

function ManualPlay({ traffic, debug, onDone }: { traffic: Traffic; debug: boolean; onDone: (uptime: number) => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(levelName('cloud-manual'));
  const settingsOpen = useGame((g) => g.settingsOpen);
  const relaxed = useRelaxed();
  const announce = useAnnouncer((a) => a.announce);
  const [tutorialSeen, setTutorialSeen] = useState(false);
  const { paused, toggle } = usePause();
  const { state, act } = useSimLoop(() => initManual(traffic), stepManual, {
    running: tutorialSeen && !settingsOpen && !paused,
    speed: (relaxed ? 1 / RELAXED_FACTOR : 1) * debugSpeed(debug),
  });
  useClusterEvents(state, false);
  // Group mode (§3.5.2): each support phone runs its servers' Boost and Restart buttons.
  const coop = useCoop();
  useEffect(() => {
    if (!coop) return;
    publish(S4M, {
      pods: state.pods.map((p) => ({
        id: p.id,
        status: p.status,
        cpu: Math.min(5, p.cpu),
        boosted: p.boostTicks > 0,
        cooling: p.boostCooldown > 0,
      })),
    });
  }, [coop, state]);
  useEffect(() => () => publish(S4M, null), []);
  useActions((a) => {
    const p = podActionSchema.safeParse(a.payload);
    if (!p.success) return;
    if (a.type === BOOST) act({ type: 'boost', pod: p.data.pod });
    if (a.type === RESTART) act({ type: 'restart', pod: p.data.pod });
  });
  const uptime = uptimeSoFar(state);
  const mult = Math.max(1, Math.round(state.last.demand / (BASE_RPS * traffic.scale)));
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state.done) return;
    announce(fill(c.manual.stormOver, { pct: pct(uptimeSoFar(state)) }));
    continueRef.current?.focus();
  }, [state.done]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={s.level}>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {levelName('cloud-manual')}
      </h1>
      <div className={s.stats} data-testid="manual-stats" data-uptime={debug ? uptime.toFixed(3) : undefined}>
        <span>{fill(c.manual.uptime, { pct: pct(uptime) })}</span>
        <span>{fill(c.manual.traffic, { n: mult })}</span>
      </div>
      <Clock tick={state.tick} />
      {!tutorialSeen && <TutorialOverlay gesture="tap" text={c.tutorialHint} onDismiss={() => setTutorialSeen(true)} />}
      {coop && (
        <p className={s.help} data-testid="ask-servers">
          <span aria-hidden="true">📣 </span>
          {sc.main.askServers}
        </p>
      )}
      <ul className={s.servers} role="list">
        {[...state.pods]
          .sort((a, b) => a.id - b.id)
          .map((pod) => (
            <ServerCard key={pod.id} pod={pod} act={act} buttons={!coop} />
          ))}
      </ul>
      {state.done ? (
        <div className={s.go}>
          <button ref={continueRef} type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => onDone(uptime)}>
            {t.continue}
          </button>
        </div>
      ) : (
        tutorialSeen && (
          <StormBar paused={paused} onPause={toggle} canRollback={state.deploy === 'bad'} onRollback={() => act({ type: 'rollback' })} />
        )
      )}
    </section>
  );
}

function ServerCard({ pod, act, buttons = true }: { pod: Pod; act: (a: Action) => void; buttons?: boolean }) {
  const name = fill(c.manual.server, { n: pod.id + 1 });
  const busy = fill(c.manual.busy, { pct: pct(pod.cpu) });
  let label: string = c.manual.boost;
  let kind = 'boost';
  let off = false;
  let state = busy;
  if (pod.status === 'crashed') {
    label = c.manual.restart;
    kind = 'restart';
    state = c.manual.crashed;
  } else if (pod.status === 'starting') {
    label = c.manual.rebooting;
    off = true;
    state = c.manual.rebooting;
  } else if (pod.boostTicks > 0) {
    label = c.manual.boosted;
    off = true;
  } else if (pod.boostCooldown > 0) {
    label = c.manual.cooling;
    off = true;
  }
  return (
    <li className={s.server} data-status={pod.status} data-testid="server">
      <span className={s.serverName}>
        <span aria-hidden="true">{pod.status === 'crashed' ? '💥' : '🖥️'}</span>
        {name}
        <span className={s.serverState}>{state}</span>
      </span>
      {buttons ? (
        <button
          type="button"
          className={s.act}
          data-kind={kind}
          aria-disabled={off || undefined}
          aria-label={`${label}: ${name}`}
          onClick={() => !off && act({ type: kind === 'restart' ? 'restart' : 'boost', pod: pod.id })}
        >
          {label}
        </button>
      ) : (
        <span aria-hidden="true">{pod.status === 'crashed' ? '🆘' : ''}</span>
      )}
      <PodBar pod={pod} />
    </li>
  );
}

// ---------------------------------------------------------------------------------------
// Phase B: configure the cluster
// ---------------------------------------------------------------------------------------

function Toggle({ value, onChange, labelledBy, describedBy }: { value: boolean; onChange: (v: boolean) => void; labelledBy: string; describedBy: string }) {
  return (
    <span className={s.toggle} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      <button type="button" aria-pressed={value} onClick={() => onChange(true)}>
        {value && <span aria-hidden="true">✓ </span>}
        {c.configure.on}
      </button>
      <button type="button" aria-pressed={!value} onClick={() => onChange(false)}>
        {c.configure.off}
      </button>
    </span>
  );
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  labelledBy,
  describedBy,
  format = String,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  labelledBy: string;
  describedBy: string;
  format?: (v: number) => string;
}) {
  return (
    <span className={s.stepper} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      <button
        type="button"
        aria-label={`${c.configure.fewer}: ${label}`}
        aria-disabled={value <= min || undefined}
        onClick={() => value > min && onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <output>{format(value)}</output>
      <button
        type="button"
        aria-label={`${c.configure.more}: ${label}`}
        aria-disabled={value >= max || undefined}
        onClick={() => value < max && onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </span>
  );
}

function Configure({
  traffic,
  initial,
  tweaks,
  onDraft,
  onDone,
}: {
  traffic: Traffic;
  initial: ClusterConfig;
  tweaks: number;
  onDraft: (c: ClusterConfig) => void;
  onDone: (c: ClusterConfig) => void;
}) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.configure.heading);
  // Toasts from the storm would cover the timer: start this screen clean.
  useEffect(() => useToast.getState().clear(), []);
  const announce = useAnnouncer((a) => a.announce);
  const [config, setConfigState] = useState<ClusterConfig>(initial);
  // The live cost meter (§7.3): a dry run of this setup against the storm, cost only.
  const cost = useMemo(() => previewCluster(config, traffic).cost, [config, traffic]);
  const over = cost > traffic.budget;
  const costText = `${fill(c.configure.cost, { n: Math.round(cost) })} · ${fill(c.configure.budget, { n: traffic.budget })}`;
  // One announcement per change: the setting's new value, then the cost (debounced for the slider).
  const pendingSay = useRef<string | null>(null);
  useEffect(() => {
    if (pendingSay.current === null) return;
    const said = `${pendingSay.current} ${costText}. ${over ? c.configure.overBudget : c.configure.underBudget}`;
    pendingSay.current = null;
    onDraft(config);
    const id = setTimeout(() => announce(said), 400);
    return () => clearTimeout(id);
  }, [config, costText, over, announce]); // eslint-disable-line react-hooks/exhaustive-deps
  const setConfig = (patch: Partial<ClusterConfig>, setting: string, value: string) => {
    pendingSay.current = fill(c.configure.changed, { setting, value });
    setConfigState((x) => normalizeConfig({ ...x, ...patch }));
  };
  // Group mode (§3.5.2): settings are split across support phones; everyone sees the budget.
  const coop = useCoop();
  useEffect(() => {
    if (coop) publish(S4C, { config, cost, budget: traffic.budget });
  }, [coop, config, cost, traffic.budget]);
  useEffect(() => () => publish(S4C, null), []);
  useActions((a) => {
    if (a.type !== CONFIG) return;
    const p = configPatchSchema.safeParse(a.payload);
    if (!p.success) return;
    const [key, value] = Object.entries(p.data)[0] ?? [];
    if (key === undefined) return;
    setConfig(p.data, key, String(value));
  });
  const onOff = (v: boolean) => (v ? c.configure.on : c.configure.off);
  const hint = tweaks >= 2 ? 'answer' : tweaks >= 1 ? 'hint' : 'none';
  const answer = [
    `${c.configure.loadBalancer}, ${c.configure.selfHealing}, ${c.configure.rolling}: ${c.configure.on}`,
    `${c.configure.minPods} ${SUGGESTED.minPods}`,
    `${c.configure.maxPods} ${SUGGESTED.maxPods}`,
    fill(c.configure.threshold, { pct: pct(SUGGESTED.scaleUpCpu) }),
  ].join(' · ');
  const thresholdPct = pct(config.scaleUpCpu);

  return (
    <section className={s.level}>
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: '1.375rem', margin: 0 }}>
        {c.configure.heading}
      </h1>
      <Timer seconds={CONFIGURE_SECONDS} onExpire={() => onDone(config)} />
      {/* Compact cost meter near the top: always in view without covering the settings. */}
      <div className={s.meter} data-over={over || undefined} data-testid="cost-meter">
        <span>
          <span aria-hidden="true">{over ? '⚠️ ' : '💰 '}</span>
          {costText} · {over ? c.configure.overBudget : c.configure.underBudget}
        </span>
        <span className={s.bar} aria-hidden="true">
          <span className={s.barFill} data-over={over || undefined} style={{ width: `${Math.min(100, (cost / traffic.budget) * 100)}%` }} />
        </span>
      </div>
      <HintBox level={hint} hint={c.hint} answer={answer} />
      <ul className={s.settings} role="list">
        <li className={s.setting}>
          <div className={s.settingHead}>
            <span id="cfg-lb">{c.configure.loadBalancer}</span>
            <Toggle labelledBy="cfg-lb" describedBy="cfg-lb-help" value={config.loadBalancer} onChange={(v) => setConfig({ loadBalancer: v }, c.configure.loadBalancer, onOff(v))} />
          </div>
          <p className={s.help} id="cfg-lb-help">
            {c.configure.loadBalancerHelp}
          </p>
        </li>
        <li className={s.setting}>
          <div className={s.settingHead}>
            <span id="cfg-min">{c.configure.minPods}</span>
            <Stepper
              label={c.configure.minPods}
              labelledBy="cfg-min"
              describedBy="cfg-pods-help"
              value={config.minPods}
              min={PODS_MIN}
              max={PODS_MAX}
              onChange={(v) => setConfig({ minPods: v, maxPods: Math.max(v, config.maxPods) }, c.configure.minPods, String(v))}
            />
          </div>
          <div className={s.settingHead}>
            <span id="cfg-max">{c.configure.maxPods}</span>
            <Stepper
              label={c.configure.maxPods}
              labelledBy="cfg-max"
              describedBy="cfg-pods-help"
              value={config.maxPods}
              min={PODS_MIN}
              max={PODS_MAX}
              onChange={(v) => setConfig({ maxPods: v, minPods: Math.min(v, config.minPods) }, c.configure.maxPods, String(v))}
            />
          </div>
          <p className={s.help} id="cfg-pods-help">
            {c.configure.podsHelp}
          </p>
        </li>
        <li className={s.setting}>
          <div className={s.settingHead}>
            <label id="cfg-th" htmlFor="threshold">
              {c.configure.thresholdLabel}
            </label>
            {/* Buttons as well as the slider: no dragging needed (§10). */}
            <Stepper
              label={c.configure.thresholdLabel}
              labelledBy="cfg-th"
              describedBy="cfg-th-help"
              value={thresholdPct}
              min={pct(CPU_MIN)}
              max={pct(CPU_MAX)}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => setConfig({ scaleUpCpu: v / 100 }, c.configure.thresholdLabel, `${v}%`)}
            />
          </div>
          <input
            id="threshold"
            className={s.range}
            type="range"
            min={pct(CPU_MIN)}
            max={pct(CPU_MAX)}
            step={5}
            value={thresholdPct}
            aria-valuetext={`${thresholdPct}%`}
            aria-describedby="cfg-th-help"
            onChange={(e) => setConfig({ scaleUpCpu: Number(e.target.value) / 100 }, c.configure.thresholdLabel, `${e.target.value}%`)}
          />
          <p className={s.help} id="cfg-th-help">
            {c.configure.thresholdHelp}
          </p>
        </li>
        <li className={s.setting}>
          <div className={s.settingHead}>
            <span id="cfg-heal">{c.configure.selfHealing}</span>
            <Toggle labelledBy="cfg-heal" describedBy="cfg-heal-help" value={config.selfHealing} onChange={(v) => setConfig({ selfHealing: v }, c.configure.selfHealing, onOff(v))} />
          </div>
          <p className={s.help} id="cfg-heal-help">
            {c.configure.selfHealingHelp}
          </p>
        </li>
        <li className={s.setting}>
          <div className={s.settingHead}>
            <span id="cfg-roll">{c.configure.rolling}</span>
            <Toggle labelledBy="cfg-roll" describedBy="cfg-roll-help" value={config.rollingUpdate} onChange={(v) => setConfig({ rollingUpdate: v }, c.configure.rolling, onOff(v))} />
          </div>
          <p className={s.help} id="cfg-roll-help">
            {c.configure.rollingHelp}
          </p>
        </li>
      </ul>
      <div className={s.go}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => onDone(config)}>
          {c.configure.go}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// Phase C: replay the storm
// ---------------------------------------------------------------------------------------

function PodsGraph({ history, max }: { history: readonly number[]; max: number }) {
  const w = 300;
  const h = 64;
  const n = Math.max(1, history.length - 1);
  const pts = history.map((v, i) => `${(i / Math.max(n, PHASE_TICKS / 10)) * w},${h - 4 - (v / max) * (h - 8)}`).join(' ');
  return (
    <svg className={s.graph} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--cloud-ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Replay({
  traffic,
  config,
  manualUptime,
  saved,
  onFinished,
  canTweak,
  debug,
  onTweak,
  onAccept,
}: {
  traffic: Traffic;
  config: ClusterConfig;
  manualUptime: number;
  /** A storm that already finished (reload): show its result instead of replaying 75 s. */
  saved: ReplayResult | null;
  onFinished: (r: ReplayResult) => void;
  canTweak: boolean;
  debug: boolean;
  onTweak: () => void;
  onAccept: (auto: { uptime: number; cost: number; budget: number }) => void;
}) {
  const [result, setResult] = useState<ReplayResult | null>(saved);
  if (result) return <ReplayResults r={result} canTweak={canTweak} onTweak={onTweak} onAccept={onAccept} />;
  return (
    <LiveReplay
      traffic={traffic}
      config={config}
      manualUptime={manualUptime}
      debug={debug}
      onFinished={(r) => {
        onFinished(r);
        setResult(r);
      }}
    />
  );
}

function LiveReplay({
  traffic,
  config,
  manualUptime,
  debug,
  onFinished,
}: {
  traffic: Traffic;
  config: ClusterConfig;
  manualUptime: number;
  debug: boolean;
  onFinished: (r: ReplayResult) => void;
}) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(levelName('cloud-replay'));
  const settingsOpen = useGame((g) => g.settingsOpen);
  const relaxed = useRelaxed();
  const { paused, toggle } = usePause();
  // Phase C is mostly watching (§7.4): fast-forward ×3 keeps the booth run moving.
  const [fast, setFast] = useState(false);
  useEffect(() => useToast.getState().clear(), []);
  const step = useMemo(() => (st: SimState, dt: number, a: Action | null) => stepCluster(st, dt, config, a), [config]);
  const { state, podHistory, act } = useSimLoop(() => initCluster(config, traffic), step, {
    running: !settingsOpen && !paused,
    speed: (relaxed ? 1 / RELAXED_FACTOR : 1) * (fast ? 3 : 1) * debugSpeed(debug),
  });
  useClusterEvents(state, true, config.selfHealing);
  const uptime = uptimeSoFar(state);
  const cost = costPerMin(state);
  useEffect(() => {
    if (!state.done) return;
    const sum = summarize(state);
    onFinished({
      uptime: sum.uptime,
      cost: sum.cost,
      budget: sum.budget,
      manualUptime,
      peakPods: sum.peakPods,
      startPods: podHistory[0] ?? config.minPods,
      diagnosis: diagnose(config, sum),
    });
  }, [state.done]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={s.level}>
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>
        {levelName('cloud-replay')}
      </h1>
      <div className={s.stats} data-testid="replay-stats" data-uptime={debug ? uptime.toFixed(3) : undefined}>
        <span>{fill(c.replay.uptime, { pct: pct(uptime) })}</span>
        <span>{fill(c.replay.pods, { n: state.pods.length })}</span>
        <span>{fill(c.replay.cost, { n: Math.round(cost) })}</span>
      </div>
      <Clock tick={state.tick} />
      <PodsGraph history={podHistory} max={PODS_MAX} />
      <ul className={s.pods} role="list" aria-label={fill(c.replay.pods, { n: state.pods.length })}>
        {state.pods.map((pod) => {
          const name = fill(c.replay.pod, { n: pod.id + 1 });
          return (
            <li key={pod.id} className={s.pod} data-status={pod.status}>
              <span>
                <span aria-hidden="true">{pod.status === 'crashed' ? '💥 ' : pod.status === 'starting' ? '⏳ ' : '✅ '}</span>
                {name}:{' '}
                {pod.status === 'crashed'
                  ? c.manual.crashed
                  : pod.status === 'starting'
                    ? c.manual.rebooting
                    : fill(c.manual.busy, { pct: pct(pod.cpu) })}
              </span>
              {pod.status === 'ready' && <PodBar pod={pod} />}
              {pod.status === 'crashed' && (
                <button
                  type="button"
                  className={s.act}
                  data-kind="restart"
                  aria-label={`${c.manual.restart}: ${name}`}
                  onClick={() => act({ type: 'restart', pod: pod.id })}
                >
                  {c.manual.restart}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <StormBar
        paused={paused}
        onPause={toggle}
        canRollback={state.deploy === 'bad' && !state.done}
        onRollback={() => act({ type: 'rollback' })}
        fast={fast}
        onFast={() => setFast((f) => !f)}
      />
    </section>
  );
}

function ReplayResults({
  r,
  canTweak,
  onTweak,
  onAccept,
}: {
  r: ReplayResult;
  canTweak: boolean;
  onTweak: () => void;
  onAccept: (auto: { uptime: number; cost: number; budget: number }) => void;
}) {
  const announce = useAnnouncer((a) => a.announce);
  const compareRef = useRef<HTMLHeadingElement>(null);
  const diagnosis = r.diagnosis as keyof typeof c.diagnosis;
  useEffect(() => {
    useToast.getState().clear();
    announce(`${fill(c.replay.stormOver, { manual: pct(r.manualUptime), auto: pct(r.uptime) })} ${c.diagnosis[diagnosis] ?? ''}`);
    compareRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className={s.level}>
      <h1 ref={compareRef} tabIndex={-1} style={{ margin: 0, fontSize: '1.25rem' }}>
        {c.replay.compareHeading}
      </h1>
      <div className={s.compare} data-testid="compare">
        <div className={s.compareItem} data-kind="manual">
          {c.replay.manual}
          <strong>{pct(r.manualUptime)}%</strong>
        </div>
        <div className={s.compareItem} data-kind="auto">
          {c.replay.auto}
          <strong>{pct(r.uptime)}%</strong>
        </div>
      </div>
      <p className={ui.muted} style={{ margin: 0 }}>
        {fill(c.result.cost, { n: Math.round(r.cost), budget: r.budget })} ·{' '}
        {fill(c.replay.podsSummary, { start: r.startPods, peak: r.peakPods })}
      </p>
      <p className={ui.body} data-testid="diagnosis" data-diagnosis={r.diagnosis}>
        {c.diagnosis[diagnosis]}
      </p>
      <div className={s.go}>
        {canTweak && r.diagnosis !== 'perfect' && (
          <button type="button" className={ui.btn} onClick={onTweak}>
            {c.replay.tweak}
          </button>
        )}
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => onAccept({ uptime: r.uptime, cost: r.cost, budget: r.budget })}>
          {c.replay.accept}
        </button>
      </div>
    </section>
  );
}
