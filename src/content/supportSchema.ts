import { z } from 'zod';

/*
 * Group mode support cards (spec §3.5.2). Every support phone holds information or a control the
 * main player needs (CLAUDE.md rule 7). Cards are dealt across support phones (1 support: all
 * cards as tabs; 2–3 supports: one each). Text: src/content/supportCopy.json.
 * Instruction text is ≤15 words (§3.5.2 "readable at a glance").
 */
const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });

/** Card ids per stage, in dealing order. */
export const SUPPORT_CARDS = {
  1: ['rulebook', 'duplicates', 'fixKit'],
  2: ['reveal', 'fieldGuide', 'auditor'],
  3: ['scout', 'manifest', 'debugger'],
  4: ['servers', 'balancer', 'autoscaler'],
  5: ['routing'],
} as const;
export type SupportStage = keyof typeof SUPPORT_CARDS;

const card = z.object({
  title: words(4),
  /** What to do with this card, ≤15 words. */
  instruction: words(15),
});

export const supportCopySchema = z.object({
  common: z.object({
    supporting: txt,
    waiting: words(12),
    newInfo: words(6),
    tabsLabel: txt,
    yourCard: txt,
  }),
  cards: z.object({
    rulebook: card,
    duplicates: card.extend({ seen: txt, none: words(8) }),
    fixKit: card.extend({ none: words(10), answer: txt }),
    reveal: card.extend({ button: words(3), left: txt, none: words(8) }),
    fieldGuide: card,
    auditor: card.extend({ confidence: txt, none: words(10) }),
    scout: card.extend({ flooded: txt, dry: txt, none: words(10) }),
    manifest: card.extend({ needs: txt, route: words(15), none: words(10) }),
    debugger: card.extend({ stepOf: txt, none: words(10), stoppedAt: txt }),
    servers: card.extend({ none: words(10) }),
    balancer: card,
    autoscaler: card,
    routing: card.extend({ allHands: words(10), confirm: words(3), waiting: words(10) }),
  }),
  /** Main phone, group mode: the info that now lives on a support phone. */
  main: z.object({
    askRulebook: words(15),
    askGuide: words(15),
    askScout: words(15),
    askServers: words(15),
    askIncidents: words(15),
  }),
  /** Finale "all hands" incidents (§8.2: every member taps within 5 s). */
  /** Main phone during an all-hands call. */
  allHandsUi: z.object({ call: words(15), ready: txt, button: words(3), right: words(12), missed: words(12) }),
  allHands: z.array(z.object({ id: z.string().regex(/^ah\d$/), text: words(14) })).min(2),
});
export type SupportCopy = z.infer<typeof supportCopySchema>;
