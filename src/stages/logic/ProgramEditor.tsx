import { useState } from 'react';
import { fill } from '../../content';
import type { Block, BlockOp, Program } from '../../content/stage3Schema';
import { toast } from '../../components/toastStore';
import { c } from './content';
import {
  blockCount,
  childList,
  flatten,
  getBlock,
  getList,
  insertAt,
  isInside,
  moveBy,
  newBlock,
  removeAt,
  sameAddr,
  setRepeat,
  swapOp,
  type BlockAddr,
  type Cursor,
  type ListPath,
} from './program';
import s from './logic.module.css';

export const ICON: Record<BlockOp, string> = {
  forward: '⬆️',
  left: '↰',
  right: '↱',
  drop: '📦',
  repeat: '🔁',
  ifFlooded: '🌊',
  askAi: '🤖',
};

export function blockText(b: Block): string {
  if (b.op === 'repeat') return `${c.blocks.repeat} ${fill(c.editor.times, { n: b.n })}`;
  return c.blocks[b.op];
}

const sameList = (a: ListPath, b: ListPath) => a.length === b.length && a.every((x, i) => x === b[i]);

function cursorLabel(program: Program, cur: Cursor): string {
  if (cur.list.length === 0) return c.editor.addHere;
  const owner = getBlock(program, { list: cur.list.slice(0, -2), index: cur.list[cur.list.length - 2] as number });
  const field = cur.list[cur.list.length - 1];
  if (owner?.op === 'repeat') return c.editor.insideRepeat;
  return field === 'else' ? c.editor.insideElse : c.editor.insideThen;
}

/**
 * Tap-to-add block editor (§6.3: tap-to-add and tap-to-remove required, one-handed at 360px).
 * - Tap a palette block: it's added at the "add here" spot (or after the selected block).
 * - Tap a program block: select it, then Move up / Move down / Remove / More or fewer times.
 * - Tap an "Add blocks here" slot to add inside a Repeat or If.
 * Debug It (`swap`): tap a block, then a palette block to swap it in (limited swaps).
 */
export function ProgramEditor({
  program,
  onChange,
  palette,
  blockLimit,
  locked,
  activeAddr,
  failedAddr,
  swap,
}: {
  program: Program;
  onChange: (p: Program) => void;
  palette: readonly BlockOp[];
  blockLimit: number | null;
  /** True while the truck runs. */
  locked: boolean;
  activeAddr?: BlockAddr | null;
  failedAddr?: BlockAddr | null;
  /** Debug It: swaps left; undefined in normal levels. */
  swap?: { left: number; onSwap: () => void };
}) {
  const [cursor, setCursor] = useState<Cursor>({ list: [], index: program.length });
  const [selected, setSelected] = useState<BlockAddr | null>(null);
  const used = blockCount(program);
  const full = blockLimit !== null && used >= blockLimit;
  const rows = flatten(program);
  const selBlock = selected ? getBlock(program, selected) : undefined;

  const commit = (p: Program, nextSel: BlockAddr | null, nextCursor?: Cursor) => {
    onChange(p);
    setSelected(nextSel);
    if (nextCursor) setCursor(nextCursor);
    else {
      // Keep the cursor valid: clamp to its list, or fall back to the end of the program.
      const l = getList(p, cursor.list);
      setCursor(l ? { list: cursor.list, index: Math.min(cursor.index, l.length) } : { list: [], index: p.length });
    }
  };

  const add = (op: BlockOp) => {
    if (locked) return;
    if (swap) {
      if (!selected || !selBlock) return toast(c.editor.swapPrompt, 'info');
      if (selBlock.op === op) return;
      if (swap.left <= 0) return toast(fill(c.editor.editsLeft, { n: 0 }), 'error');
      swap.onSwap();
      commit(swapOp(program, selected, op), selected);
      return;
    }
    if (full) return toast(c.editor.overLimit, 'error');
    const block = newBlock(op);
    const at: Cursor = selected ? { list: selected.list, index: selected.index + 1 } : cursor;
    const next = insertAt(program, at, block);
    const addr = { list: at.list, index: at.index };
    // A new Repeat/If: keep adding inside it, which is nearly always the next step.
    const inside =
      op === 'repeat' ? childList(addr, 'body') : op === 'ifFlooded' ? childList(addr, 'then') : null;
    commit(next, null, inside ? { list: inside, index: 0 } : { list: at.list, index: at.index + 1 });
  };

  const remove = () => {
    if (!selected || locked || swap) return;
    const cursorOrphaned = isInside(cursor.list, selected);
    const next = removeAt(program, selected);
    commit(next, null, cursorOrphaned ? { list: [], index: next.length } : undefined);
  };

  const move = (d: -1 | 1) => {
    if (!selected || locked || swap) return;
    const r = moveBy(program, selected, d);
    commit(r.program, r.addr, { list: [], index: r.program.length });
  };

  const times = (d: -1 | 1) => {
    if (!selected || selBlock?.op !== 'repeat' || locked) return;
    if (swap) {
      if (swap.left <= 0) return toast(fill(c.editor.editsLeft, { n: 0 }), 'error');
      swap.onSwap();
    }
    commit(setRepeat(program, selected, selBlock.n + d), selected);
  };

  const rootEnd: Cursor = { list: [], index: program.length };
  const cursorIsRootEnd = !selected && cursor.list.length === 0;

  return (
    <>
      <section className={s.programBox} aria-labelledby="program-heading">
        <div className={s.programHead}>
          <h2 id="program-heading" style={{ fontSize: 'inherit', margin: 0 }}>
            {c.editor.program}
          </h2>
          <span className={`${s.count} ${full ? s.countFull : ''}`} data-testid="block-count">
            {blockLimit === null ? fill(c.editor.noLimit, { n: used }) : fill(c.editor.blocksUsed, { n: used, max: blockLimit })}
          </span>
        </div>
        {program.length === 0 && <p className={s.empty}>{c.editor.empty}</p>}
        <ul className={s.rows} role="list" data-testid="program">
          {rows.map((r) => {
            const pad = { paddingLeft: `${r.depth * 18}px` };
            if (r.kind === 'label')
              return (
                <li key={`l-${r.addr.list.join('.')}-${r.addr.index}`} className={s.row} style={pad}>
                  <span className={s.label}>{c.blocks.otherwise}</span>
                </li>
              );
            if (r.kind === 'end') {
              const list = r.list!;
              const on = !selected && sameList(cursor.list, list);
              return swap ? null : (
                <li key={`e-${list.join('.')}`} className={s.row} style={pad}>
                  <button
                    type="button"
                    className={s.slot}
                    aria-pressed={on}
                    disabled={locked}
                    onClick={() => {
                      setSelected(null);
                      setCursor({ list, index: getList(program, list)?.length ?? 0 });
                    }}
                  >
                    {on ? `➕ ${cursorLabel(program, cursor)}` : `＋ ${c.editor.addHere}`}
                  </button>
                </li>
              );
            }
            const b = r.block!;
            const isSel = sameAddr(selected, r.addr);
            const active = sameAddr(activeAddr, r.addr);
            return (
              <li key={`b-${r.addr.list.join('.')}-${r.addr.index}`} className={s.row} style={pad}>
                <button
                  type="button"
                  className={s.blockBtn}
                  aria-pressed={isSel}
                  data-active={active || undefined}
                  data-failed={sameAddr(failedAddr, r.addr) || undefined}
                  data-op={b.op}
                  disabled={locked}
                  onClick={() => setSelected(isSel ? null : r.addr)}
                >
                  {active && <span aria-hidden="true">▶</span>}
                  <span aria-hidden="true">{ICON[b.op]}</span>
                  {blockText(b)}
                  {b.op === 'ifFlooded' && <span aria-hidden="true">:</span>}
                </button>
              </li>
            );
          })}
          {!swap && (
            <li className={s.row}>
              <button
                type="button"
                className={s.slot}
                aria-pressed={cursorIsRootEnd}
                disabled={locked}
                onClick={() => {
                  setSelected(null);
                  setCursor(rootEnd);
                }}
              >
                {cursorIsRootEnd ? `➕ ${c.editor.addHere}` : `＋ ${c.editor.addHere}`}
              </button>
            </li>
          )}
        </ul>
      </section>

      {selected && selBlock && !locked && (
        <div className={s.tools} role="group" aria-label={fill(c.editor.selected, { block: blockText(selBlock) })}>
          {!swap && (
            <>
              <button type="button" className={s.tool} onClick={() => move(-1)} aria-disabled={selected.index === 0 || undefined}>
                <span aria-hidden="true">⬆ </span>
                {c.editor.moveUp}
              </button>
              <button type="button" className={s.tool} onClick={() => move(1)}>
                <span aria-hidden="true">⬇ </span>
                {c.editor.moveDown}
              </button>
              <button type="button" className={s.tool} onClick={remove} data-testid="remove-block">
                <span aria-hidden="true">🗑 </span>
                {c.editor.remove}
              </button>
            </>
          )}
          {selBlock.op === 'repeat' && (
            <>
              <button type="button" className={s.tool} onClick={() => times(-1)} aria-label={c.editor.fewer}>
                −
              </button>
              <button type="button" className={s.tool} onClick={() => times(1)} aria-label={c.editor.more}>
                +
              </button>
            </>
          )}
          {swap && <p className={s.status}>{c.editor.swapPrompt}</p>}
        </div>
      )}

      <div className={s.palette} role="group" aria-label={c.editor.palette}>
        {palette.map((op) => (
          <button
            key={op}
            type="button"
            className={s.paletteBtn}
            data-op={op}
            aria-disabled={locked || (!swap && full) || (swap && !selected) || undefined}
            onClick={() => add(op)}
          >
            <span aria-hidden="true">{ICON[op]} </span>
            {c.blocks[op]}
          </button>
        ))}
      </div>
    </>
  );
}
