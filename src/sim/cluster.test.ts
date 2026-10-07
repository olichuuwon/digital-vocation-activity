import { describe, expect, it } from 'vitest';
import {
  BAD_DEPLOY_S,
  CLOUD_STARS,
  COLD_START_S,
  CRASH_TICKS,
  CREDITS_PER_POD_MIN,
  FAULT_S,
  MANUAL_RECOVER_S,
  PHASE_TICKS,
  POD_CAPACITY,
  SELF_HEAL_S,
  TICK_MS,
  WARMUP_S,
  cloudScores,
  cloudStageScore,
  cloudStars,
  costRange,
  createTraffic,
  humanPolicy,
  initCluster,
  initManual,
  intensityScale,
  normalizeConfig,
  previewCluster,
  simulatePhase,
  stepCluster,
  stepManual,
  summarize,
  type ClusterConfig,
  type SimState,
  type Traffic,
} from './cluster';

const SEEDS = [1, 2, 3, 7, 42, 99, 123, 2024];
const QUALITIES = [0, 0.25, 0.5, 0.75, 1];

const SENSIBLE: ClusterConfig = {
  loadBalancer: true,
  minPods: 2,
  maxPods: 10,
  scaleUpCpu: 0.65,
  selfHealing: true,
  rollingUpdate: true,
};
const SENSIBLE_ALT: ClusterConfig = { ...SENSIBLE, minPods: 3, maxPods: 8, scaleUpCpu: 0.7 };
const MAXED: ClusterConfig = { ...SENSIBLE, minPods: 12, maxPods: 12, scaleUpCpu: 0.4 };

const run = (tr: Traffic, c: ClusterConfig | null, p?: Parameters<typeof simulatePhase>[2]) => summarize(simulatePhase(tr, c, p));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('traffic', () => {
  it('same seed → identical traffic (Phase A and C share it); different seed → different', () => {
    const a = createTraffic(42, { intensity: 0.5 });
    const b = createTraffic(42, { intensity: 0.5 });
    expect(Array.from(a.demand)).toEqual(Array.from(b.demand));
    expect(a.hot).toBe(b.hot);
    expect(a.demand.length).toBe(PHASE_TICKS);
    expect(Array.from(createTraffic(43).demand)).not.toEqual(Array.from(a.demand));
  });

  it('Phase A and Phase C see the same demand tick by tick', () => {
    const tr = createTraffic(5);
    const a = simulatePhase(tr, null);
    const c = simulatePhase(tr, SENSIBLE);
    expect(a.totals.demand).toBeCloseTo(c.totals.demand, 9);
  });

  it('ramps to ×10, uneven, and scales with app quality (§3.2)', () => {
    const tr = createTraffic(1, { intensity: 0.5 });
    const first = mean(Array.from(tr.demand.slice(0, 20)));
    const peak = mean(Array.from(tr.demand.slice(450, 560)));
    expect(peak / first).toBeGreaterThan(8.5);
    expect(peak / first).toBeLessThan(11.5);
    expect(intensityScale(0)).toBeCloseTo(0.85);
    expect(intensityScale(1)).toBeCloseTo(1.15);
    const lo = createTraffic(1, { intensity: 0 });
    const hi = createTraffic(1, { intensity: 1 });
    expect(hi.peak / lo.peak).toBeCloseTo(1.15 / 0.85, 6);
    expect(hi.budget).toBeGreaterThan(lo.budget);
  });
});

describe('Phase A (manual)', () => {
  it('doing nothing degrades uptime badly', () => {
    for (const seed of SEEDS) {
      const s = run(createTraffic(seed), null);
      expect(s.uptime).toBeLessThan(0.35);
      expect(s.crashes).toBeGreaterThan(0);
    }
  });

  it('a reasonable human (1 s reactions, 0.6 s between taps) lands at ~62–78% across app quality', () => {
    const results: number[] = [];
    for (const q of QUALITIES) {
      for (const seed of SEEDS) {
        const tr = createTraffic(seed, { intensity: q });
        const human = run(tr, null, humanPolicy());
        const idle = run(tr, null);
        expect(human.uptime).toBeGreaterThanOrEqual(0.62);
        expect(human.uptime).toBeLessThanOrEqual(0.78);
        expect(human.uptime - idle.uptime).toBeGreaterThan(0.3);
        results.push(human.uptime);
      }
    }
    expect(mean(results)).toBeGreaterThan(0.65);
    expect(mean(results)).toBeLessThan(0.75);
  });

  it('one server is hammered (uneven routing)', () => {
    const tr = createTraffic(9);
    const s = stepManual(initManual(tr), 2000);
    const hot = s.pods.find((p) => p.id === tr.hot);
    for (const p of s.pods) if (p !== hot) expect(hot?.load).toBeGreaterThan(p.load * 1.9);
  });

  it('hardware fault: at FAULT_S the middle server dies whatever its load and stays down until Restart', () => {
    const tr = createTraffic(6);
    let s: SimState = initManual(tr);
    while (s.tick < tr.faultTick) s = stepManual(s, TICK_MS);
    expect(s.faultPod).toBe(-1);
    // pods[] is in routing-rank order: the 2nd ready one (the middle-traffic server), else the last ready one.
    const ready = s.pods.filter((p) => p.status === 'ready').map((p) => p.id);
    s = stepManual(s, TICK_MS);
    expect(tr.faultTick).toBe(FAULT_S * 10);
    expect(s.faultPod).toBe(ready[1] ?? ready[ready.length - 1]);
    expect(s.totals.faults).toBe(1);
    expect(s.pods.find((p) => p.id === s.faultPod)?.status).toBe('crashed');
    s = stepManual(s, 10_000);
    expect(s.pods.find((p) => p.id === s.faultPod)?.status).toBe('crashed');
    s = stepManual(s, TICK_MS, { type: 'restart', pod: s.faultPod });
    s = stepManual(s, 1000);
    expect(s.pods.find((p) => p.id === s.faultPod)?.status).toBe('ready');
    // Same fault tick in Phase C (shared Traffic).
    expect(simulatePhase(tr, SENSIBLE).totals.faults).toBe(1);
  });

  it('crash after > 1.5 s overloaded; Restart reboots in 1 s; Boost and Roll back work', () => {
    const tr = createTraffic(3);
    let s: SimState = initManual(tr);
    // Run until the hot server crashes.
    while (!s.done && s.totals.crashes === 0) s = stepManual(s, TICK_MS);
    const crashed = s.pods.find((p) => p.status === 'crashed');
    expect(crashed?.id).toBe(tr.hot);
    // Phase A never self-recovers.
    s = stepManual(s, 5000);
    expect(s.pods.find((p) => p.id === tr.hot)?.status).toBe('crashed');
    s = stepManual(s, TICK_MS, { type: 'restart', pod: tr.hot });
    expect(s.pods.find((p) => p.id === tr.hot)?.status).toBe('starting');
    s = stepManual(s, 1000);
    expect(s.pods.find((p) => p.id === tr.hot)?.status).toBe('ready');
    // Boost raises capacity: the CPU of the boosted server drops.
    const other = s.pods.find((p) => p.status === 'ready' && p.id !== tr.hot);
    expect(other).toBeDefined();
    const before = s.pods.find((p) => p.id === other?.id)?.cpu ?? 0;
    s = stepManual(s, TICK_MS, { type: 'boost', pod: other?.id ?? -1 });
    expect(s.totals.boosts).toBe(1);
    expect(s.pods.find((p) => p.id === other?.id)?.cpu).toBeLessThan(before);
    // A second boost on the same server is ignored (active / cooldown).
    s = stepManual(s, TICK_MS, { type: 'boost', pod: other?.id ?? -1 });
    expect(s.totals.boosts).toBe(1);
    // Bad deploy: 50% errors until rolled back.
    while (s.tick < tr.badDeployTick + 5) s = stepManual(s, TICK_MS);
    expect(s.deploy).toBe('bad');
    expect(s.last.errored).toBeGreaterThan(0);
    s = stepManual(s, TICK_MS, { type: 'rollback' });
    expect(s.deploy).toBe('rolledBack');
    expect(s.last.errored).toBe(0);
  });

  it('steps are pure and accumulate sub-tick frames', () => {
    const s0 = initManual(createTraffic(1));
    const snap = JSON.stringify({ ...s0, traffic: null });
    const s1 = stepManual(s0, 50);
    expect(JSON.stringify({ ...s0, traffic: null })).toBe(snap);
    expect(s1.tick).toBe(0);
    expect(stepManual(s1, 60).tick).toBe(1);
    // 60fps frames reach the same state as whole ticks.
    let a = s0;
    for (let i = 0; i < 300; i++) a = stepManual(a, 1000 / 60);
    let b = s0;
    for (let i = 0; i < a.tick; i++) b = stepManual(b, TICK_MS);
    expect(a.totals).toEqual(b.totals);
  });
});

describe('Phase C (auto)', () => {
  it('a sensible config reaches ≥ 99% uptime AND stays under budget (3★) for any app quality', () => {
    for (const q of QUALITIES) {
      for (const seed of SEEDS) {
        const tr = createTraffic(seed, { intensity: q });
        for (const c of [SENSIBLE, SENSIBLE_ALT]) {
          const s = run(tr, c);
          expect(s.uptime).toBeGreaterThanOrEqual(0.99);
          expect(s.underBudget).toBe(true);
          // The hardware fault is the only crash; self-healing absorbs it.
          expect(s.faults).toBe(1);
          expect(s.crashes).toBe(1);
          expect(cloudStars(cloudStageScore(cloudScores({ manualUptime: 0.7, autoUptime: s.uptime, cost: s.cost, budget: s.budget })))).toBe(3);
        }
      }
    }
  });

  it('M5 acceptance: manual < auto uptime for a sensible config', () => {
    for (const seed of SEEDS) {
      const tr = createTraffic(seed);
      expect(run(tr, null, humanPolicy()).uptime).toBeLessThan(run(tr, SENSIBLE).uptime - 0.15);
    }
  });

  it('everything maxed is reliable but over budget', () => {
    for (const seed of SEEDS) {
      const tr = createTraffic(seed);
      const s = run(tr, MAXED);
      expect(s.uptime).toBeGreaterThanOrEqual(0.99);
      expect(s.underBudget).toBe(false);
      expect(s.cost).toBeCloseTo(12 * CREDITS_PER_POD_MIN, 6);
      expect(cloudStars(cloudStageScore(cloudScores({ manualUptime: 0.7, autoUptime: s.uptime, cost: s.cost, budget: s.budget })))).toBeLessThan(3);
      // Max 12 with a 40% threshold also blows the budget, just less.
      expect(run(tr, { ...SENSIBLE, minPods: 1, maxPods: 12, scaleUpCpu: 0.4 }).underBudget).toBe(false);
    }
  });

  it('threshold too high (90%) scales too late: crashes and lower uptime', () => {
    const ups: number[] = [];
    for (const seed of SEEDS) {
      const tr = createTraffic(seed);
      const s = run(tr, { ...SENSIBLE, scaleUpCpu: 0.9 });
      expect(s.crashes).toBeGreaterThan(0);
      expect(s.uptime).toBeLessThan(0.97);
      expect(s.uptime).toBeLessThan(run(tr, SENSIBLE).uptime - 0.02);
      ups.push(s.uptime);
    }
    expect(mean(ups)).toBeLessThan(0.92);
  });

  it('max pods too low crashes at peak', () => {
    for (const seed of SEEDS) {
      const tr = createTraffic(seed);
      const s = run(tr, { ...SENSIBLE, maxPods: 4 });
      expect(s.crashes).toBeGreaterThan(5);
      expect(s.peakPods).toBe(4);
      expect(s.uptime).toBeLessThan(0.75);
    }
  });

  it('load balancer off is worse (one pod hammered)', () => {
    for (const seed of SEEDS) {
      const tr = createTraffic(seed);
      const s = run(tr, { ...SENSIBLE, loadBalancer: false });
      expect(s.crashes).toBeGreaterThan(s.faults);
      expect(s.uptime).toBeLessThan(0.8);
      expect(s.uptime).toBeLessThan(run(tr, SENSIBLE).uptime - 0.15);
    }
  });

  it('self-healing off is worse once pods crash (down 15 s instead of 3 s)', () => {
    for (const seed of SEEDS) {
      const tr = createTraffic(seed);
      for (const base of [{ ...SENSIBLE, maxPods: 4 }, { ...SENSIBLE, scaleUpCpu: 0.9 }]) {
        const on = run(tr, base);
        const off = run(tr, { ...base, selfHealing: false });
        expect(off.uptime).toBeLessThan(on.uptime - 0.03);
      }
    }
  });

  it('hardware fault: self-healing ON keeps a sensible config ≥ 99%; OFF drops it below 99% (zombie pod)', () => {
    for (const q of QUALITIES) {
      for (const seed of SEEDS) {
        const tr = createTraffic(seed, { intensity: q });
        for (const c of [SENSIBLE, SENSIBLE_ALT]) {
          const on = run(tr, c);
          const off = run(tr, { ...c, selfHealing: false });
          expect(on.uptime).toBeGreaterThanOrEqual(0.99);
          expect(off.uptime).toBeLessThan(0.99);
          expect(off.uptime).toBeLessThan(on.uptime - 0.02);
          expect(off.faults).toBe(1);
        }
      }
    }
  });

  it('self-healing OFF: the load balancer keeps feeding a crashed pod (no liveness probe); ON routes around it', () => {
    const tr = createTraffic(2);
    const at = (c: ClusterConfig) => {
      let s = initCluster(c, tr);
      while (s.tick <= tr.faultTick) s = stepCluster(s, TICK_MS, c);
      return s;
    };
    const on = at(SENSIBLE);
    expect(on.last.ok).toBeCloseTo(on.last.demand, 6);
    const off = at({ ...SENSIBLE, selfHealing: false });
    const n = off.pods.length;
    expect(off.last.dropped).toBeCloseTo(off.last.demand / n, 6);
  });

  it('uptime never gets worse as the threshold goes down or max pods goes up (switches on)', () => {
    const TOL = 0.005;
    for (const q of [0, 0.5, 1]) {
      for (const seed of SEEDS) {
        const tr = createTraffic(seed, { intensity: q });
        for (const minPods of [1, 2]) {
          for (const maxPods of [10, 12]) {
            let prev = 1;
            for (let th = 40; th <= 90; th += 5) {
              const u = run(tr, { ...SENSIBLE, minPods, maxPods, scaleUpCpu: th / 100 }).uptime;
              expect(u, `q${q} seed${seed} min${minPods} max${maxPods} ${th}%`).toBeLessThanOrEqual(prev + TOL);
              prev = u;
            }
          }
          let prev = 0;
          for (let maxPods = 3; maxPods <= 12; maxPods++) {
            const u = run(tr, { ...SENSIBLE, minPods, maxPods, scaleUpCpu: 0.65 }).uptime;
            expect(u, `q${q} seed${seed} min${minPods} max${maxPods} 65%`).toBeGreaterThanOrEqual(prev - TOL);
            prev = u;
          }
        }
      }
    }
  });

  it('3★ band at min 2 / max 10: 60–70% always; 40–45% and "add pods early" over budget', () => {
    for (const q of QUALITIES) {
      for (const seed of SEEDS) {
        const tr = createTraffic(seed, { intensity: q });
        for (const th of [0.6, 0.65, 0.7]) {
          const s = run(tr, { ...SENSIBLE, scaleUpCpu: th });
          expect(s.uptime >= 0.99 && s.underBudget, `q${q} seed${seed} ${th}`).toBe(true);
        }
        for (const th of [0.4, 0.45]) expect(run(tr, { ...SENSIBLE, scaleUpCpu: th }).underBudget).toBe(false);
        // "Add pods early" (min 1, max 12, 40%) is reliable but blows the budget.
        expect(run(tr, { ...SENSIBLE, minPods: 1, maxPods: 12, scaleUpCpu: 0.4 }).underBudget).toBe(false);
      }
    }
  });

  it('warm-up: a pod that just came back survives overload for WARMUP_S + 1.5 s', () => {
    const tr = createTraffic(1);
    const cfg: ClusterConfig = { ...SENSIBLE, minPods: 1, maxPods: 1 };
    let s = initCluster(cfg, tr);
    while (!s.done && s.totals.crashes === 0) s = stepCluster(s, TICK_MS, cfg);
    s = stepCluster(s, SELF_HEAL_S * 1000, cfg);
    expect(s.pods[0]?.status).toBe('ready');
    expect(s.pods[0]?.cpu).toBeGreaterThan(1);
    s = stepCluster(s, WARMUP_S * 1000 + CRASH_TICKS * TICK_MS - TICK_MS, cfg);
    expect(s.pods[0]?.status).toBe('ready');
    s = stepCluster(s, 2 * TICK_MS, cfg);
    expect(s.pods[0]?.status).toBe('crashed');
  });

  it('crash recovery timing: 3 s with self-healing, 15 s without, Restart tap overrides', () => {
    // A 1-pod cluster at peak demand crashes; watch it come back.
    const tr = createTraffic(1);
    const cfg: ClusterConfig = { ...SENSIBLE, minPods: 1, maxPods: 1 };
    const crashTick = (c: ClusterConfig) => {
      let s = initCluster(c, tr);
      while (!s.done && s.totals.crashes === 0) s = stepCluster(s, TICK_MS, c);
      return s;
    };
    const healed = crashTick(cfg);
    const back = (s: SimState, c: ClusterConfig, ms: number) => stepCluster(s, ms, c).pods[0]?.status;
    expect(back(healed, cfg, SELF_HEAL_S * 1000 - TICK_MS)).toBe('crashed');
    expect(back(healed, cfg, SELF_HEAL_S * 1000)).toBe('ready');
    const noHeal = { ...cfg, selfHealing: false };
    const down = crashTick(noHeal);
    expect(back(down, noHeal, 10_000)).toBe('crashed');
    expect(back(down, noHeal, MANUAL_RECOVER_S * 1000)).toBe('ready');
    const tapped = stepCluster(down, TICK_MS, noHeal, { type: 'restart', pod: down.pods[0]?.id ?? -1 });
    expect(stepCluster(tapped, 1000, noHeal).pods[0]?.status).toBe('ready');
  });

  it('HPA: evaluates every 2 s, new pods cold-start for 4 s', () => {
    const tr = createTraffic(1);
    const cfg = { ...SENSIBLE, minPods: 1 };
    let s = initCluster(cfg, tr);
    while (!s.done && s.pods.length === 1) s = stepCluster(s, TICK_MS, cfg);
    expect(s.tick % 20).toBe(1); // added on an evaluation tick (multiple of 20), observed after it
    const added = s.pods.filter((p) => p.status === 'starting');
    expect(added.length).toBeGreaterThan(0);
    s = stepCluster(s, COLD_START_S * 1000 - 2 * TICK_MS, cfg);
    expect(s.pods.find((p) => p.id === added[0]?.id)?.status).toBe('starting');
    s = stepCluster(s, TICK_MS, cfg);
    expect(s.pods.find((p) => p.id === added[0]?.id)?.status).toBe('ready');
  });

  it('rolling update off leaves the bad deploy erroring until Roll back; on catches it in seconds', () => {
    const tr = createTraffic(4);
    const off = simulatePhase(tr, { ...SENSIBLE, rollingUpdate: false });
    expect(off.deploy).toBe('bad');
    const offSum = summarize(off);
    expect(offSum.errored).toBeGreaterThan(0.3);
    expect(offSum.uptime).toBeLessThan(0.7);
    // The player can still intervene in Phase C.
    const fixed = run(tr, { ...SENSIBLE, rollingUpdate: false }, humanPolicy());
    expect(fixed.rollbacks).toBe(1);
    expect(fixed.uptime).toBeGreaterThan(0.98);
    const on = simulatePhase(tr, SENSIBLE);
    expect(on.deploy).toBe('rolledBack');
    expect(summarize(on).errored).toBeGreaterThan(0);
    expect(summarize(on).errored).toBeLessThan(0.005);
    expect(on.totals.rollbacks).toBe(0); // automatic, not a tap
    expect(tr.badDeployTick).toBe(BAD_DEPLOY_S * 10);
  });

  it('is deterministic', () => {
    const a = simulatePhase(createTraffic(77), { ...SENSIBLE, scaleUpCpu: 0.9 }, humanPolicy());
    const b = simulatePhase(createTraffic(77), { ...SENSIBLE, scaleUpCpu: 0.9 }, humanPolicy());
    expect(a.totals).toEqual(b.totals);
    expect(a.pods).toEqual(b.pods);
  });

  it('frame stepping matches simulatePhase', () => {
    const tr = createTraffic(8);
    let s = initCluster(SENSIBLE, tr);
    while (!s.done) s = stepCluster(s, 1000 / 60, SENSIBLE);
    expect(s.totals.ok).toBeCloseTo(simulatePhase(tr, SENSIBLE).totals.ok, 6);
  });

  it('config is clamped to the §7.3 ranges; cost range and preview', () => {
    expect(normalizeConfig({ ...SENSIBLE, minPods: 0, maxPods: 40, scaleUpCpu: 0.1 })).toMatchObject({ minPods: 1, maxPods: 12, scaleUpCpu: 0.4 });
    expect(normalizeConfig({ ...SENSIBLE, minPods: 6, maxPods: 2 })).toMatchObject({ minPods: 6, maxPods: 6 });
    expect(costRange(SENSIBLE)).toEqual({ min: 20, max: 100 });
    const tr = createTraffic(1);
    expect(previewCluster(SENSIBLE, tr)).toEqual(run(tr, SENSIBLE));
    expect(POD_CAPACITY).toBe(100);
  });
});

describe('scoring (§7.4)', () => {
  const sc = (autoUptime: number, cost: number, budget = 60) => cloudStageScore(cloudScores({ manualUptime: 0.7, autoUptime, cost, budget }));

  it('3★ needs ≥ 99% AND under budget', () => {
    expect(cloudStars(sc(0.99, 60))).toBe(3);
    expect(cloudStars(sc(0.995, 50))).toBe(3);
    expect(cloudStars(sc(0.989, 50))).toBe(2);
    expect(cloudStars(sc(0.999, 61))).toBe(2);
    expect(cloudStars(sc(0.999, 120))).toBe(1);
    expect(cloudStars(sc(0.8, 50))).toBe(0);
    expect(cloudStars(sc(0.9, 50), CLOUD_STARS)).toBe(1);
  });

  it('cloudScores normalises', () => {
    expect(cloudScores({ manualUptime: 1.2, autoUptime: -1, cost: 120, budget: 60 })).toEqual({ manualUptime: 1, autoUptime: 0, costEfficiency: 0.5 });
    expect(cloudScores({ manualUptime: 0.6, autoUptime: 0.99, cost: 40, budget: 60 }).costEfficiency).toBe(1);
  });
});

describe('performance', () => {
  it('a full phase steps in well under 50 ms', () => {
    const tr = createTraffic(1, { intensity: 1 });
    simulatePhase(tr, MAXED); // warm up the JIT
    const t0 = performance.now();
    let s = initCluster(MAXED, tr);
    while (!s.done) s = stepCluster(s, 1000 / 60, MAXED);
    const frames = performance.now() - t0;
    const t1 = performance.now();
    simulatePhase(tr, null, humanPolicy());
    const whole = performance.now() - t1;
    expect(frames).toBeLessThan(50);
    expect(whole).toBeLessThan(50);
  });
});
