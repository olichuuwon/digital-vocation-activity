import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAnnouncer } from '../../app/screenFocus';
import { fill } from '../../content';
import type { BlockOp, Program } from '../../content/stage3Schema';
import { REPEAT_MAX, REPEAT_MIN } from '../../content/stage3Schema';
import { toast } from '../../components/toastStore';
import { blockText, ICON } from './blocks';
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

const sameList = (a: ListPath, b: ListPath) => a.length === b.length && a.every((x, i) => x === b[i]);
/** Stable DOM key for a block address, used to put focus back after edits. */
const addrKey = (a: BlockAddr) => `${a.list.join('.')}:${a.index}`;

/** "inside Repeat ×3" / "inside If road ahead is flooded" / "inside Otherwise", or "" at the top level. */
function insideText(program: Program, list: ListPath): string {
  if (list.length === 0) return '';
  const owner = getBlock(program, { list: list.slice(0, -2), index: list[list.length - 2] as number });
  if (!owner) return '';
  const field = list[list.length - 1];
  const name = owner.op === 'ifFlooded' && field === 'else' ? c.blocks.otherwise : blockText(owner);
  return fill(c.a11y.inside, { block: name });
}

/** Spoken/visible name of an "add here" slot, stable whether or not it's the active one. */
function slotName(program: Program, list: ListPath): string {
  return fill(c.a11y.slot, { where: insideText(program, list) || c.a11y.atEnd });
}

/** What the active "add here" spot is called on screen ("Adding inside Repeat"). */
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
 * Every edit is announced once (one live region), and focus never falls back to <body> (§10).
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
  dock,
}: {
  program: Program;
  onChange: (p: Program) => void;
  palette: readonly BlockOp[];
  blockLimit: number | null;
  /** True while the truck runs or once solved: the program can be read but not changed. */
  locked: boolean;
  activeAddr?: BlockAddr | null;
  failedAddr?: BlockAddr | null;
  /** Debug It: swaps left; undefined in normal levels. */
  swap?: { maxEdits: number; changed: (p: Program) => number };
  /** Run/Step/Reset etc., shown in the sticky bottom dock under the palette. */
  dock?: ReactNode;
}) {
  const [cursor, setCursor] = useState<Cursor>({ list: [], index: program.length });
  const [selected, setSelected] = useState<BlockAddr | null>(null);
  const announce = useAnnouncer((a) => a.announce);
  const used = blockCount(program);
  const full = blockLimit !== null && used >= blockLimit;
  const rows = flatten(program);
  const selBlock = selected ? getBlock(program, selected) : undefined;
  const countText = (n: number) =>
    blockLimit === null ? fill(c.editor.noLimit, { n }) : fill(c.editor.blocksUsed, { n, max: blockLimit });

  // The program is part of the page; while the truck runs the map stays in view (no auto-scroll here).
  const boxRef = useRef<HTMLElement>(null);

  // After Remove the focused button disappears: move focus to the nearest block or slot.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-key="${key}"]`) ?? box?.querySelector<HTMLElement>('[data-key="end"]');
    el?.focus();
  });

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
      if (!selected || !selBlock) return toast(c.editor.pickBlockFirst, 'info');
      if (selBlock.op === op) return;
      const next = swapOp(program, selected, op);
      const left = swap.maxEdits - swap.changed(next);
      if (left < 0) return toast(fill(c.editor.editsLeft, { n: 0 }), 'error');
      commit(next, selected);
      announce(fill(c.a11y.swapped, { block: blockText(getBlock(next, selected)!), n: left }));
      return;
    }
    if (full) return toast(c.editor.overLimit, 'error');
    const block = newBlock(op);
    const at: Cursor = selected ? { list: selected.list, index: selected.index + 1 } : cursor;
    const next = insertAt(program, at, block);
    const addr = { list: at.list, index: at.index };
    // A new Repeat/If: keep adding inside it, which is nearly always the next step.
    const inside = op === 'repeat' ? childList(addr, 'body') : op === 'ifFlooded' ? childList(addr, 'then') : null;
    commit(next, null, inside ? { list: inside, index: 0 } : { list: at.list, index: at.index + 1 });
    const where = insideText(next, at.list);
    const said = fill(c.a11y.added, { block: `${blockText(block)}${where ? `, ${where}` : ''}`, count: countText(blockCount(next)) });
    announce(inside ? `${said} ${fill(c.a11y.addingInside, { block: blockText(block) })}` : said);
  };

  const remove = () => {
    if (!selected || !selBlock || locked || swap) return;
    const cursorOrphaned = isInside(cursor.list, selected);
    const next = removeAt(program, selected);
    commit(next, null, cursorOrphaned ? { list: [], index: next.length } : undefined);
    const left = getList(next, selected.list) ?? [];
    const focusAt = left.length === 0 ? null : { list: selected.list, index: Math.min(selected.index, left.length - 1) };
    pendingFocus.current = focusAt ? addrKey(focusAt) : 'end';
    announce(fill(c.a11y.removed, { block: blockText(selBlock), count: countText(blockCount(next)) }));
  };

  const listLen = selected ? (getList(program, selected.list)?.length ?? 0) : 0;
  const move = (d: -1 | 1) => {
    if (!selected || locked || swap) return;
    const to = selected.index + d;
    if (to < 0 || to >= listLen) return;
    const r = moveBy(program, selected, d);
    commit(r.program, r.addr, { list: [], index: r.program.length });
    announce(fill(c.a11y.moved, { n: r.addr.index + 1 }));
  };

  const times = (d: -1 | 1) => {
    if (!selected || selBlock?.op !== 'repeat' || locked) return;
    const n = selBlock.n + d;
    if (n < REPEAT_MIN || n > REPEAT_MAX) return;
    const next = setRepeat(program, selected, n);
    if (swap && swap.changed(next) > swap.maxEdits) return toast(fill(c.editor.editsLeft, { n: 0 }), 'error');
    commit(next, selected);
    announce(fill(c.a11y.repeatSet, { n }));
  };

  const rootEnd: Cursor = { list: [], index: program.length };
  const cursorIsRootEnd = !selected && cursor.list.length === 0;

  return (
    <>
      <section className={s.programBox} aria-labelledby="program-heading" ref={boxRef} tabIndex={locked ? 0 : undefined}>
        <div className={s.programHead}>
          <h2 id="program-heading" style={{ fontSize: 'inherit', margin: 0 }}>
            {c.editor.program}
          </h2>
          <span className={`${s.count} ${full ? s.countFull : ''}`} data-testid="block-count">
            {countText(used)}
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
                    aria-disabled={locked || undefined}
                    aria-label={slotName(program, list)}
                    onClick={() => {
                      if (locked) return;
                      setSelected(null);
                      setCursor({ list, index: getList(program, list)?.length ?? 0 });
                    }}
                  >
                    <span aria-hidden="true">{on ? '➕ ' : '＋ '}</span>
                    {on ? cursorLabel(program, cursor) : c.editor.addHere}
                  </button>
                </li>
              );
            }
            const b = r.block!;
            const isSel = sameAddr(selected, r.addr);
            const active = sameAddr(activeAddr, r.addr);
            const failedHere = sameAddr(failedAddr, r.addr);
            const where = insideText(program, r.addr.list);
            return (
              <li key={`b-${r.addr.list.join('.')}-${r.addr.index}`} className={s.row} style={pad}>
                <button
                  type="button"
                  className={s.blockBtn}
                  aria-pressed={isSel}
                  aria-disabled={locked || undefined}
                  aria-current={active ? 'step' : undefined}
                  data-active={active || undefined}
                  data-failed={failedHere || undefined}
                  data-op={b.op}
                  data-key={addrKey(r.addr)}
                  onClick={() => !locked && setSelected(isSel ? null : r.addr)}
                >
                  {failedHere ? <span aria-hidden="true">✗</span> : active && <span aria-hidden="true">▶</span>}
                  <span aria-hidden="true">{ICON[b.op]}</span>
                  {blockText(b)}
                  {b.op === 'ifFlooded' && <span aria-hidden="true">:</span>}
                  {where && <span className="visually-hidden">, {where}</span>}
                  {failedHere && <span className="visually-hidden">, {c.a11y.stoppedHere}</span>}
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
                aria-disabled={locked || undefined}
                aria-label={slotName(program, [])}
                data-key="end"
                onClick={() => {
                  if (locked) return;
                  setSelected(null);
                  setCursor(rootEnd);
                }}
              >
                <span aria-hidden="true">{cursorIsRootEnd ? '➕ ' : '＋ '}</span>
                {c.editor.addHere}
              </button>
            </li>
          )}
        </ul>
      </section>

      {/* Bottom dock (thumb zone, §9): selected-block tools, palette and the stage's run controls. */}
      <div className={s.dock}>
      {selected && selBlock && !locked && (
        <div className={s.tools} role="group" aria-label={fill(c.editor.selected, { block: blockText(selBlock) })}>
          {!swap && (
            <>
              <button type="button" className={s.tool} onClick={() => move(-1)} aria-disabled={selected.index === 0 || undefined}>
                <span aria-hidden="true">⬆ </span>
                {c.editor.moveUp}
              </button>
              <button type="button" className={s.tool} onClick={() => move(1)} aria-disabled={selected.index >= listLen - 1 || undefined}>
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
              <button
                type="button"
                className={s.tool}
                onClick={() => times(-1)}
                aria-label={c.editor.fewer}
                aria-disabled={selBlock.n <= REPEAT_MIN || undefined}
              >
                −
              </button>
              <button
                type="button"
                className={s.tool}
                onClick={() => times(1)}
                aria-label={c.editor.more}
                aria-disabled={selBlock.n >= REPEAT_MAX || undefined}
              >
                +
              </button>
            </>
          )}
          {swap && <p className={s.status}>{c.editor.swapPrompt}</p>}
        </div>
      )}

      {/* Hidden while the truck runs or once solved, so the map and the run controls have the room. */}
      <div className={s.palette} role="group" aria-label={c.editor.palette} hidden={locked}>
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
      {dock}
      </div>
    </>
  );
}
