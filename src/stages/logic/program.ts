// Pure edits on a Stage 3 block program (nested lists). The editor UI only calls these.
import { REPEAT_MAX, REPEAT_MIN, type Block, type BlockOp, type Program } from '../../content/stage3Schema';

/** A container field inside a block. */
export type Field = 'body' | 'then' | 'else';
/**
 * Address of a block list: [] is the top level; [2, 'body'] is the body of the block at index 2;
 * [2, 'then', 0, 'body'] goes one level deeper.
 */
export type ListPath = readonly (number | Field)[];
/** Where new blocks go: a list and the index to insert at. */
export interface Cursor {
  list: ListPath;
  index: number;
}
/** A block's address: its list and index. */
export interface BlockAddr {
  list: ListPath;
  index: number;
}

export const ROOT_CURSOR = (program: Program): Cursor => ({ list: [], index: program.length });

export function newBlock(op: BlockOp, repeatN = 3): Block {
  if (op === 'repeat') return { op, n: repeatN, body: [] };
  if (op === 'ifFlooded') return { op, then: [], else: [] };
  return { op };
}

export function getList(program: Program, list: ListPath): Block[] | undefined {
  let cur: Block[] = program;
  for (let i = 0; i < list.length; i += 2) {
    const b = cur[list[i] as number];
    const f = list[i + 1] as Field;
    if (!b) return undefined;
    if (b.op === 'repeat' && f === 'body') cur = b.body;
    else if (b.op === 'ifFlooded' && (f === 'then' || f === 'else')) cur = b[f];
    else return undefined;
  }
  return cur;
}

export function getBlock(program: Program, addr: BlockAddr): Block | undefined {
  return getList(program, addr.list)?.[addr.index];
}

/** Copy-on-write update of the list at `list`. Unknown paths leave the program unchanged. */
function updateList(program: Program, list: ListPath, fn: (l: Block[]) => Block[]): Program {
  if (list.length === 0) return fn([...program]);
  const [i, f, ...rest] = list as [number, Field, ...(number | Field)[]];
  const b = program[i];
  if (!b) return program;
  let nb: Block;
  if (b.op === 'repeat' && f === 'body') nb = { ...b, body: updateList(b.body, rest, fn) };
  else if (b.op === 'ifFlooded' && (f === 'then' || f === 'else')) nb = { ...b, [f]: updateList(b[f], rest, fn) };
  else return program;
  const out = [...program];
  out[i] = nb;
  return out;
}

export function insertAt(program: Program, cursor: Cursor, block: Block): Program {
  return updateList(program, cursor.list, (l) => {
    const at = Math.max(0, Math.min(cursor.index, l.length));
    l.splice(at, 0, block);
    return l;
  });
}

export function removeAt(program: Program, addr: BlockAddr): Program {
  return updateList(program, addr.list, (l) => {
    l.splice(addr.index, 1);
    return l;
  });
}

/** Move a block up (-1) or down (+1) within its list. Returns the new address. */
export function moveBy(program: Program, addr: BlockAddr, delta: -1 | 1): { program: Program; addr: BlockAddr } {
  const l = getList(program, addr.list);
  const to = addr.index + delta;
  if (!l || to < 0 || to >= l.length) return { program, addr };
  const next = updateList(program, addr.list, (xs) => {
    const [b] = xs.splice(addr.index, 1);
    xs.splice(to, 0, b!);
    return xs;
  });
  return { program: next, addr: { list: addr.list, index: to } };
}

export function replaceAt(program: Program, addr: BlockAddr, fn: (b: Block) => Block): Program {
  return updateList(program, addr.list, (l) => {
    const b = l[addr.index];
    if (b) l[addr.index] = fn(b);
    return l;
  });
}

export function setRepeat(program: Program, addr: BlockAddr, n: number): Program {
  const clamped = Math.max(REPEAT_MIN, Math.min(REPEAT_MAX, Math.round(n)));
  return replaceAt(program, addr, (b) => (b.op === 'repeat' ? { ...b, n: clamped } : b));
}

/**
 * Debug It swap: give the block a new op, keeping what it can (a Repeat keeps its body when it
 * stays a Repeat; a simple block turning into a Repeat gets an empty body).
 */
export function swapOp(program: Program, addr: BlockAddr, op: BlockOp): Program {
  return replaceAt(program, addr, (b) => (b.op === op ? b : newBlock(op)));
}

/** Address equality (for selection). */
export function sameAddr(a: BlockAddr | null | undefined, b: BlockAddr | null | undefined): boolean {
  if (!a || !b) return false;
  return a.index === b.index && a.list.length === b.list.length && a.list.every((x, i) => x === b.list[i]);
}

/** The list path of a container field of the block at `addr`. */
export function childList(addr: BlockAddr, field: Field): ListPath {
  return [...addr.list, addr.index, field];
}

/** Whether `list` is `addr` itself or sits inside it (removing addr would orphan the cursor). */
export function isInside(list: ListPath, addr: BlockAddr): boolean {
  const own = [...addr.list, addr.index];
  if (list.length < own.length) return false;
  return own.every((x, i) => list[i] === x);
}

/** Blocks in reading order with depth and address, for rendering a nested list flat. */
export interface FlatRow {
  kind: 'block' | 'label' | 'end';
  depth: number;
  addr: BlockAddr;
  block?: Block;
  /** For 'label' rows: which field starts here (an If's "otherwise"). */
  field?: Field;
  /** The list this row ends (for 'end' rows): an "add here" target at the end of a container. */
  list?: ListPath;
}

export function flatten(program: Program, list: ListPath = [], depth = 0, out: FlatRow[] = []): FlatRow[] {
  const blocks = getList(program, list) ?? [];
  blocks.forEach((block, index) => {
    const addr = { list, index };
    out.push({ kind: 'block', depth, addr, block });
    if (block.op === 'repeat') {
      flatten(program, childList(addr, 'body'), depth + 1, out);
      out.push({ kind: 'end', depth: depth + 1, addr, list: childList(addr, 'body') });
    } else if (block.op === 'ifFlooded') {
      flatten(program, childList(addr, 'then'), depth + 1, out);
      out.push({ kind: 'end', depth: depth + 1, addr, list: childList(addr, 'then') });
      out.push({ kind: 'label', depth, addr, field: 'else' });
      flatten(program, childList(addr, 'else'), depth + 1, out);
      out.push({ kind: 'end', depth: depth + 1, addr, list: childList(addr, 'else') });
    }
  });
  return out;
}

/** Every block counts 1, containers included (contract in stage3Schema.ts). */
export { countBlocks as blockCount } from '../../sim/grid';
