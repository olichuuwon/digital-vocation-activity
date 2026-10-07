import { z } from 'zod';

/*
 * Stage 3 "Build the Logic" content contract (spec §6). Levels live in src/content/stage3.json,
 * text in src/content/stage3Copy.json. Engine: src/sim/grid.ts. Stage logic: src/stages/logic/.
 *
 * MAP: rows of equal length (6–8 tiles square), one character per tile:
 *   '.'  grass / buildings: the truck can't drive here (driving onto it = "off the road")
 *   '#'  road
 *   'D'  depot: road tile where the truck starts (facing `startDir`)
 *   'H'  house on a road tile: needs one supply drop (plain "Drop supplies" works)
 *   'W' 'F' 'M'  house that needs water / food / a medical kit (Ask the AI levels; plain Drop is wrong)
 *   '~'  always flooded: driving into it = stuck
 *   'a' 'b' 'c'  flood groups: a road tile that MAY be flooded. Each run exactly one group listed in
 *        `floodGroups` floods (seeded), the others are dry road. "Flooding is random each run" (§6.3 L3).
 *
 * TRUCK: `forward` moves one tile in the facing direction. Off the map or onto '.' → crash;
 * onto a flooded tile → stuck. `left`/`right` turn 90° on the spot. `drop` on an undelivered house
 * delivers (on a W/F/M house it's the wrong supply → fail); `drop` anywhere else → fail.
 * `askAi` on a W/F/M house asks the player's Stage 2 model what's needed and drops that: right with
 * probability modelAccuracy (seeded), otherwise a wrong drop that is SHOWN but doesn't stop the run
 * (§6.3 L5: "low modelAccuracy leads to some wrong drops"). Success = program ends with every house
 * delivered. `ifFlooded` checks the tile ahead (flooded '~' or the active group); off-map/grass is not
 * flooded.
 *
 * BLOCK COUNT: every block counts 1, containers included (Repeat ×3 { Move } = 2 blocks).
 */

export const DIRS = ['N', 'E', 'S', 'W'] as const;
export const dirSchema = z.enum(DIRS);
export type Dir = z.infer<typeof dirSchema>;

export const BLOCK_OPS = ['forward', 'left', 'right', 'drop', 'repeat', 'ifFlooded', 'askAi'] as const;
export const blockOpSchema = z.enum(BLOCK_OPS);
export type BlockOp = z.infer<typeof blockOpSchema>;

export type Block =
  | { op: 'forward' | 'left' | 'right' | 'drop' | 'askAi' }
  | { op: 'repeat'; n: number; body: Block[] }
  | { op: 'ifFlooded'; then: Block[]; else: Block[] };
export type Program = Block[];

export const REPEAT_MIN = 2;
export const REPEAT_MAX = 9;

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    z.object({ op: z.enum(['forward', 'left', 'right', 'drop', 'askAi']) }),
    z.object({ op: z.literal('repeat'), n: z.number().int().min(REPEAT_MIN).max(REPEAT_MAX), body: z.array(blockSchema) }),
    z.object({ op: z.literal('ifFlooded'), then: z.array(blockSchema), else: z.array(blockSchema) }),
  ]),
);
export const programSchema = z.array(blockSchema);

const TILE = /^[.#DHWFM~abc]+$/;

export const levelIdSchema = z.enum(['logic-tutorial', 'logic-l1', 'logic-l2', 'logic-l3', 'logic-l4', 'logic-l5']);
export type LogicLevelId = z.infer<typeof levelIdSchema>;

export const logicLevelSchema = z
  .object({
    id: levelIdSchema,
    /** Rows, top (north) first. */
    grid: z.array(z.string().regex(TILE)).min(6).max(8),
    startDir: dirSchema,
    /** Base seconds before relaxed ×1.5; null = untimed. */
    seconds: z.number().int().positive().nullable(),
    /** Max blocks for the program; null = no limit (tutorial). L4 Debug It: null (edits are limited instead). */
    blockLimit: z.number().int().min(2).max(20).nullable(),
    /** Fewest blocks a solution needs (the solver test proves it); used for efficiency/extraBlocks. */
    par: z.number().int().min(1),
    /** Blocks available in the palette, in display order. */
    palette: z.array(blockOpSchema).min(1),
    /** Flood groups for this level ('a' | 'b' | 'c'); exactly one floods per run. Empty = no random floods. */
    floodGroups: z.array(z.enum(['a', 'b', 'c'])).default([]),
    /** L4 Debug It: the broken program the player starts with. */
    prebuilt: programSchema.optional(),
    /** L4: most blocks the player may swap. */
    maxEdits: z.number().int().min(1).max(3).optional(),
    /** A known-good program (shown as the answer after 3 failed runs; checked by tests). */
    solution: programSchema,
  })
  .superRefine((l, ctx) => {
    const w = l.grid[0]!.length;
    if (l.grid.length !== w) ctx.addIssue({ code: 'custom', message: `${l.id}: grid must be square` });
    if (l.grid.some((r) => r.length !== w)) ctx.addIssue({ code: 'custom', message: `${l.id}: rows differ in length` });
    const all = l.grid.join('');
    if ((all.match(/D/g) ?? []).length !== 1) ctx.addIssue({ code: 'custom', message: `${l.id}: exactly one depot` });
    if (!/[HWFM]/.test(all)) ctx.addIssue({ code: 'custom', message: `${l.id}: needs a house` });
    for (const g of l.floodGroups)
      if (!all.includes(g)) ctx.addIssue({ code: 'custom', message: `${l.id}: flood group ${g} not on the map` });
    if (l.id === 'logic-l4' && (!l.prebuilt || !l.maxEdits))
      ctx.addIssue({ code: 'custom', message: 'logic-l4 needs prebuilt + maxEdits' });
  });
export type LogicLevel = z.infer<typeof logicLevelSchema>;

export const stage3FileSchema = z.object({
  levels: z.array(logicLevelSchema).length(6),
  /** Mini-maps run in the Reality Check robustness test (§6.4 "100 mini-maps"). */
  testMaps: z.number().int().min(20).max(200),
  /** Star thresholds on the stage score (0–1), see src/stages/logic/logic.ts. */
  stars: z.object({ one: z.number(), two: z.number(), three: z.number() }),
});
export type Stage3Content = z.infer<typeof stage3FileSchema>;

// ---------------------------------------------------------------------------------------
// Copy (content-writer). Word limits: CLAUDE.md rule 1 (≤25 per instruction card).
// ---------------------------------------------------------------------------------------
const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });
const perLevel = <T extends z.ZodTypeAny>(t: T) =>
  z.object({
    'logic-tutorial': t,
    'logic-l1': t,
    'logic-l2': t,
    'logic-l3': t,
    'logic-l4': t,
    'logic-l5': t,
  });

export const stage3CopySchema = z.object({
  levelIntro: perLevel(words(25)),
  /** Shown after 2 failed runs, per level. */
  levelHint: perLevel(words(20)),
  /** Plain-language block names (no code syntax on screen, §6). `{n}` = repeat count. */
  blocks: z.object({
    forward: words(3),
    left: words(3),
    right: words(3),
    drop: words(3),
    repeat: words(3),
    ifFlooded: words(6),
    otherwise: words(2),
    askAi: words(6),
  }),
  editor: z.object({
    program: words(3),
    palette: words(3),
    empty: words(12),
    blocksUsed: txt,
    noLimit: txt,
    overLimit: words(12),
    addHere: words(4),
    insideRepeat: words(5),
    insideThen: words(5),
    insideElse: words(5),
    remove: words(2),
    moveUp: words(3),
    moveDown: words(3),
    times: txt,
    more: txt,
    fewer: txt,
    clear: words(2),
    selected: txt,
    swapPrompt: words(12),
    editsLeft: txt,
    tutorialHint: words(12),
  }),
  run: z.object({
    run: words(2),
    step: words(2),
    reset: words(2),
    running: words(3),
    showAnswer: words(3),
    success: words(10),
    crash: words(12),
    stuck: words(12),
    noHouse: words(12),
    wrongSupply: words(12),
    unfinished: words(12),
    aiWrong: words(15),
    overLimit: words(15),
    nextTry: words(12),
    /** L3: the program worked on this run's flood but would fail on the other road. */
    lucky: words(20),
  }),
  map: z.object({
    label: txt,
    truck: txt,
    depot: txt,
    house: txt,
    delivered: txt,
    flooded: txt,
    maybeFlooded: txt,
    road: txt,
    grass: txt,
    needs: z.object({ W: txt, F: txt, M: txt }),
    facing: z.object({ N: txt, E: txt, S: txt, W: txt }),
  }),
  hint: txt,
  answer: words(20),
  timeUp: words(15),
  result: z.object({
    heading3: txt,
    heading2: txt,
    heading1: txt,
    heading0: txt,
    solved: txt,
    hints: txt,
    blocks: txt,
    tests: txt,
  }),
  learned: words(25),
});
export type Stage3Copy = z.infer<typeof stage3CopySchema>;
