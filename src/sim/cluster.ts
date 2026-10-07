// Stage 4 "Keep It Alive" cluster simulation (spec §7, rules in §7.5). Pure: no DOM, no timers,
// no Math.random. All randomness is the seeded traffic noise, drawn once in createTraffic(seed).
//
// ONE ENGINE, TWO RULE SETS
//   Phase A (manual, §7.1): 3 fixed servers, uneven routing, no autoscaler, no self-healing. The
//     player can Boost a server, Restart a crashed one and Roll back the bad deploy.
//   Phase C (auto, §7.3/7.4): the player's ClusterConfig drives routing, the HPA, self-healing and
//     rolling updates. Restart and Roll back stay available (Boost does not: pods are not servers).
//   Both replay the SAME Traffic object (same seed → identical demand, hot server, deploy time).
//
// TICK (TICK_MS = 100 ms, fixed). step*(state, dtMs, …) accumulates dtMs and runs whole ticks, so
//   it can be driven straight from requestAnimationFrame. Per tick, in order:
//   1. the player's action (only on the first tick of a step call);
//   2. the bad deploy lands at traffic.badDeployTick;
//   3. HPA (auto only) evaluates every HPA_EVERY_S = 2 s (see "HPA" below);
//   4. timers: starting pods become ready after their boot, crashed pods recover, boosts expire;
//   5. demand for this tick is routed to pods (see "ROUTING");
//   6. each ready pod serves min(load, capacity); CPU = load / capacity (may exceed 1). A pod whose
//      CPU > 100% on more than CRASH_TICKS = 15 consecutive ticks (> 1.5 s) crashes at the end of
//      the tick. A crashed pod serves nothing;
//   7. errors from the bad deploy are taken out of the served requests; cost accrues.
//
// ROUTING
//   Load balancer ON: demand is split evenly over READY pods (health-checked). No ready pod → all dropped.
//   Load balancer OFF (and Phase A): "sticky" uneven routing. Every pod that has ever been ready
//     is registered; registered pod k (creation order) gets weight 1/(k+1) (Zipf), so pod 0 is
//     hammered (3 pods → 54.5% / 27.3% / 18.2%). The share of a crashed/rebooting pod is DROPPED:
//     nothing routes around it. In Phase A the hammered server is traffic.hot (seeded).
//
// CRASH RECOVERY (spec "Self-healing restarts it after 3s (15s manual)"; our reading)
//   Self-healing ON: back to ready SELF_HEAL_S = 3 s after the crash.
//   Self-healing OFF (Phase C): stays down MANUAL_RECOVER_S = 15 s (the on-call human), unless the
//     player taps Restart first.
//   Phase A: stays down until the player taps Restart (§7.1 "Crashed servers need a tap").
//   Restart tap: the pod reboots for RESTART_BOOT_S = 1 s, then is ready (overload count reset).
//
// HPA (auto only). Every 2 s: L = load on ready pods (or the whole demand when none is ready);
//   desired = clamp(ceil(L / (scaleUpCpu × POD_CAPACITY)), minPods, maxPods) — the Kubernetes
//   formula, so it scales up exactly when average CPU > scaleUpCpu. Current = all provisioned pods
//   (ready + starting + crashed). desired > current → add the difference as cold-starting pods,
//   ready after COLD_START_S = 4 s. desired < current on SCALE_DOWN_EVALS = 3 evaluations in a row
//   (6 s of quiet) → remove one pod (a starting one first, then a crashed one, then the newest).
//
// BAD DEPLOY at BAD_DEPLOY_S.
//   Rolling update OFF (and Phase A): every pod runs it, 50% of served requests error until the
//     player taps Roll back (takes effect immediately).
//   Rolling update ON: it goes to one pod first (a canary). That pod errors 50% of its requests
//     for AUTO_ROLLBACK_S = 2 s, the health check fails and it is rolled back automatically.
//
// UPTIME = requests served successfully / requests demanded, over the whole phase (request
//   weighted). Lost: dropped by overloaded pods (excess over capacity), by crashed/booting pods,
//   by having no ready pod, and errored by the bad deploy.
//
// COST = CREDITS_PER_POD_MIN (10) credits per minute per provisioned pod (ready, starting or
//   crashed: you pay for what you asked for). The phase cost is the time-average in credits/min,
//   compared with traffic.budget (credits/min): round(BUDGET_PER_MIN × traffic.scale).
//
// INTENSITY (§3.2 "a better app means more users"): appQuality 0–1 → traffic.scale =
//   0.85 + 0.30 × quality, multiplying every demand value (peak ≈ 425–575 req/s; 500 at 0.5).
//   The budget scales with it so 3★ stays reachable for any app quality.
//
// API NOTE: spec §7.5 names `step(state, dt, config, rng)`. The rng is consumed by
//   createTraffic(seed) instead (precomputed so Phase A and C see identical traffic), so the 4th
//   argument of stepCluster is the player's action. step* never mutates its input state.
import { mulberry32 } from '../stages/data/logic';
import { clamp } from '../state/scoring';
import type { Scores, StarCount } from '../state/types';

export type Rng = () => number;

// ---- Constants (spec §7.5 unless noted) ----
export const TICK_MS = 100;
export const TICK_S = TICK_MS / 1000;
/** Phase A and Phase C length (§7.1/§7.4 "~60–90s"). */
export const PHASE_SECONDS = 75;
export const PHASE_TICKS = PHASE_SECONDS * 10;
export const POD_CAPACITY = 100; // req/s
export const CRASH_TICKS = 15; // crash when overloaded on MORE than this many consecutive ticks (> 1.5 s)
export const SELF_HEAL_S = 3;
export const MANUAL_RECOVER_S = 15;
export const RESTART_BOOT_S = 1;
export const HPA_EVERY_S = 2;
export const COLD_START_S = 4;
export const SCALE_DOWN_EVALS = 3;
export const BAD_DEPLOY_S = 32;
export const BAD_DEPLOY_ERROR = 0.5;
export const AUTO_ROLLBACK_S = 2;
/** Phase A Boost: +BOOST_CAPACITY req/s on one server for BOOST_S, then BOOST_COOLDOWN_S before it can boost again. */
export const BOOST_CAPACITY = 100;
export const BOOST_S = 5;
export const BOOST_COOLDOWN_S = 4;
export const MANUAL_SERVERS = 3;
export const CREDITS_PER_POD_MIN = 10;
export const BUDGET_PER_MIN = 60;
/** Demand at ×1 (start of the storm) for traffic.scale = 1; the storm ramps to ×10. */
export const BASE_RPS = 50;
/** Scripted traffic keyframes: [seconds, multiplier of BASE_RPS]. A viral surge 36–42 s takes it to the ×10 peak (42–58 s). */
export const TRAFFIC_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 1],
  [8, 1.5],
  [18, 3],
  [28, 5],
  [36, 6.5],
  [42, 10],
  [58, 9.5],
  [66, 8],
  [75, 7],
];
/** Seeded noise: a value knot every second (±NOISE_KNOT), linearly interpolated, plus ±NOISE_TICK per tick. */
export const NOISE_KNOT = 0.08;
export const NOISE_TICK = 0.03;
export const PODS_MIN = 1;
export const PODS_MAX = 12;
export const CPU_MIN = 0.4;
export const CPU_MAX = 0.9;

const t = (s: number) => Math.round(s / TICK_S);
const SELF_HEAL_TICKS = t(SELF_HEAL_S);
const MANUAL_RECOVER_TICKS = t(MANUAL_RECOVER_S);
const RESTART_TICKS = t(RESTART_BOOT_S);
const HPA_TICKS = t(HPA_EVERY_S);
const COLD_TICKS = t(COLD_START_S);
const AUTO_ROLLBACK_TICKS = t(AUTO_ROLLBACK_S);
const BOOST_TICKS = t(BOOST_S);
const BOOST_COOLDOWN_TICKS = t(BOOST_COOLDOWN_S);

// ---- Types ----
export interface Traffic {
  seed: number;
  /** App quality 0–1 that produced `scale`. */
  intensity: number;
  scale: number;
  ticks: number;
  /** Demand in req/s for each tick. */
  demand: Float64Array;
  /** Phase A server that gets hammered (0–2). */
  hot: number;
  badDeployTick: number;
  /** Budget in credits per minute. */
  budget: number;
  peak: number;
}

export interface ClusterConfig {
  loadBalancer: boolean;
  minPods: number; // 1–12
  maxPods: number; // 1–12
  /** Scale up when average CPU is above this (0.4–0.9). */
  scaleUpCpu: number;
  selfHealing: boolean;
  rollingUpdate: boolean;
}

export type PodStatus = 'ready' | 'starting' | 'crashed';

export interface Pod {
  id: number;
  status: PodStatus;
  /** Ticks in the current status. */
  since: number;
  /** Ticks left before starting → ready or crashed → ready (Infinity = needs a Restart tap). */
  timer: number;
  /** Has been ready at least once (joins uneven routing). */
  registered: boolean;
  /** Consecutive overloaded ticks. */
  overTicks: number;
  /** Assigned load last tick (req/s) and CPU = load / capacity (0 when not ready). */
  load: number;
  cpu: number;
  boostTicks: number;
  boostCooldown: number;
}

export type DeployState = 'pending' | 'bad' | 'canary' | 'rolledBack';

export type Action = { type: 'boost'; pod: number } | { type: 'restart'; pod: number } | { type: 'rollback' };

export interface Totals {
  /** Requests (req/s × s). */
  demand: number;
  ok: number;
  dropped: number;
  errored: number;
  podSeconds: number;
  crashes: number;
  restarts: number;
  boosts: number;
  rollbacks: number;
  peakPods: number;
}

export interface TickRates {
  demand: number;
  ok: number;
  dropped: number;
  errored: number;
}

export interface SimState {
  mode: 'manual' | 'auto';
  traffic: Traffic;
  tick: number;
  accMs: number;
  pods: Pod[];
  nextId: number;
  deploy: DeployState;
  /** Ticks since the deploy state last changed. */
  deploySince: number;
  /** Pod id running the canary (rolling update), else -1. */
  canary: number;
  scaleDownVotes: number;
  totals: Totals;
  /** Rates (req/s) of the last tick, for the live meters. */
  last: TickRates;
  done: boolean;
}

export interface PhaseSummary {
  uptime: number;
  /** Average credits per minute over the phase. */
  cost: number;
  budget: number;
  underBudget: boolean;
  crashes: number;
  restarts: number;
  boosts: number;
  rollbacks: number;
  peakPods: number;
  avgPods: number;
  dropped: number;
  errored: number;
  demand: number;
}

// ---- Traffic ----

/** traffic.scale from app quality 0–1 (§3.2): 0.85 + 0.30 × quality. */
export function intensityScale(quality: number): number {
  return 0.85 + 0.3 * clamp(quality, 0, 1);
}

function keyframe(sec: number): number {
  const k = TRAFFIC_KEYFRAMES;
  for (let i = 1; i < k.length; i++) {
    const [t1, v1] = k[i] as readonly [number, number];
    if (sec <= t1) {
      const [t0, v0] = k[i - 1] as readonly [number, number];
      return v0 + ((v1 - v0) * (sec - t0)) / (t1 - t0);
    }
  }
  return (k[k.length - 1] as readonly [number, number])[1];
}

/**
 * The storm for one run: per-tick demand (keyframes × seeded noise × scale), the Phase A hot
 * server and the budget. Build it once per run and pass the same object to Phase A and Phase C.
 * rng order: hot server, then one knot per second, then one jitter per tick.
 */
export function createTraffic(seed: number, opts: { intensity?: number; rng?: Rng } = {}): Traffic {
  const rng = opts.rng ?? mulberry32(seed);
  const intensity = clamp(opts.intensity ?? 0.5, 0, 1);
  const scale = intensityScale(intensity);
  const hot = Math.min(MANUAL_SERVERS - 1, Math.floor(rng() * MANUAL_SERVERS));
  const knots = new Float64Array(PHASE_SECONDS + 2);
  for (let i = 0; i < knots.length; i++) knots[i] = 1 + NOISE_KNOT * (2 * rng() - 1);
  const demand = new Float64Array(PHASE_TICKS);
  let peak = 0;
  for (let i = 0; i < PHASE_TICKS; i++) {
    const sec = i * TICK_S;
    const k = Math.floor(sec);
    const f = sec - k;
    const knot = (knots[k] as number) * (1 - f) + (knots[k + 1] as number) * f;
    const d = BASE_RPS * scale * keyframe(sec) * knot * (1 + NOISE_TICK * (2 * rng() - 1));
    demand[i] = d;
    if (d > peak) peak = d;
  }
  return {
    seed,
    intensity,
    scale,
    ticks: PHASE_TICKS,
    demand,
    hot,
    badDeployTick: t(BAD_DEPLOY_S),
    budget: Math.round(BUDGET_PER_MIN * scale),
    peak,
  };
}

// ---- Config ----

export const DEFAULT_CONFIG: ClusterConfig = {
  loadBalancer: false,
  minPods: 1,
  maxPods: 3,
  scaleUpCpu: 0.8,
  selfHealing: false,
  rollingUpdate: false,
};

/** Clamp a config into the §7.3 ranges; maxPods is raised to minPods if below it. */
export function normalizeConfig(c: ClusterConfig): ClusterConfig {
  const minPods = Math.round(clamp(c.minPods, PODS_MIN, PODS_MAX));
  const maxPods = Math.max(minPods, Math.round(clamp(c.maxPods, PODS_MIN, PODS_MAX)));
  return { ...c, minPods, maxPods, scaleUpCpu: clamp(c.scaleUpCpu, CPU_MIN, CPU_MAX) };
}

/** Phase B cost meter: credits/min at min pods and at max pods. */
export function costRange(c: ClusterConfig): { min: number; max: number } {
  const n = normalizeConfig(c);
  return { min: n.minPods * CREDITS_PER_POD_MIN, max: n.maxPods * CREDITS_PER_POD_MIN };
}

// ---- State ----

function newPod(id: number, status: PodStatus, timer: number): Pod {
  return {
    id,
    status,
    since: 0,
    timer,
    registered: status === 'ready',
    overTicks: 0,
    load: 0,
    cpu: 0,
    boostTicks: 0,
    boostCooldown: 0,
  };
}

function baseState(mode: SimState['mode'], traffic: Traffic, pods: Pod[], nextId: number): SimState {
  return {
    mode,
    traffic,
    tick: 0,
    accMs: 0,
    pods,
    nextId,
    deploy: 'pending',
    deploySince: 0,
    canary: -1,
    scaleDownVotes: 0,
    totals: {
      demand: 0,
      ok: 0,
      dropped: 0,
      errored: 0,
      podSeconds: 0,
      crashes: 0,
      restarts: 0,
      boosts: 0,
      rollbacks: 0,
      peakPods: pods.length,
    },
    last: { demand: 0, ok: 0, dropped: 0, errored: 0 },
    done: false,
  };
}

/** Phase A: 3 ready servers. pods[] is in routing-rank order (pods[0] = the hot server, id traffic.hot); ids are 0–2. */
export function initManual(traffic: Traffic): SimState {
  const pods: Pod[] = [];
  for (let k = 0; k < MANUAL_SERVERS; k++) pods.push(newPod((traffic.hot + k) % MANUAL_SERVERS, 'ready', 0));
  return baseState('manual', traffic, pods, MANUAL_SERVERS);
}

/** Phase C: minPods ready pods (warm before the storm). */
export function initCluster(config: ClusterConfig, traffic: Traffic): SimState {
  const c = normalizeConfig(config);
  const pods: Pod[] = [];
  for (let i = 0; i < c.minPods; i++) pods.push(newPod(i, 'ready', 0));
  return baseState('auto', traffic, pods, c.minPods);
}

// ---- Engine ----

interface Rules {
  lb: boolean;
  hpa: boolean;
  minPods: number;
  maxPods: number;
  thr: number;
  /** Ticks a crashed pod stays down on its own (Infinity = until Restart). */
  recoverTicks: number;
  rolling: boolean;
  boost: boolean;
}

const MANUAL_RULES: Rules = {
  lb: false,
  hpa: false,
  minPods: MANUAL_SERVERS,
  maxPods: MANUAL_SERVERS,
  thr: 1,
  recoverTicks: Number.POSITIVE_INFINITY,
  rolling: false,
  boost: true,
};

function rulesFor(config: ClusterConfig): Rules {
  const c = normalizeConfig(config);
  return {
    lb: c.loadBalancer,
    hpa: true,
    minPods: c.minPods,
    maxPods: c.maxPods,
    thr: c.scaleUpCpu,
    recoverTicks: c.selfHealing ? SELF_HEAL_TICKS : MANUAL_RECOVER_TICKS,
    rolling: c.rollingUpdate,
    boost: false,
  };
}

function cloneState(s: SimState): SimState {
  const pods = new Array<Pod>(s.pods.length);
  for (let i = 0; i < s.pods.length; i++) pods[i] = { ...(s.pods[i] as Pod) };
  return { ...s, pods, totals: { ...s.totals }, last: { ...s.last } };
}

function setStatus(p: Pod, status: PodStatus, timer: number): void {
  p.status = status;
  p.since = 0;
  p.timer = timer;
  p.overTicks = 0;
  p.load = 0;
  p.cpu = 0;
}

function applyAction(s: SimState, a: Action, r: Rules): void {
  if (a.type === 'rollback') {
    if (s.deploy === 'bad' || s.deploy === 'canary') {
      s.deploy = 'rolledBack';
      s.deploySince = 0;
      s.canary = -1;
      s.totals.rollbacks++;
    }
    return;
  }
  const p = s.pods.find((x) => x.id === a.pod);
  if (!p) return;
  if (a.type === 'restart') {
    if (p.status !== 'crashed') return;
    setStatus(p, 'starting', RESTART_TICKS);
    s.totals.restarts++;
    return;
  }
  if (!r.boost || p.status !== 'ready' || p.boostTicks > 0 || p.boostCooldown > 0) return;
  p.boostTicks = BOOST_TICKS;
  s.totals.boosts++;
}

function hpa(s: SimState, r: Rules, demand: number): void {
  let ready = 0;
  let load = 0;
  for (const p of s.pods) {
    if (p.status === 'ready') {
      ready++;
      load += p.load;
    }
  }
  if (ready === 0) load = demand;
  const want = Math.ceil(load / (r.thr * POD_CAPACITY) - 1e-9);
  const desired = want < r.minPods ? r.minPods : want > r.maxPods ? r.maxPods : want;
  const current = s.pods.length;
  if (desired > current) {
    s.scaleDownVotes = 0;
    for (let i = current; i < desired; i++) s.pods.push(newPod(s.nextId++, 'starting', COLD_TICKS));
    return;
  }
  if (desired === current) {
    s.scaleDownVotes = 0;
    return;
  }
  if (++s.scaleDownVotes < SCALE_DOWN_EVALS) return;
  let victim = -1;
  for (let i = s.pods.length - 1; i >= 0 && victim < 0; i--) if (s.pods[i]?.status === 'starting') victim = i;
  for (let i = s.pods.length - 1; i >= 0 && victim < 0; i--) if (s.pods[i]?.status === 'crashed') victim = i;
  if (victim < 0) victim = s.pods.length - 1;
  if (s.pods[victim]?.id === s.canary) s.canary = -1;
  s.pods.splice(victim, 1);
}

/** One 100 ms tick, mutating `s` (a private clone). */
function tickOnce(s: SimState, r: Rules, action: Action | null): void {
  const tr = s.traffic;
  const demand = tr.demand[s.tick] ?? 0;
  if (action) applyAction(s, action, r);

  // Bad deploy.
  if (s.deploy === 'pending' && s.tick >= tr.badDeployTick) {
    s.deploySince = 0;
    if (r.rolling) {
      s.deploy = 'canary';
      s.canary = -1;
      for (const p of s.pods) if (p.status === 'ready') { s.canary = p.id; break; }
      if (s.canary < 0) s.canary = s.pods[0]?.id ?? -1;
    } else s.deploy = 'bad';
  } else if (s.deploy === 'canary' && s.deploySince >= AUTO_ROLLBACK_TICKS) {
    s.deploy = 'rolledBack';
    s.deploySince = 0;
    s.canary = -1;
  }

  if (r.hpa && s.tick > 0 && s.tick % HPA_TICKS === 0) hpa(s, r, demand);

  // Timers.
  for (const p of s.pods) {
    if (p.boostTicks > 0) {
      if (--p.boostTicks === 0) p.boostCooldown = BOOST_COOLDOWN_TICKS;
    } else if (p.boostCooldown > 0) p.boostCooldown--;
    if (p.status !== 'ready' && p.timer !== Number.POSITIVE_INFINITY && --p.timer <= 0) {
      setStatus(p, 'ready', 0);
      p.registered = true;
    }
  }

  // Routing.
  let ready = 0;
  let wsum = 0;
  let rank = 0;
  for (const p of s.pods) {
    if (p.status === 'ready') ready++;
    if (p.registered) wsum += 1 / ++rank;
  }
  let served = 0;
  let errored = 0;
  rank = 0;
  for (const p of s.pods) {
    if (p.registered) rank++;
    if (p.status !== 'ready') {
      p.load = 0;
      p.cpu = 0;
      continue;
    }
    // Ready pods are always registered, so rank ≥ 1 here.
    const load = r.lb ? demand / ready : demand / (rank * wsum);
    const cap = POD_CAPACITY + (p.boostTicks > 0 ? BOOST_CAPACITY : 0);
    p.load = load;
    p.cpu = load / cap;
    const ok = load < cap ? load : cap;
    served += ok;
    if (s.deploy === 'bad' || (s.deploy === 'canary' && p.id === s.canary)) errored += ok * BAD_DEPLOY_ERROR;
    if (load > cap) {
      if (++p.overTicks > CRASH_TICKS) {
        setStatus(p, 'crashed', r.recoverTicks);
        s.totals.crashes++;
      }
    } else p.overTicks = 0;
  }

  // Bookkeeping.
  for (const p of s.pods) p.since++;
  s.deploySince++;
  const n = s.pods.length;
  const tot = s.totals;
  tot.demand += demand * TICK_S;
  tot.ok += (served - errored) * TICK_S;
  tot.errored += errored * TICK_S;
  tot.dropped += (demand - served) * TICK_S;
  tot.podSeconds += n * TICK_S;
  if (n > tot.peakPods) tot.peakPods = n;
  s.last.demand = demand;
  s.last.ok = served - errored;
  s.last.errored = errored;
  s.last.dropped = demand - served;
  s.tick++;
  if (s.tick >= tr.ticks) s.done = true;
}

function stepWith(state: SimState, dtMs: number, r: Rules, action: Action | null): SimState {
  if (state.done) return state;
  const s = cloneState(state);
  s.accMs += dtMs > 0 ? dtMs : 0;
  let pending = action;
  if (pending && s.accMs < TICK_MS) {
    // Apply a tap immediately even inside a short frame, so the UI feels instant.
    applyAction(s, pending, r);
    pending = null;
  }
  while (s.accMs >= TICK_MS && !s.done) {
    s.accMs -= TICK_MS;
    tickOnce(s, r, pending);
    pending = null;
  }
  return s;
}

/** Phase A step: advances dtMs of sim time (whole 100 ms ticks) and applies an optional tap. */
export function stepManual(state: SimState, dtMs: number, action: Action | null = null): SimState {
  return stepWith(state, dtMs, MANUAL_RULES, action);
}

/** Phase C step (spec's `step(state, dt, config, …)`). Boost taps are ignored in auto mode. */
export function stepCluster(state: SimState, dtMs: number, config: ClusterConfig, action: Action | null = null): SimState {
  return stepWith(state, dtMs, rulesFor(config), action);
}

// ---- Readouts ----

/** Live cost meter: credits per minute for the pods provisioned right now. */
export function costPerMin(s: SimState): number {
  return s.pods.length * CREDITS_PER_POD_MIN;
}

/** Uptime so far (1 before any demand). */
export function uptimeSoFar(s: SimState): number {
  return s.totals.demand > 0 ? s.totals.ok / s.totals.demand : 1;
}

export function summarize(s: SimState): PhaseSummary {
  const tot = s.totals;
  const secs = s.tick * TICK_S;
  const avgPods = secs > 0 ? tot.podSeconds / secs : s.pods.length;
  const cost = avgPods * CREDITS_PER_POD_MIN;
  return {
    uptime: uptimeSoFar(s),
    cost,
    budget: s.traffic.budget,
    underBudget: cost <= s.traffic.budget,
    crashes: tot.crashes,
    restarts: tot.restarts,
    boosts: tot.boosts,
    rollbacks: tot.rollbacks,
    peakPods: tot.peakPods,
    avgPods,
    dropped: tot.demand > 0 ? tot.dropped / tot.demand : 0,
    errored: tot.demand > 0 ? tot.errored / tot.demand : 0,
    demand: tot.demand,
  };
}

// ---- Whole-phase helpers (tests, tuning, Phase B preview) ----

/** A player model: looks at the state after each tick and returns at most one tap. */
export type Policy = (s: SimState) => Action | null;

export const idlePolicy: Policy = () => null;

/** Run a phase to the end, tick by tick. config null = Phase A (manual). */
export function simulatePhase(traffic: Traffic, config: ClusterConfig | null, policy: Policy = idlePolicy): SimState {
  const r = config ? rulesFor(config) : MANUAL_RULES;
  const s = config ? initCluster(config, traffic) : initManual(traffic);
  let action: Action | null = null;
  while (!s.done) {
    tickOnce(s, r, action);
    action = policy(s);
  }
  return s;
}

/** Phase B "what would this cost / survive" preview: Phase C with nobody intervening. */
export function previewCluster(config: ClusterConfig, traffic: Traffic): PhaseSummary {
  return summarize(simulatePhase(traffic, config));
}

export interface HumanOptions {
  /** Seconds before a crash is noticed and Restart tapped. */
  reactS: number;
  /** Seconds before the error spike is understood and Roll back tapped. */
  rollbackReactS: number;
  /** Minimum seconds between taps (attention is split over three bars). */
  tapGapS: number;
  /** Boost a server once its bar is at least this full. */
  boostAtCpu: number;
}

export const HUMAN_DEFAULTS: HumanOptions = { reactS: 1, rollbackReactS: 2.5, tapGapS: 0.6, boostAtCpu: 0.9 };

/**
 * Scripted "reasonable mobile player" for tuning Phase A: one tap per tapGapS at most;
 * priority Roll back (after rollbackReactS) > Restart the longest-crashed server (after reactS) >
 * Boost the hottest server at ≥ boostAtCpu. Stateful closure: make a fresh one per run.
 */
export function humanPolicy(opts: Partial<HumanOptions> = {}): Policy {
  const o = { ...HUMAN_DEFAULTS, ...opts };
  const gap = t(o.tapGapS);
  const react = t(o.reactS);
  const rbReact = t(o.rollbackReactS);
  let lastTap = Number.NEGATIVE_INFINITY;
  return (s) => {
    if (s.tick - lastTap < gap) return null;
    let a: Action | null = null;
    if ((s.deploy === 'bad' || s.deploy === 'canary') && s.deploySince >= rbReact) a = { type: 'rollback' };
    if (!a) {
      let best: Pod | null = null;
      for (const p of s.pods) if (p.status === 'crashed' && p.since >= react && (!best || p.since > best.since)) best = p;
      if (best) a = { type: 'restart', pod: best.id };
    }
    if (!a && s.mode === 'manual') {
      let best: Pod | null = null;
      for (const p of s.pods) {
        if (p.status === 'ready' && p.boostTicks === 0 && p.boostCooldown === 0 && p.cpu >= o.boostAtCpu && (!best || p.cpu > best.cpu)) best = p;
      }
      if (best) a = { type: 'boost', pod: best.id };
    }
    if (a) lastTap = s.tick;
    return a;
  };
}

// ---- Scoring (§7.4) ----

/** Auto uptime at or above this AND under budget = 3★ (§7.4). */
export const THREE_STAR_UPTIME = 0.99;
/** Auto uptime at or below this scores 0. */
export const ZERO_SCORE_UPTIME = 0.8;
/** Suggested star thresholds on cloudStageScore. three = 1 ⇔ uptime ≥ 99% and under budget. */
export const CLOUD_STARS = { one: 0.3, two: 0.65, three: 1 } as const;

/** costEfficiency: 1 at or under budget, else budget / cost. */
export function costEfficiency(cost: number, budget: number): number {
  if (!(cost > budget)) return 1;
  return clamp(budget / cost, 0, 1);
}

/** GameState['scores']['cloud']. */
export function cloudScores(r: { manualUptime: number; autoUptime: number; cost: number; budget: number }): Scores['cloud'] {
  return {
    manualUptime: clamp(r.manualUptime, 0, 1),
    autoUptime: clamp(r.autoUptime, 0, 1),
    costEfficiency: costEfficiency(r.cost, r.budget),
  };
}

/**
 * Stage score 0–1: u = clamp((autoUptime − 0.80) / (0.99 − 0.80), 0, 1); under budget → u,
 * over budget → u × 0.8 × costEfficiency (so over budget can never reach 3★). Manual uptime
 * is not scored: Phase A is meant to hurt.
 */
export function cloudStageScore(c: Scores['cloud']): number {
  const u = clamp((c.autoUptime - ZERO_SCORE_UPTIME) / (THREE_STAR_UPTIME - ZERO_SCORE_UPTIME), 0, 1);
  return c.costEfficiency >= 1 ? u : u * 0.8 * clamp(c.costEfficiency, 0, 1);
}

export function cloudStars(score: number, th: { one: number; two: number; three: number } = CLOUD_STARS): StarCount {
  if (score >= th.three - 1e-9) return 3;
  if (score >= th.two) return 2;
  if (score >= th.one) return 1;
  return 0;
}
