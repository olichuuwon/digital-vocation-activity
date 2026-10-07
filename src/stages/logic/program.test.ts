import type { Program } from '../../content/stage3Schema';
import {
  blocksChanged,
  childList,
  flatten,
  getBlock,
  insertAt,
  isInside,
  moveBy,
  newBlock,
  removeAt,
  ROOT_CURSOR,
  sameAddr,
  setRepeat,
  swapOp,
} from './program';

const F = { op: 'forward' } as const;
const L = { op: 'left' } as const;
const R = { op: 'right' } as const;

describe('program edits', () => {
  it('inserts at the root cursor and inside containers without mutating the original', () => {
    const p0: Program = [];
    const p1 = insertAt(p0, ROOT_CURSOR(p0), newBlock('repeat'));
    expect(p0).toEqual([]);
    const p2 = insertAt(p1, { list: childList({ list: [], index: 0 }, 'body'), index: 0 }, F);
    expect(p2).toEqual([{ op: 'repeat', n: 2, body: [F] }]);
    const p3 = insertAt(p2, ROOT_CURSOR(p2), newBlock('ifFlooded'));
    const p4 = insertAt(p3, { list: [1, 'else'], index: 0 }, L);
    expect(p4[1]).toEqual({ op: 'ifFlooded', then: [], else: [L] });
    expect(p3[1]).toEqual({ op: 'ifFlooded', then: [], else: [] });
  });

  it('removes, moves and clamps', () => {
    const p: Program = [F, L, R];
    expect(removeAt(p, { list: [], index: 1 })).toEqual([F, R]);
    const m = moveBy(p, { list: [], index: 0 }, 1);
    expect(m.program).toEqual([L, F, R]);
    expect(m.addr.index).toBe(1);
    expect(moveBy(p, { list: [], index: 0 }, -1).program).toBe(p);
  });

  it('sets repeat counts within 2–9 and swaps ops', () => {
    const p: Program = [{ op: 'repeat', n: 3, body: [F] }, L];
    expect(setRepeat(p, { list: [], index: 0 }, 12)[0]).toEqual({ op: 'repeat', n: 9, body: [F] });
    expect(setRepeat(p, { list: [], index: 0 }, 0)[0]).toEqual({ op: 'repeat', n: 2, body: [F] });
    expect(swapOp(p, { list: [], index: 1 }, 'right')[1]).toEqual(R);
    expect(swapOp(p, { list: [], index: 0 }, 'repeat')[0]).toBe(p[0]);
  });

  it('flattens nested programs in reading order with depths and end markers', () => {
    const p: Program = [{ op: 'repeat', n: 2, body: [F, { op: 'ifFlooded', then: [L], else: [R] }] }, F];
    const rows = flatten(p).map((r) => `${r.kind}:${r.depth}:${r.block?.op ?? r.field ?? ''}`);
    expect(rows).toEqual([
      'block:0:repeat',
      'block:1:forward',
      'block:1:ifFlooded',
      'block:2:left',
      'end:2:',
      'label:1:else',
      'block:2:right',
      'end:2:',
      'end:1:',
      'block:0:forward',
    ]);
    expect(getBlock(p, { list: [0, 'body', 1, 'else'], index: 0 })).toEqual(R);
  });

  it('address helpers', () => {
    expect(sameAddr({ list: [0, 'body'], index: 1 }, { list: [0, 'body'], index: 1 })).toBe(true);
    expect(sameAddr({ list: [0, 'body'], index: 1 }, { list: [0, 'then'], index: 1 })).toBe(false);
    expect(isInside([0, 'body'], { list: [], index: 0 })).toBe(true);
    expect(isInside([1, 'body'], { list: [], index: 0 })).toBe(false);
  });
});

describe('blocksChanged (Debug It swaps)', () => {
  it('counts differing blocks, and undoing a swap gives it back', () => {
    const p: Program = [F, { op: 'repeat', n: 2, body: [F] }, L];
    expect(blocksChanged(p, p)).toBe(0);
    const one = swapOp(p, { list: [], index: 2 }, 'right');
    expect(blocksChanged(p, one)).toBe(1);
    expect(blocksChanged(p, swapOp(one, { list: [], index: 2 }, 'left'))).toBe(0);
    expect(blocksChanged(p, setRepeat(p, { list: [], index: 1 }, 3))).toBe(1);
  });
});
