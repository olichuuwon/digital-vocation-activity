import { it } from 'vitest';
import { createTraffic, simulatePhase, summarize, humanPolicy, type ClusterConfig } from './cluster';
const base: ClusterConfig = { loadBalancer: true, minPods: 2, maxPods: 10, scaleUpCpu: 0.65, selfHealing: true, rollingUpdate: true };
const cfgs: Record<string, ClusterConfig> = {
  sensible: base,
  sensible3_8_70: { ...base, minPods: 3, maxPods: 8, scaleUpCpu: 0.7 },
  sensible2_8_60: { ...base, minPods: 2, maxPods: 8, scaleUpCpu: 0.6 },
  maxed: { ...base, minPods: 12, maxPods: 12, scaleUpCpu: 0.4 },
  maxedMin1: { ...base, minPods: 1, maxPods: 12, scaleUpCpu: 0.4 },
  thr90: { ...base, scaleUpCpu: 0.9 },
  max4: { ...base, maxPods: 4 },
  lbOff: { ...base, loadBalancer: false },
  healOff: { ...base, selfHealing: false },
  rollOff: { ...base, rollingUpdate: false },
  default: { loadBalancer: false, minPods: 1, maxPods: 3, scaleUpCpu: 0.8, selfHealing: false, rollingUpdate: false },
};
it('tune', () => {
  for (const q of [0, 0.5, 1]) {
    const rows: string[] = [];
    for (const seed of [1, 2, 3, 42, 99]) {
      const tr = createTraffic(seed, { intensity: q });
      const f = (x: number) => (x * 100).toFixed(1);
      const m0 = summarize(simulatePhase(tr, null));
      const mh = summarize(simulatePhase(tr, null, humanPolicy()));
      let line = `q${q} s${seed} peak${tr.peak.toFixed(0)} bud${tr.budget} manNone ${f(m0.uptime)} manHuman ${f(mh.uptime)} (cr${mh.crashes} b${mh.boosts})`;
      for (const [k, c] of Object.entries(cfgs)) {
        const r = summarize(simulatePhase(tr, c));
        line += ` | ${k} ${f(r.uptime)} $${r.cost.toFixed(0)} cr${r.crashes}`;
      }
      rows.push(line);
    }
    console.log(rows.join('\n'));
  }
});
