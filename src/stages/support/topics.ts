import { z } from 'zod';
import { useGroup } from '../../net/group';

/*
 * Topics the main phone publishes for support phones, and the actions supports send back
 * (group mode, spec §3.5.2). Everything is zod-validated on receipt (untrusted).
 */

/** Stage 1: households already kept, the right fix for the card on screen, rules in play. */
export const S1 = 's1';
export const s1Schema = z.object({
  kept: z.array(z.string().max(12)).max(40),
  fix: z.string().max(30).nullable(),
  rules: z.array(z.number().int().min(1).max(5)).max(5),
});
export type S1 = z.infer<typeof s1Schema>;

/** Stage 2: which level, Reveal charges (Covered Up), the audit item's confidence (Audit). */
export const S2 = 's2';
export const s2Schema = z.object({
  level: z.enum(['label', 'covered', 'box', 'audit', 'other']),
  charges: z.number().int().min(0).max(9).nullable(),
  audit: z.object({ predicted: z.string().max(30), pct: z.number().int().min(0).max(100) }).nullable(),
});
export type S2 = z.infer<typeof s2Schema>;
export const REVEAL = 'reveal';

/** Stage 3: the next run's flood, house needs (Ask the AI), and the last failed run. */
export const S3 = 's3';
export const s3Schema = z.object({
  levelId: z.string().max(20),
  flooded: z.array(z.string().max(30)).max(8),
  dry: z.array(z.string().max(30)).max(8),
  needs: z.array(z.object({ house: z.string().max(30), item: z.string().max(30) })).max(8),
  houses: z.array(z.string().max(30)).max(8),
  debug: z.object({ steps: z.array(z.string().max(40)).max(60), stoppedAt: z.string().max(40).nullable() }).nullable(),
});
export type S3 = z.infer<typeof s3Schema>;

/** Stage 4 manual: server states; configure: the settings and cost. */
export const S4M = 's4m';
export const s4mSchema = z.object({
  pods: z
    .array(
      z.object({
        id: z.number().int().min(0).max(20),
        status: z.enum(['ready', 'starting', 'crashed']),
        cpu: z.number().min(0).max(5),
        boosted: z.boolean(),
        cooling: z.boolean(),
      }),
    )
    .max(3),
});
export type S4M = z.infer<typeof s4mSchema>;
export const BOOST = 'boost';
export const RESTART = 'restart';
export const podActionSchema = z.object({ pod: z.number().int().min(0).max(20) });

export const S4C = 's4c';
export const configSchema = z.object({
  loadBalancer: z.boolean(),
  minPods: z.number().int().min(1).max(12),
  maxPods: z.number().int().min(1).max(12),
  scaleUpCpu: z.number().min(0.4).max(0.9),
  selfHealing: z.boolean(),
  rollingUpdate: z.boolean(),
});
export const s4cSchema = z.object({ config: configSchema, cost: z.number().min(0).max(1000), budget: z.number().min(0).max(1000) });
export type S4C = z.infer<typeof s4cSchema>;
export const CONFIG = 'cfg';
export const configPatchSchema = configSchema.partial();

/** Stage 4 replay (Phase C): live numbers, crashed pods and a bad update, so supports can help. */
export const S4R = 's4r';
export const s4rSchema = z.object({
  uptime: z.number().min(0).max(1),
  pods: z.number().int().min(0).max(20),
  cost: z.number().min(0).max(1000),
  budget: z.number().min(0).max(1000),
  crashed: z.array(z.number().int().min(0).max(20)).max(20),
  badDeploy: z.boolean(),
});
export type S4R = z.infer<typeof s4rSchema>;
export const ROLLBACK = 'rollback';

/** Finale: the incident on screen, or an "all hands" call. */
export const S5 = 's5';
export const s5Schema = z.object({
  incident: z.object({ id: z.string().max(10), n: z.number().int(), total: z.number().int() }).nullable(),
  allHands: z.object({ id: z.string().max(10) }).nullable(),
  tapped: z.array(z.string().max(64)).max(8),
});
export type S5 = z.infer<typeof s5Schema>;
export const ROUTE = 'route';
/** `id`: the incident it answers, so a late tap never routes the next incident. */
export const routeSchema = z.object({ team: z.enum(['data', 'ai', 'logic', 'cloud']), id: z.string().max(10).optional() });
export const allHandsTapSchema = z.object({ id: z.string().max(10) });
export const ALL_HANDS_TAP = 'allHands:tap';

/**
 * Main phone in a group with at least one support: the info and controls listed in §3.5.2 move
 * to the support phones (CLAUDE.md rule 7: nobody idle). Solo or a lone main phone: everything
 * stays on this phone, as before.
 */
export function useCoop(): boolean {
  const g = useGroup();
  // Present supports only: if the last one drops, its controls come back here at once (the 30 s
  // "gone" mark is for re-dealing cards, too slow for an 8 s incident).
  return g.active && g.amMain && g.supports.some((m) => m.present);
}
