// Spec §11: every Stage 3 puzzle has an automated solver test proving it is solvable within its
// block limit, plus the level-specific "this concept is required" checks from §6.3.
import { describe, expect, it } from 'vitest';
import stage3Json from '../content/stage3.json';
import { stage3FileSchema, type Block, type BlockOp, type LogicLevel, type Program } from '../content/stage3Schema';
import { mulberry32 } from '../stages/data/logic';
import { countBlocks, floodScenarios, minSwapsToFix, robustness, runProgram, solve, succeedsAll } from './grid';

const content = stage3FileSchema.parse(stage3Json);
const level = (id: LogicLevel['id']): LogicLevel => content.levels.find((l) => l.id === id) as LogicLevel;
/** Search bound: the block limit, or the known solution's size for unlimited levels. */
const bound = (l: LogicLevel): number => l.blockLimit ?? countBlocks(l.solution);
const without = (l: LogicLevel, op: BlockOp): BlockOp[] => l.palette.filter((o) => o !== op);
const mapOps = (p: Program, f: (b: Block) => Block): Program =>
  p.map((b) => {
    if (b.op === 'repeat') return { ...b, body: mapOps(b.body, f) };
    if (b.op === 'ifFlooded') return { ...b, then: mapOps(b.then, f), else: mapOps(b.else, f) };
    return f(b);
  });

describe('stage3.json levels are solvable', () => {
  it('has every level id once', () => {
    expect(new Set(content.levels.map((l) => l.id)).size).toBe(6);
  });

  for (const l of content.levels) {
    describe(l.id, () => {
      it('solution succeeds on every flood group and fits the block limit', () => {
        for (const flood of floodScenarios(l)) expect(runProgram(l, l.solution, { flood }).reason, `flood ${flood}`).toBe('success');
        if (l.blockLimit !== null) expect(countBlocks(l.solution)).toBeLessThanOrEqual(l.blockLimit);
        expect(robustness(l, l.solution, content.testMaps, mulberry32(1)).failed).toBe(0);
      });

      it('solver: shortest program fits the limit and its length is par', () => {
        const s = solve(l, { maxBlocks: bound(l) });
        expect(s, 'no program within the bound').not.toBeNull();
        expect(succeedsAll(l, s!.program)).toBe(true);
        expect(s!.blocks).toBeLessThanOrEqual(bound(l));
        expect(s!.blocks, `par ${l.par}, solver found ${JSON.stringify(s!.program)}`).toBe(l.par);
      });
    });
  }
});

describe('stage3.json concept checks (§6.3)', () => {
  it('logic-l2: Repeat is required within the block limit', () => {
    const l = level('logic-l2');
    expect(l.palette).toContain('repeat');
    expect(solve(l, { maxBlocks: bound(l), palette: without(l, 'repeat') })).toBeNull();
  });

  it('logic-l3: If flooded is required (no fixed route works on every flood group)', () => {
    const l = level('logic-l3');
    expect(l.floodGroups.length).toBeGreaterThanOrEqual(2);
    expect(l.palette).toContain('ifFlooded');
    expect(solve(l, { maxBlocks: bound(l), palette: without(l, 'ifFlooded') })).toBeNull();
    // ...while each flood group alone is solvable without If.
    for (const flood of l.floodGroups) expect(solve(l, { flood, palette: without(l, 'ifFlooded') }), `flood ${flood}`).not.toBeNull();
  });

  it('logic-l4: prebuilt fails and is fixable within maxEdits swaps', () => {
    const l = level('logic-l4');
    expect(succeedsAll(l, l.prebuilt!)).toBe(false);
    const fix = minSwapsToFix(l, l.maxEdits);
    expect(fix, 'not fixable within maxEdits').not.toBeNull();
    expect(fix!.swaps).toBeGreaterThanOrEqual(1);
    expect(fix!.swaps).toBeLessThanOrEqual(l.maxEdits!);
    expect(countBlocks(l.solution)).toBe(countBlocks(l.prebuilt!));
  });

  it('logic-l5: plain Drop cannot succeed, Ask the AI is needed', () => {
    const l = level('logic-l5');
    expect(l.palette).toContain('askAi');
    expect(/[WFM]/.test(l.grid.join(''))).toBe(true);
    const plain = mapOps(l.solution, (b) => (b.op === 'askAi' ? { op: 'drop' } : b));
    expect(runProgram(l, plain, { flood: null }).reason).toBe('wrongSupply');
    const noAi = [...without(l, 'askAi'), ...(l.palette.includes('drop') ? [] : (['drop'] as BlockOp[]))];
    expect(solve(l, { maxBlocks: bound(l), palette: noAi })).toBeNull();
    // A weak model makes some wrong drops (§3.2: modelAccuracy < 0.8 shows mis-routed trucks).
    const weak = robustness(l, l.solution, content.testMaps, mulberry32(5), 0.6);
    expect(weak.failed).toBeGreaterThan(0);
  });
});
