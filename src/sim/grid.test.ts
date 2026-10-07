import { describe, expect, it } from 'vitest';
import type { LogicLevel, Program } from '../content/stage3Schema';
import { mulberry32 } from '../stages/data/logic';
import {
  blockAt,
  countBlocks,
  minSwapsToFix,
  parseMap,
  pickFlood,
  robustness,
  runProgram,
  solve,
  succeedsAll,
} from './grid';

const lvl = (over: Partial<LogicLevel> & Pick<LogicLevel, 'grid'>): LogicLevel => ({
  id: 'logic-l1',
  startDir: 'E',
  seconds: null,
  blockLimit: 8,
  par: 1,
  palette: ['forward', 'left', 'right', 'drop'],
  floodGroups: [],
  solution: [],
  ...over,
});

const F = { op: 'forward' } as const;
const L = { op: 'left' } as const;
const R = { op: 'right' } as const;
const DROP = { op: 'drop' } as const;
const AI = { op: 'askAi' } as const;
const rep = (n: number, ...body: Program) => ({ op: 'repeat' as const, n, body });
const iff = (then: Program, els: Program) => ({ op: 'ifFlooded' as const, then, else: els });

// Depot at (0,0) facing east, one house 2 tiles east.
const line = lvl({ grid: ['D#H...', '......', '......', '......', '......', '......'] });

// Two roads to the house at (3,0): top via 'a', bottom via 'b'. Exactly one floods per run.
const fork = lvl({
  id: 'logic-l3',
  grid: ['Da#H..', 'b###..', '......', '......', '......', '......'],
  floodGroups: ['a', 'b'],
  palette: ['forward', 'left', 'right', 'drop', 'ifFlooded'],
  blockLimit: 14,
});
const forkSolution: Program = [iff([R, F, L, F, F, F, L, F], [F, F, F]), DROP];

// AI level: a water house then a plain house.
const ai = lvl({ id: 'logic-l5', grid: ['DW#H..', '......', '......', '......', '......', '......'], palette: ['forward', 'drop', 'askAi'] });

describe('parseMap / pickFlood / countBlocks', () => {
  it('parses depot, houses and flood tiles', () => {
    const m = parseMap(fork);
    expect(m.size).toBe(6);
    expect(m.depot).toEqual({ x: 0, y: 0 });
    expect(m.houses).toEqual([{ x: 3, y: 0, need: 'any' }]);
    expect(m.floodTiles.a).toEqual([{ x: 1, y: 0 }]);
    expect(m.floodTiles.b).toEqual([{ x: 0, y: 1 }]);
    expect(parseMap(ai).houses.map((h) => h.need)).toEqual(['W', 'any']);
  });

  it('pickFlood picks one listed group, seeded; null without groups', () => {
    const a = Array.from({ length: 50 }, ((r) => () => pickFlood(fork, r))(mulberry32(7)));
    const b = Array.from({ length: 50 }, ((r) => () => pickFlood(fork, r))(mulberry32(7)));
    expect(a).toEqual(b);
    expect(new Set(a)).toEqual(new Set(['a', 'b']));
    expect(pickFlood(line, mulberry32(1))).toBeNull();
  });

  it('counts every block, containers included', () => {
    expect(countBlocks([])).toBe(0);
    expect(countBlocks([rep(3, F)])).toBe(2);
    expect(countBlocks(forkSolution)).toBe(14);
    expect(countBlocks([rep(2, iff([F], []), rep(2, L))])).toBe(5);
  });
});

describe('runProgram semantics', () => {
  it('success: drives and delivers', () => {
    const r = runProgram(line, [F, F, DROP], { flood: null });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('success');
    expect(r.delivered).toEqual([0]);
    expect(r.trace.map((s) => s.event)).toEqual(['move', 'move', 'deliver']);
    expect(r.truck).toEqual({ x: 2, y: 0, dir: 'E' });
    expect(r.steps).toBe(3);
  });

  it('crash: grass or off the map', () => {
    const r = runProgram(line, [F, F, F], { flood: null });
    expect(r.reason).toBe('crash');
    expect(r.failAt).toBe(2);
    expect(r.trace[2]).toMatchObject({ event: 'fail', fail: 'crash', target: { x: 3, y: 0 }, truck: { x: 2, y: 0 } });
    expect(runProgram(line, [L, F], { flood: null }).reason).toBe('crash'); // north off the map
  });

  it('stuck: driving into the flooded group; dry groups are road', () => {
    expect(runProgram(fork, [F], { flood: 'a' }).reason).toBe('stuck');
    expect(runProgram(fork, [F, F, F, DROP], { flood: 'b' }).ok).toBe(true);
    expect(runProgram(lvl({ grid: ['D~H...', '......', '......', '......', '......', '......'] }), [F], { flood: null }).reason).toBe('stuck');
  });

  it('noHouse: drop on road, or on a house already served', () => {
    expect(runProgram(line, [DROP], { flood: null }).reason).toBe('noHouse');
    expect(runProgram(line, [F, F, DROP, DROP], { flood: null }).reason).toBe('noHouse');
    expect(runProgram(line, [AI], { flood: null }).reason).toBe('noHouse');
  });

  it('wrongSupply: plain drop on a W/F/M house', () => {
    const r = runProgram(ai, [F, DROP], { flood: null });
    expect(r.reason).toBe('wrongSupply');
    expect(r.trace[1]).toMatchObject({ fail: 'wrongSupply', house: 0, need: 'W' });
  });

  it('unfinished: program ends with houses left', () => {
    const r = runProgram(line, [F], { flood: null });
    expect(r.reason).toBe('unfinished');
    expect(r.ok).toBe(false);
    expect(r.failAt).toBeUndefined();
  });

  it('ifFlooded takes both branches with a check step', () => {
    for (const flood of ['a', 'b'] as const) {
      const r = runProgram(fork, forkSolution, { flood });
      expect(r.ok).toBe(true);
      expect(r.trace[0]).toMatchObject({ event: 'check', op: 'ifFlooded', flooded: flood === 'a', branch: flood === 'a' ? 'then' : 'else', path: [0] });
      expect(r.trace[1]!.path).toEqual([0, flood === 'a' ? 0 : 1, 0]);
      expect(r.trace[1]!.addr).toEqual({ list: [0, flood === 'a' ? 'then' : 'else'], index: 0 });
    }
    expect(succeedsAll(fork, forkSolution)).toBe(true);
    expect(succeedsAll(fork, [F, F, F, DROP])).toBe(false);
  });

  it('repeat emits a loop step per iteration; nested repeat works', () => {
    const r = runProgram(line, [rep(2, F), DROP], { flood: null });
    expect(r.ok).toBe(true);
    expect(r.trace.map((s) => s.event)).toEqual(['loop', 'move', 'loop', 'move', 'deliver']);
    expect(r.trace[1]).toMatchObject({ path: [0, 0], addr: { list: [0, 'body'], index: 0 } });
    expect(r.trace[2]).toMatchObject({ iteration: 2, of: 2 });
    const long = lvl({ grid: ['D###H.', '......', '......', '......', '......', '......'] });
    const n = runProgram(long, [rep(2, rep(2, F)), DROP], { flood: null });
    expect(n.ok).toBe(true);
    expect(n.trace.filter((s) => s.event === 'move').map((s) => s.path)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    expect(blockAt([rep(2, rep(2, F)), DROP], [0, 0, 0])).toEqual(F);
    expect(blockAt(forkSolution, [0, 0, 3])).toEqual(F);
    expect(blockAt(forkSolution, [0, 1, 2])).toEqual(F);
    expect(blockAt(forkSolution, [1])).toEqual(DROP);
    expect(blockAt(forkSolution, [5])).toBeUndefined();
  });

  it('askAi: accuracy 1 always right, 0 always a wrong drop that still counts the house', () => {
    const prog: Program = [F, AI, F, F, AI];
    const good = runProgram(ai, prog, { flood: null, modelAccuracy: 1 });
    expect(good.ok).toBe(true);
    expect(good.aiWrongDrops).toBe(0);
    expect(good.delivered).toEqual([0, 1]);
    const bad = runProgram(ai, prog, { flood: null, modelAccuracy: 0, rng: mulberry32(1) });
    expect(bad.ok).toBe(true);
    expect(bad.aiWrongDrops).toBe(1);
    expect(bad.wrongDrops).toEqual([0]);
    expect(bad.delivered).toEqual([1]); // plain house: askAi delivers normally
    expect(bad.trace[1]).toMatchObject({ event: 'aiWrongDrop', need: 'W' });
    expect(bad.trace[1]!.gave).not.toBe('W');
  });

  it('step cap → tooLong', () => {
    const r = runProgram(line, [rep(9, L)], { flood: null, maxSteps: 10 });
    expect(r.reason).toBe('tooLong');
    expect(r.steps).toBeLessThanOrEqual(10);
    expect(runProgram(line, [rep(9, rep(9, L, L, L, L))], { flood: null }).reason).toBe('tooLong');
  });

  it('is deterministic for a seed', () => {
    const run = (seed: number) => runProgram(ai, [F, AI, F, F, AI], { flood: null, modelAccuracy: 0.5, rng: mulberry32(seed) });
    expect(run(42)).toEqual(run(42));
  });
});

describe('solve', () => {
  it('finds a shortest straight program', () => {
    const s = solve(line);
    expect(s?.blocks).toBe(3);
    expect(s && runProgram(line, s.program, { flood: null }).ok).toBe(true);
  });

  it('uses repeat when it is shorter', () => {
    const long = lvl({ grid: ['D####H', '......', '......', '......', '......', '......'], palette: ['forward', 'drop', 'repeat'] });
    const s = solve(long);
    expect(s?.blocks).toBe(3); // Repeat ×5 { Move }, Drop
    expect(s!.program[0]).toMatchObject({ op: 'repeat', n: 5 });
    expect(solve(long, { palette: ['forward', 'drop'], maxBlocks: 5 })).toBeNull();
  });

  it('needs ifFlooded when flooding is random, and proves it', () => {
    const s = solve(fork);
    expect(s).not.toBeNull();
    expect(succeedsAll(fork, s!.program)).toBe(true);
    expect(s!.blocks).toBeLessThanOrEqual(countBlocks(forkSolution));
    expect(s!.program.some((b) => b.op === 'ifFlooded')).toBe(true);
    expect(solve(fork, { palette: ['forward', 'left', 'right', 'drop'] })).toBeNull();
    expect(solve(fork, { flood: 'b' })?.blocks).toBe(4);
  });

  it('respects maxBlocks', () => {
    expect(solve(line, { maxBlocks: 2 })).toBeNull();
  });
});

describe('minSwapsToFix', () => {
  it('finds the fewest swaps', () => {
    const broken = lvl({ id: 'logic-l4', grid: line.grid, prebuilt: [F, L, DROP], maxEdits: 1 });
    expect(minSwapsToFix(broken)?.swaps).toBe(1);
    const two = lvl({ id: 'logic-l4', grid: line.grid, prebuilt: [L, L, DROP], maxEdits: 2 });
    expect(minSwapsToFix(two)?.swaps).toBe(2);
    expect(minSwapsToFix(two, 1)).toBeNull();
    const ok = lvl({ id: 'logic-l4', grid: line.grid, prebuilt: [F, F, DROP], maxEdits: 1 });
    expect(minSwapsToFix(ok)?.swaps).toBe(0);
  });
});

describe('robustness', () => {
  it('a robust program passes every map; a fixed route fails some', () => {
    expect(robustness(fork, forkSolution, 100, mulberry32(3)).passed).toBe(100);
    const fragile = robustness(fork, [F, F, F, DROP], 100, mulberry32(3));
    expect(fragile.failed).toBeGreaterThan(0);
    expect(fragile.passed).toBeGreaterThan(0);
    expect(fragile.results).toHaveLength(100);
    expect(robustness(fork, [F, F, F, DROP], 100, mulberry32(3))).toEqual(fragile);
  });

  it('AI rolls make low accuracy fail some maps', () => {
    const prog: Program = [F, AI, F, F, AI];
    expect(robustness(ai, prog, 100, mulberry32(9), 1).passed).toBe(100);
    const low = robustness(ai, prog, 100, mulberry32(9), 0.6);
    expect(low.failed).toBeGreaterThan(10);
    expect(low.passed).toBeGreaterThan(30);
  });
});
