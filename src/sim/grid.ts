// Stage 3 "Build the Logic" grid engine (spec §6). Pure: no DOM, no Math.random (seeded Rng passed in).
// The map/truck/block semantics are the contract in src/content/stage3Schema.ts; this file follows it.
//
// RUN SEMANTICS (summary of the contract, plus the choices this engine makes)
//   forward  off the map or onto '.' → 'crash'; onto '~' or the active flood group → 'stuck'.
//   left/right turn 90° on the spot.
//   drop     on an undelivered 'H' → delivered; on an undelivered W/F/M → 'wrongSupply';
//            anywhere else (road, depot, an already-served house) → 'noHouse'.
//   askAi    on an undelivered W/F/M → the model's pick: right with probability modelAccuracy
//            (one rng() roll per ask, right when roll < modelAccuracy; no roll when modelAccuracy ≥ 1),
//            otherwise an 'aiWrongDrop':
//            shown, the house counts as served (wrong), the run goes on. On an undelivered 'H' it
//            delivers like drop (no roll). Anywhere else → 'noHouse'.
//   repeat   n iterations; each iteration starts with a 'loop' trace step (iteration k of n).
//   ifFlooded one 'check' trace step (branch taken + whether the tile ahead is flooded), then the
//            branch. Off-map / grass ahead is not flooded.
//   Success = the program ends with every house served (delivered or AI-wrong-dropped). Ends with
//   houses left → 'unfinished'. A run stops at the first failure.
//   Step cap: every trace step (actions, loop and check steps) counts; going past maxSteps
//   (default 300) → 'tooLong'.
//
// TRACE: one TraceStep per executed block step, in order, for the Run animation and Step mode.
//   `path` addresses the block: top-level index, then for a Repeat body the child index
//   ([i, j]); for an If the branch (0 = then, 1 = else) and the child index ([i, 0, j]).
//   `addr` is the same address in src/stages/logic/program.ts BlockAddr form ({list, index}).
//   `truck` is the truck AFTER the step. A failing step has event 'fail', `fail` = the reason and,
//   for a move, `target` = the tile it tried to enter (the truck stays where it was).
import { DIRS, REPEAT_MAX, REPEAT_MIN, type Block, type BlockOp, type Dir, type LogicLevel, type Program } from '../content/stage3Schema';

export type Rng = () => number;
export type FloodGroup = 'a' | 'b' | 'c';
export type Need = 'any' | 'W' | 'F' | 'M';
export type Supply = 'W' | 'F' | 'M';
export type RunReason = 'success' | 'crash' | 'stuck' | 'noHouse' | 'wrongSupply' | 'unfinished' | 'tooLong';
export type FailReason = Exclude<RunReason, 'success' | 'unfinished'>;
export type TraceEvent = 'move' | 'turn' | 'deliver' | 'aiWrongDrop' | 'check' | 'loop' | 'fail';
export type Field = 'body' | 'then' | 'else';

export const DEFAULT_MAX_STEPS = 300;
const SUPPLIES: readonly Supply[] = ['W', 'F', 'M'];
const DX = [0, 1, 0, -1] as const; // N E S W
const DY = [-1, 0, 1, 0] as const;

export interface Pos {
  x: number;
  y: number;
}
export interface House extends Pos {
  need: Need;
}
export interface TruckPos extends Pos {
  dir: Dir;
}

export interface ParsedMap {
  size: number;
  /** tiles[y][x], y = 0 is the top (north) row. */
  tiles: string[][];
  depot: Pos;
  startDir: Dir;
  houses: House[];
  floodTiles: Record<FloodGroup, Pos[]>;
  /** Always-flooded '~' tiles. */
  water: Pos[];
  /** House index per tile (y*size + x), -1 if none. */
  houseAt: Int8Array;
}

export interface TraceStep {
  path: number[];
  addr: { list: (number | Field)[]; index: number };
  op: BlockOp;
  event: TraceEvent;
  /** Truck after this step. */
  truck: TruckPos;
  /** 'fail' steps: why. */
  fail?: FailReason;
  /** Failed move: the tile it tried to enter (may be off the map). */
  target?: Pos;
  /** 'deliver' / 'aiWrongDrop': house index. */
  house?: number;
  /** askAi steps on a W/F/M house: what the house needed and what the AI dropped. */
  need?: Supply;
  gave?: Supply;
  /** 'check': whether the tile ahead is flooded and the branch taken. */
  flooded?: boolean;
  branch?: 'then' | 'else';
  /** 'loop': 1-based iteration of `of`. */
  iteration?: number;
  of?: number;
}

export interface RunResult {
  ok: boolean;
  reason: RunReason;
  /** Trace index of the failing step ('crash' | 'stuck' | 'noHouse' | 'wrongSupply' | 'tooLong'). */
  failAt?: number;
  /** Houses delivered correctly, in delivery order. */
  delivered: number[];
  /** Houses that got a wrong AI drop, in order. */
  wrongDrops: number[];
  aiWrongDrops: number;
  /** Trace length. */
  steps: number;
  trace: TraceStep[];
  truck: TruckPos;
  flood: FloodGroup | null;
}

export interface RunOptions {
  flood: FloodGroup | null;
  /** 0–1; only used by askAi on W/F/M houses. Default 1. */
  modelAccuracy?: number;
  /** Needed when modelAccuracy < 1 (one roll per ask on a W/F/M house). */
  rng?: Rng;
  maxSteps?: number;
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

const mapCache = new WeakMap<LogicLevel, ParsedMap>();

export function parseMap(level: LogicLevel): ParsedMap {
  const hit = mapCache.get(level);
  if (hit) return hit;
  const size = level.grid.length;
  const tiles = level.grid.map((r) => r.split(''));
  const houses: House[] = [];
  const floodTiles: Record<FloodGroup, Pos[]> = { a: [], b: [], c: [] };
  const water: Pos[] = [];
  const houseAt = new Int8Array(size * size).fill(-1);
  let depot: Pos = { x: 0, y: 0 };
  tiles.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t === 'D') depot = { x, y };
      else if (t === 'H' || t === 'W' || t === 'F' || t === 'M') {
        houseAt[y * size + x] = houses.length;
        houses.push({ x, y, need: t === 'H' ? 'any' : t });
      } else if (t === 'a' || t === 'b' || t === 'c') floodTiles[t].push({ x, y });
      else if (t === '~') water.push({ x, y });
    }),
  );
  const parsed: ParsedMap = { size, tiles, depot, startDir: level.startDir, houses, floodTiles, water, houseAt };
  mapCache.set(level, parsed);
  return parsed;
}

/** Exactly one of the level's flood groups (seeded), or null when the level has none. */
export function pickFlood(level: LogicLevel, rng: Rng): FloodGroup | null {
  const g = level.floodGroups;
  if (g.length === 0) return null;
  return g[Math.min(g.length - 1, Math.floor(rng() * g.length))] ?? null;
}

/** Every flood scenario a level can produce: its groups, or [null]. */
export function floodScenarios(level: LogicLevel): (FloodGroup | null)[] {
  return level.floodGroups.length > 0 ? [...level.floodGroups] : [null];
}

/** Every block counts 1, containers included (stage3Schema.ts contract). */
export function countBlocks(program: Program): number {
  let n = 0;
  for (const b of program) {
    n += 1;
    if (b.op === 'repeat') n += countBlocks(b.body);
    else if (b.op === 'ifFlooded') n += countBlocks(b.then) + countBlocks(b.else);
  }
  return n;
}

/** Block at a trace `path` (see header), or undefined. */
export function blockAt(program: Program, path: readonly number[]): Block | undefined {
  let list: Program = program;
  let i = 0;
  for (;;) {
    const b = list[path[i] ?? -1];
    if (!b || i === path.length - 1) return b;
    if (b.op === 'repeat') {
      list = b.body;
      i += 1;
    } else if (b.op === 'ifFlooded') {
      list = path[i + 1] === 0 ? b.then : b.else;
      i += 2;
    } else return undefined;
  }
}

// ---------------------------------------------------------------------------
// Interpreter core (shared by runProgram, the solver and robustness)
// ---------------------------------------------------------------------------

/** Mutable truck state. `served` = delivered | wrong (bitmasks over house index). */
interface St {
  x: number;
  y: number;
  d: number;
  delivered: number;
  wrong: number;
  steps: number;
  fail: FailReason | null;
}

interface Ctx {
  map: ParsedMap;
  flood: FloodGroup | null;
  acc: number;
  rng: Rng | undefined;
  maxSteps: number;
  trace: TraceStep[] | null;
  deliveredOrder: number[] | null;
  wrongOrder: number[] | null;
}

const copySt = (s: St): St => ({ x: s.x, y: s.y, d: s.d, delivered: s.delivered, wrong: s.wrong, steps: s.steps, fail: s.fail });

function flooded(ctx: Ctx, x: number, y: number): boolean {
  const m = ctx.map;
  if (x < 0 || y < 0 || x >= m.size || y >= m.size) return false;
  const t = (m.tiles[y] as string[])[x];
  return t === '~' || (ctx.flood !== null && t === ctx.flood);
}

interface PathFrame {
  path: number[];
  list: (number | Field)[];
}

function record(ctx: Ctx, s: St, frame: PathFrame, index: number, op: BlockOp, event: TraceEvent, extra?: Partial<TraceStep>): void {
  if (!ctx.trace) return;
  ctx.trace.push({
    path: [...frame.path, index],
    addr: { list: frame.list, index },
    op,
    event,
    truck: { x: s.x, y: s.y, dir: DIRS[s.d] as Dir },
    ...extra,
  });
}

/** Counts one step; false (and fail='tooLong') when over the cap. */
function tick(ctx: Ctx, s: St): boolean {
  s.steps += 1;
  if (s.steps > ctx.maxSteps) {
    s.fail = 'tooLong';
    return false;
  }
  return true;
}

function execList(ctx: Ctx, list: Program, s: St, frame: PathFrame | null): boolean {
  for (let i = 0; i < list.length; i++) if (!execBlock(ctx, list[i] as Block, i, s, frame)) return false;
  return true;
}

function execBlock(ctx: Ctx, b: Block, i: number, s: St, frame: PathFrame | null): boolean {
  if (!tick(ctx, s)) return false;
  const m = ctx.map;
  const fail = (reason: FailReason, extra?: Partial<TraceStep>): false => {
    s.fail = reason;
    if (frame) record(ctx, s, frame, i, b.op, 'fail', { fail: reason, ...extra });
    return false;
  };
  switch (b.op) {
    case 'forward': {
      const nx = s.x + DX[s.d as 0];
      const ny = s.y + DY[s.d as 0];
      if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size || (m.tiles[ny] as string[])[nx] === '.')
        return fail('crash', { target: { x: nx, y: ny } });
      if (flooded(ctx, nx, ny)) return fail('stuck', { target: { x: nx, y: ny } });
      s.x = nx;
      s.y = ny;
      if (frame) record(ctx, s, frame, i, b.op, 'move');
      return true;
    }
    case 'left':
    case 'right':
      s.d = (s.d + (b.op === 'left' ? 3 : 1)) & 3;
      if (frame) record(ctx, s, frame, i, b.op, 'turn');
      return true;
    case 'drop':
    case 'askAi': {
      const h = m.houseAt[s.y * m.size + s.x] as number;
      if (h < 0 || ((s.delivered | s.wrong) & (1 << h)) !== 0) return fail('noHouse');
      const need = (m.houses[h] as House).need;
      if (need === 'any') {
        s.delivered |= 1 << h;
        ctx.deliveredOrder?.push(h);
        if (frame) record(ctx, s, frame, i, b.op, 'deliver', { house: h });
        return true;
      }
      if (b.op === 'drop') return fail('wrongSupply', { house: h, need });
      const right = ctx.acc >= 1 || (ctx.rng ? ctx.rng() < ctx.acc : false);
      if (right) {
        s.delivered |= 1 << h;
        ctx.deliveredOrder?.push(h);
        if (frame) record(ctx, s, frame, i, b.op, 'deliver', { house: h, need, gave: need });
      } else {
        s.wrong |= 1 << h;
        ctx.wrongOrder?.push(h);
        // Deterministic wrong pick: the next supply after the needed one.
        const gave = SUPPLIES[(SUPPLIES.indexOf(need) + 1) % 3] as Supply;
        if (frame) record(ctx, s, frame, i, b.op, 'aiWrongDrop', { house: h, need, gave });
      }
      return true;
    }
    case 'repeat': {
      const inner: PathFrame | null = frame ? { path: [...frame.path, i], list: [...frame.list, i, 'body'] } : null;
      for (let k = 1; k <= b.n; k++) {
        if (k > 1 && !tick(ctx, s)) return false;
        if (frame) record(ctx, s, frame, i, b.op, 'loop', { iteration: k, of: b.n });
        if (!execList(ctx, b.body, s, inner)) return false;
      }
      return true;
    }
    case 'ifFlooded': {
      const f = flooded(ctx, s.x + DX[s.d as 0], s.y + DY[s.d as 0]);
      if (frame) record(ctx, s, frame, i, b.op, 'check', { flooded: f, branch: f ? 'then' : 'else' });
      const inner: PathFrame | null = frame
        ? { path: [...frame.path, i, f ? 0 : 1], list: [...frame.list, i, f ? 'then' : 'else'] }
        : null;
      return execList(ctx, f ? b.then : b.else, s, inner);
    }
  }
}

const allMask = (m: ParsedMap): number => (1 << m.houses.length) - 1;
const startSt = (m: ParsedMap): St => ({ x: m.depot.x, y: m.depot.y, d: DIRS.indexOf(m.startDir), delivered: 0, wrong: 0, steps: 0, fail: null });

/** Run a program once with a trace (spec §6.3 Run / Step). */
export function runProgram(level: LogicLevel, program: Program, opts: RunOptions): RunResult {
  const map = parseMap(level);
  const trace: TraceStep[] = [];
  const delivered: number[] = [];
  const wrongDrops: number[] = [];
  const ctx: Ctx = {
    map,
    flood: opts.flood,
    acc: opts.modelAccuracy ?? 1,
    rng: opts.rng,
    maxSteps: opts.maxSteps ?? DEFAULT_MAX_STEPS,
    trace,
    deliveredOrder: delivered,
    wrongOrder: wrongDrops,
  };
  const s = startSt(map);
  execList(ctx, program, s, { path: [], list: [] });
  let reason: RunReason;
  if (s.fail) reason = s.fail;
  else reason = ((s.delivered | s.wrong) & allMask(map)) === allMask(map) ? 'success' : 'unfinished';
  const res: RunResult = {
    ok: reason === 'success',
    reason,
    delivered,
    wrongDrops,
    aiWrongDrops: wrongDrops.length,
    steps: trace.length,
    trace,
    truck: { x: s.x, y: s.y, dir: DIRS[s.d] as Dir },
    flood: opts.flood,
  };
  if (s.fail) res.failAt = Math.max(0, trace.length - 1);
  return res;
}

/** True when the program succeeds (modelAccuracy 1) for every flood scenario of the level. */
export function succeedsAll(level: LogicLevel, program: Program, maxSteps = DEFAULT_MAX_STEPS): boolean {
  const map = parseMap(level);
  for (const flood of floodScenarios(level)) {
    const ctx: Ctx = { map, flood, acc: 1, rng: undefined, maxSteps, trace: null, deliveredOrder: null, wrongOrder: null };
    const s = startSt(map);
    if (!execList(ctx, program, s, null)) return false;
    if (((s.delivered | s.wrong) & allMask(map)) !== allMask(map)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------
//
// SEARCH: uniform-cost search (cost = blocks) over "joint states", so the first finished program
// popped is a shortest one. A joint state is one truck state (position, facing, served houses) per
// flood scenario: the program is built block by block in reading order and run on EVERY scenario
// at once (modelAccuracy 1). A search "move" is one whole top-level block, containers included.
//   • Prefix pruning: a block — or a partial Repeat body / If branch on its first pass — that fails
//     in any scenario is dropped with everything that would follow it. Execution is sequential, so
//     no completion can recover.
//   • Transposition table: a joint state is expanded once, at its cheapest cost. The same applies
//     inside any list that runs exactly once (the top level and If branches reached from it): only
//     the cheapest branch per distinct outcome is kept. Step counts are not in the key (the 300-step
//     cap only matters for absurd programs).
//   • A Repeat body runs many times, so bodies are enumerated in full (still first-pass pruned).
//     The body is built once, then passes 2..9 are run; a failing pass stops larger n.
//   • An If's then-branch is built on the scenarios whose tile ahead is flooded, the else-branch on
//     the rest. An If that runs once where all scenarios agree is skipped (inlining the taken
//     branch is strictly shorter).
//   • Equivalence pruning that never removes every shortest program: no Left right after Right (or
//     vice versa), no three equal turns in a row, no Repeat whose body is empty or turns only, no
//     Repeat no shorter than its unrolled body (n·|body| ≤ 1+|body|), no If with both branches empty.
//   • Nesting depth ≤ 2: a top-level Repeat/If may hold a Repeat/If whose body is plain blocks.
// Within those bounds the search is exhaustive, so `null` proves "no program ≤ maxBlocks" with the
// palette given, and a result's length is the true minimum.

export interface SolveOptions {
  /** Default: level.blockLimit, else 12. */
  maxBlocks?: number;
  /** One scenario, or 'all' (default) = every flood group must succeed. */
  flood?: FloodGroup | null | 'all';
  /** Override the level palette (e.g. to prove a block is required). */
  palette?: readonly BlockOp[];
  /** Safety valve on expanded nodes; throws when exceeded. Default 5e6. */
  maxNodes?: number;
}

export interface SolveResult {
  program: Program;
  blocks: number;
  nodes: number;
}

const SIMPLE: readonly BlockOp[] = ['forward', 'left', 'right', 'drop', 'askAi'];
const isTurn = (op: BlockOp) => op === 'left' || op === 'right';

interface Seq {
  blocks: Block[];
  out: St[];
  cost: number;
}

export function solve(level: LogicLevel, opts: SolveOptions = {}): SolveResult | null {
  const map = parseMap(level);
  const maxBlocks = opts.maxBlocks ?? level.blockLimit ?? 12;
  const scen = opts.flood === undefined || opts.flood === 'all' ? floodScenarios(level) : [opts.flood];
  const palette = opts.palette ?? level.palette;
  const simple = SIMPLE.filter((o) => palette.includes(o));
  const hasRepeat = palette.includes('repeat');
  const hasIf = palette.includes('ifFlooded');
  const maxNodes = opts.maxNodes ?? 5_000_000;
  const ctxs: Ctx[] = scen.map((flood) => ({
    map,
    flood,
    acc: 1,
    rng: undefined,
    maxSteps: DEFAULT_MAX_STEPS,
    trace: null,
    deliveredOrder: null,
    wrongOrder: null,
  }));
  const full = allMask(map);
  let nodes = 0;
  const key = (j: readonly St[]): string => j.map((s) => `${s.x},${s.y},${s.d},${s.delivered},${s.wrong}`).join('|');
  const done = (j: readonly St[]) => j.every((s) => ((s.delivered | s.wrong) & full) === full);
  const floodedAhead = (ci: number, s: St) => flooded(ctxs[ci] as Ctx, s.x + DX[s.d as 0], s.y + DY[s.d as 0]);

  /** Run a block list on scenarios `idx` (states[k] belongs to idx[k]); null if any fails. */
  const runOn = (list: Program, idx: readonly number[], states: readonly St[]): St[] | null => {
    const out: St[] = [];
    for (let k = 0; k < idx.length; k++) {
      const s = copySt(states[k] as St);
      if (!execList(ctxs[idx[k] as number] as Ctx, list, s, null)) return null;
      out.push(s);
    }
    return out;
  };

  /** Every sequence of cost ≤ budget (empty included) that survives its first pass. */
  const genSeqAll = (idx: readonly number[], states: St[], budget: number, depth: number, cb: (q: Seq) => void): void => {
    const rec = (blocks: Block[], cur: St[], cost: number): void => {
      cb({ blocks, out: cur, cost });
      if (cost < budget) genBlock(idx, cur, budget - cost, depth, false, blocks, (b, out, c) => rec([...blocks, b], out, cost + c));
    };
    rec([], states, 0);
  };

  /**
   * Uniform-cost search over sequences that run once: the cheapest sequence per distinct outcome.
   * `stop` (optional) ends the search early when it returns true for a popped sequence.
   */
  const genSeqBest = (
    idx: readonly number[],
    states: St[],
    budget: number,
    depth: number,
    stop?: (q: Seq) => boolean,
    h?: (out: St[]) => number,
  ): Seq[] => {
    const best = new Map<string, Seq>();
    /** Cheapest cost queued per outcome, so each outcome sits in the queue once per cost. */
    const queued = new Map<string, number>();
    const buckets: Seq[][] = Array.from({ length: budget + 1 }, () => []);
    (buckets[0] as Seq[]).push({ blocks: [], out: states, cost: 0 });
    for (let c = 0; c <= budget; c++)
      for (const q of buckets[c] as Seq[]) {
        const k = key(q.out);
        if (best.has(k)) continue;
        best.set(k, q);
        if (stop?.(q)) return [q];
        if (c < budget)
          genBlock(idx, q.out, budget - c, depth, true, q.blocks, (b, out, bc) => {
            const ok = key(out);
            if (best.has(ok) || (queued.get(ok) ?? Infinity) <= c + bc) return;
            if (h && c + bc + h(out) > budget) return;
            queued.set(ok, c + bc);
            (buckets[c + bc] as Seq[]).push({ blocks: [...q.blocks, b], out, cost: c + bc });
          });
      }
    return [...best.values()];
  };

  /** Every single block of cost ≤ budget after `before` in its list. once = this list runs once. */
  function genBlock(
    idx: readonly number[],
    states: St[],
    budget: number,
    depth: number,
    once: boolean,
    before: readonly Block[],
    cb: (b: Block, out: St[], cost: number) => void,
  ): void {
    if (++nodes > maxNodes) throw new Error(`solve(${level.id}): search exceeded ${maxNodes} nodes`);
    const last = before[before.length - 1]?.op;
    const last2 = before[before.length - 2]?.op;
    for (const op of simple) {
      if (op === 'left' && last === 'right') continue;
      if (op === 'right' && last === 'left') continue;
      if (isTurn(op) && last === op && last2 === op) continue;
      const b = { op } as Block;
      const out = runOn([b], idx, states);
      if (out) cb(b, out, 1);
    }
    if (depth >= 2 || budget < 2) return;
    if (hasRepeat)
      genSeqAll(idx, states, budget - 1, depth + 1, (q) => {
        if (q.blocks.length === 0 || q.blocks.every((x) => isTurn(x.op))) return;
        if (key(q.out) === key(states)) return; // first pass changes nothing: every pass is a no-op
        let cur: St[] | null = q.out;
        for (let n = REPEAT_MIN; n <= REPEAT_MAX; n++) {
          cur = runOn(q.blocks, idx, cur);
          if (!cur) break;
          if (n * q.cost > 1 + q.cost) cb({ op: 'repeat', n, body: q.blocks }, cur, 1 + q.cost);
        }
      });
    if (hasIf) {
      const fIdx: number[] = [];
      const fSt: St[] = [];
      const dIdx: number[] = [];
      const dSt: St[] = [];
      const isF = idx.map((ci, k) => floodedAhead(ci, states[k] as St));
      idx.forEach((ci, k) => {
        if (isF[k]) {
          fIdx.push(ci);
          fSt.push(states[k] as St);
        } else {
          dIdx.push(ci);
          dSt.push(states[k] as St);
        }
      });
      if (once && (fIdx.length === 0 || dIdx.length === 0)) return;
      const branch = (bi: number[], bs: St[]): Seq[] => {
        if (once) return genSeqBest(bi, bs, budget - 1, depth + 1);
        const all: Seq[] = [];
        genSeqAll(bi, bs, budget - 1, depth + 1, (q) => all.push(q));
        return all;
      };
      const elses = branch(dIdx, dSt);
      for (const t of branch(fIdx, fSt))
        for (const e of elses) {
          const c = t.cost + e.cost;
          if (c === 0 || c > budget - 1) continue;
          let fi = 0;
          let di = 0;
          const out = isF.map((f) => (f ? (t.out[fi++] as St) : (e.out[di++] as St)));
          cb({ op: 'ifFlooded', then: t.blocks, else: e.blocks }, out, 1 + c);
        }
    }
  }

  /**
   * Admissible, consistent lower bound on the blocks still needed: 1 if a house is unserved (some
   * drop/askAi block), +1 if in some scenario the truck isn't standing on an unserved house (some
   * forward block). One plain block can't lower it by 2: a drop that serves the last house fails in
   * the scenario whose truck is elsewhere.
   */
  const h = (j: readonly St[]): number => {
    if (done(j)) return 0;
    for (const s of j) {
      const hi = map.houseAt[s.y * map.size + s.x] as number;
      if (hi < 0 || ((s.delivered | s.wrong) & (1 << hi)) !== 0) return 2;
    }
    return 1;
  };
  // Deepening on the block budget keeps container enumeration bounded by what is still affordable.
  const start = scen.map(() => startSt(map));
  const all = scen.map((_, k) => k);
  for (let B = h(start); B <= maxBlocks; B++) {
    const [hit] = genSeqBest(all, start, B, 0, (q) => done(q.out), h).filter((q) => done(q.out));
    if (hit) return { program: hit.blocks, blocks: countBlocks(hit.blocks), nodes };
  }
  return null;
}


// ---------------------------------------------------------------------------
// Debug It (L4): fewest block swaps that fix the prebuilt program
// ---------------------------------------------------------------------------

/** All programs one swap away: a block's op → another palette op (as program.ts swapOp), or a Repeat's n. */
export function oneSwapVariants(program: Program, palette: readonly BlockOp[]): Program[] {
  const out: Program[] = [];
  const walk = (list: Program, rebuild: (l: Program) => Program): void => {
    list.forEach((b, i) => {
      const put = (nb: Block) => {
        const l = [...list];
        l[i] = nb;
        out.push(rebuild(l));
      };
      for (const op of palette) {
        if (op === b.op) continue;
        if (op === 'repeat') put({ op, n: 3, body: [] });
        else if (op === 'ifFlooded') put({ op, then: [], else: [] });
        else put({ op });
      }
      if (b.op === 'repeat') {
        for (let n = REPEAT_MIN; n <= REPEAT_MAX; n++) if (n !== b.n) put({ ...b, n });
        walk(b.body, (body) => {
          const l = [...list];
          l[i] = { ...b, body };
          return rebuild(l);
        });
      } else if (b.op === 'ifFlooded') {
        walk(b.then, (then) => {
          const l = [...list];
          l[i] = { ...b, then };
          return rebuild(l);
        });
        walk(b.else, (els) => {
          const l = [...list];
          l[i] = { ...b, else: els };
          return rebuild(l);
        });
      }
    });
  };
  walk(program, (l) => l);
  return out;
}

/**
 * Fewest swaps (≤ limit, default 3) that make `level.prebuilt` succeed on every flood scenario;
 * 0 if it already works; null if not fixable within the limit. Breadth-first over swap counts.
 */
export function minSwapsToFix(level: LogicLevel, limit = 3): { swaps: number; program: Program } | null {
  const pre = level.prebuilt;
  if (!pre) return null;
  if (succeedsAll(level, pre)) return { swaps: 0, program: pre };
  let frontier: Program[] = [pre];
  const seen = new Set<string>([JSON.stringify(pre)]);
  for (let k = 1; k <= limit; k++) {
    const next: Program[] = [];
    for (const p of frontier)
      for (const v of oneSwapVariants(p, level.palette)) {
        const s = JSON.stringify(v);
        if (seen.has(s)) continue;
        seen.add(s);
        if (succeedsAll(level, v)) return { swaps: k, program: v };
        next.push(v);
      }
    frontier = next;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reality Check robustness (§6.4 "100 mini-maps")
// ---------------------------------------------------------------------------

export interface Robustness {
  passed: number;
  failed: number;
  /** Per mini-map pass/fail, in order (for the tile animation). */
  results: boolean[];
}

/**
 * Runs the program on `maps` seeded variants: each picks a random flood group and (askAi levels)
 * rolls the AI with modelAccuracy. A map passes when the run succeeds with no wrong AI drop.
 */
export function robustness(level: LogicLevel, program: Program, maps: number, rng: Rng, modelAccuracy = 1): Robustness {
  const map = parseMap(level);
  const full = allMask(map);
  const results: boolean[] = [];
  let passed = 0;
  for (let i = 0; i < maps; i++) {
    const flood = pickFlood(level, rng);
    const ctx: Ctx = { map, flood, acc: modelAccuracy, rng, maxSteps: DEFAULT_MAX_STEPS, trace: null, deliveredOrder: null, wrongOrder: null };
    const s = startSt(map);
    const ok = execList(ctx, program, s, null) && s.wrong === 0 && (s.delivered & full) === full;
    results.push(ok);
    if (ok) passed++;
  }
  return { passed, failed: maps - passed, results };
}
