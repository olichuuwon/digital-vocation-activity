import { z } from 'zod';

// Runtime shape of saved progress. Saved data is untrusted: older builds, manual edits, partial writes.
const unit = z.number().min(0).max(1);
const count = z.number().int().min(0);
const star = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const gameStateSchema = z.object({
  mode: z.enum(['booth', 'full']),
  stage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  levelIndex: count,
  scores: z.object({
    data: z.object({ accuracy: unit, fixedCount: count, ruleChosen: z.boolean() }),
    ai: z.object({ labelAccuracy: unit, earlyGuessBonus: unit, auditCatch: unit, modelAccuracy: unit }),
    // extraBlocks arrived in M4; older saves default to 0.
    logic: z.object({ puzzlesSolved: count, hintsUsed: count, efficiency: unit, extraBlocks: count.default(0) }),
    cloud: z.object({ manualUptime: unit, autoUptime: unit, costEfficiency: unit }),
    finale: z.object({ familiesReached: count, incidentsRouted: count }),
  }),
  stars: z.object({ data: star, ai: star, logic: star, cloud: star }),
  bestFamilies: count,
  startedAt: z.number(),
  /** Set at the debrief (M6): the run is over; Home offers a new run, not Resume. */
  finishedAt: z.number().optional(),
  /** Chapter-select replays of this run (varies the Live Ops deal). */
  replays: count.optional(),
});

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  sound: z.boolean(),
  relaxed: z.boolean(),
});
