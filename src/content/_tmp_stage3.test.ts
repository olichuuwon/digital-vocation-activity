import json from './stage3.json';
import { stage3FileSchema } from './stage3Schema';
import { countBlocks, floodScenarios, minSwapsToFix, runProgram, solve, succeedsAll, robustness } from '../sim/grid';

const s = stage3FileSchema.parse(json);
describe('tmp stage3', () => {
  for (const l of s.levels) {
    it(l.id, () => {
      for (const f of floodScenarios(l)) {
        const r = runProgram(l, l.solution, { flood: f });
        expect(r.reason, `${l.id} ${f}`).toBe('success');
      }
      const n = countBlocks(l.solution);
      if (l.blockLimit) expect(n).toBeLessThanOrEqual(l.blockLimit);
      const sol = solve(l, { maxBlocks: (l.blockLimit ?? 9) });
      console.log(l.id, 'solution', n, 'solver', sol?.blocks, 'par', l.par, 'nodes', sol?.nodes, JSON.stringify(sol?.program));
      expect(sol?.blocks).toBe(l.par);
      if (l.id === 'logic-l2') expect(solve(l, { maxBlocks: 5, palette: ['forward', 'left', 'right', 'drop'] })).toBeNull();
      if (l.id === 'logic-l3') {
        expect(solve(l, { maxBlocks: 12, palette: ['forward', 'left', 'right', 'drop', 'repeat'] })).toBeNull();
        expect(solve(l, { maxBlocks: 7 })).toBeNull();
        // a fixed route works in one world only
        expect(succeedsAll(l, [{ op: 'forward' }, { op: 'right' }, { op: 'forward' }, { op: 'drop' }])).toBe(false);
        expect(runProgram(l, [{ op: 'forward' }, { op: 'right' }, { op: 'forward' }, { op: 'drop' }], { flood: 'b' }).ok).toBe(true);
        const nine = [{ op: 'ifFlooded', then: [{ op: 'right' }, { op: 'forward' }, { op: 'left' }, { op: 'forward' }], else: [{ op: 'forward' }, { op: 'right' }, { op: 'forward' }] }, { op: 'drop' }] as const;
        expect(succeedsAll(l, nine as never)).toBe(true);
        expect(countBlocks(nine as never)).toBe(9);
        const rb = robustness(l, l.solution, 100, () => Math.random(), 1);
        expect(rb.passed).toBe(100);
      }
      if (l.id === 'logic-l1') {
        // H2 first is impossible within 8: solve with H1 treated as road
        const alt = { ...l, grid: l.grid.map((r) => r.replace('HD', '#D')) };
        const toH2 = solve(alt as never, { maxBlocks: 8 });
        console.log('l1 H2-only min', toH2?.blocks, JSON.stringify(toH2?.program));
      }
      if (l.id === 'logic-l4') {
        expect(succeedsAll(l, l.prebuilt!)).toBe(false);
        console.log('l4 prebuilt blocks', countBlocks(l.prebuilt!), 'minSwaps', JSON.stringify(minSwapsToFix(l, 3)));
        const r = runProgram(l, l.prebuilt!, { flood: null });
        console.log('l4 prebuilt fails', r.reason, JSON.stringify(r.truck));
      }
      if (l.id === 'logic-l5') {
        expect(solve(l, { maxBlocks: 8, palette: ['forward', 'left', 'right', 'repeat', 'drop'] })).toBeNull();
        let seed = 1;
        const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        console.log('l5 at acc 0.7', JSON.stringify(robustness(l, l.solution, 100, rng, 0.7).passed));
      }
    }, 120000);
  }
});
