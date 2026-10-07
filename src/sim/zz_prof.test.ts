import { it } from 'vitest';
import type { LogicLevel } from '../content/stage3Schema';
import { solve } from './grid';
const lvl = (o: Partial<LogicLevel>): LogicLevel =>
  ({ id: 'logic-l1', startDir: 'E', seconds: null, blockLimit: 8, par: 1, palette: ['forward', 'left', 'right', 'drop'], floodGroups: [], solution: [], ...o }) as LogicLevel;
const fork = lvl({ id: 'logic-l3', grid: ['Da#H..', 'b###..', '......', '......', '......', '......'], floodGroups: ['a', 'b'], palette: ['forward', 'left', 'right', 'drop', 'ifFlooded'], blockLimit: 14 });
it('prof', () => {
  for (const mb of [8, 9, 10, 11, 12, 13, 14]) {
    const t = Date.now();
    const r = solve(fork, { maxBlocks: mb, maxNodes: 2e7 });
    console.log(mb, r?.blocks, r?.nodes, Date.now() - t);
    if (r) break;
  }
}, 300000);
