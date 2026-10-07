import { z } from 'zod';

/*
 * Stage 4 "Keep It Alive" content contract (spec §7). Simulation: src/sim/cluster.ts (rules and
 * constants live there, documented in its header). Text: src/content/stage4Copy.json.
 * Phases are the stage's 3 levels: cloud-manual (A), cloud-configure (B, after the Kubernetes
 * Reality Check), cloud-replay (C).
 */
const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });

export const stage4CopySchema = z.object({
  levelIntro: z.object({ 'cloud-manual': words(25), 'cloud-configure': words(25), 'cloud-replay': words(25) }),
  tutorialHint: words(15),
  manual: z.object({
    server: txt,
    busy: txt,
    crashed: words(2),
    rebooting: words(2),
    restart: words(2),
    boost: words(2),
    boosted: words(2),
    cooling: words(3),
    rollback: words(3),
    badDeploy: words(10),
    uptime: txt,
    traffic: txt,
    crashToast: words(10),
    deployToast: words(10),
    rolledBack: words(8),
  }),
  configure: z.object({
    heading: words(5),
    loadBalancer: words(4),
    loadBalancerHelp: words(15),
    minPods: words(3),
    maxPods: words(3),
    podsHelp: words(15),
    threshold: txt,
    thresholdHelp: words(15),
    selfHealing: words(3),
    selfHealingHelp: words(15),
    rolling: words(4),
    rollingHelp: words(15),
    on: txt,
    off: txt,
    fewer: txt,
    more: txt,
    cost: txt,
    budget: txt,
    overBudget: words(10),
    underBudget: words(10),
    go: words(4),
  }),
  replay: z.object({
    pods: txt,
    uptime: txt,
    cost: txt,
    healed: words(10),
    scaledUp: words(8),
    scaledDown: words(8),
    autoRollback: words(12),
    compareHeading: words(5),
    manual: words(3),
    auto: words(3),
    tweak: words(4),
    accept: words(4),
  }),
  /** One line after the replay explaining the result (bad configs fail in teachable ways, §7.4). */
  diagnosis: z.object({
    perfect: words(20),
    overBudget: words(20),
    tooFewPods: words(20),
    thresholdHigh: words(20),
    noLoadBalancer: words(20),
    noHealing: words(20),
    noRolling: words(20),
  }),
  hint: words(20),
  timeUp: words(12),
  result: z.object({
    heading3: txt,
    heading2: txt,
    heading1: txt,
    heading0: txt,
    manual: txt,
    auto: txt,
    cost: txt,
  }),
  learned: words(25),
});
export type Stage4Copy = z.infer<typeof stage4CopySchema>;
