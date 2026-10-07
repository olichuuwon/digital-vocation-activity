import { createTraffic, DEFAULT_CONFIG, previewCluster, type ClusterConfig } from '../../sim/cluster';
import { newRun } from '../../state/store';
import { appQuality, diagnose } from './logic';

const SENSIBLE: ClusterConfig = { loadBalancer: true, minPods: 2, maxPods: 10, scaleUpCpu: 0.65, selfHealing: true, rollingUpdate: true };
const traffic = createTraffic(42, { intensity: 0.5 });
const run = (c: Partial<ClusterConfig>) => {
  const config = { ...SENSIBLE, ...c };
  return diagnose(config, previewCluster(config, traffic));
};

describe('appQuality', () => {
  it('is 0 for a fresh run and 1 for a perfect one', () => {
    const r = newRun('booth');
    expect(appQuality(r.scores)).toBe(0);
    const s = { ...r.scores, data: { ...r.scores.data, accuracy: 1 }, ai: { ...r.scores.ai, labelAccuracy: 1 }, logic: { ...r.scores.logic, puzzlesSolved: 3 } };
    expect(appQuality(s)).toBe(1);
  });
});

describe('diagnose (teachable failures, §7.4)', () => {
  it('a sensible config is perfect', () => expect(run({})).toBe('perfect'));
  it('everything maxed is over budget', () => expect(run({ minPods: 12, maxPods: 12, scaleUpCpu: 0.4 })).toMatch(/^overBudget/));
  it('load balancer off is named', () => expect(run({ loadBalancer: false })).toBe('noLoadBalancer'));
  it('rolling updates off is named', () => expect(run({ rollingUpdate: false })).toBe('noRolling'));
  it('too few max pods is named', () => expect(run({ maxPods: 4 })).toBe('tooFewPods'));
  it('a 90% threshold is named', () => expect(['thresholdHigh', 'tooFewPods']).toContain(run({ scaleUpCpu: 0.9 })));
  it('the default config gives some diagnosis', () => expect(diagnose(DEFAULT_CONFIG, previewCluster(DEFAULT_CONFIG, traffic))).toBeTruthy());
});
