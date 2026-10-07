import { useRef, type ReactNode } from 'react';
import { copy, fill } from '../content';
import type { BoardRow } from '../net/leaderboard';
import { formatBoardDate, formatSgtTime } from '../net/sgtTime';
import s from './BoardList.module.css';

const t = copy.leaderboard;
const nf = new Intl.NumberFormat('en-SG');

function Row({ row, own, showDate }: { row: BoardRow; own: boolean; showDate: boolean }) {
  return (
    <li className={`${s.row} ${own ? s.own : ''}`} data-testid="board-row" data-own={own || undefined}>
      <span className={s.rank}>
        <span className="visually-hidden">{t.rank} </span>
        {row.rank}
      </span>
      <span className={s.body}>
        <span className={s.name}>
          {row.groupName}
          {own && <span className={s.youTag}>{t.you}</span>}
        </span>
        <span className={s.meta}>
          <span>
            <span aria-hidden="true">👥 </span>
            {row.groupSize}
            <span className="visually-hidden"> {t.players}</span>
          </span>
          <span>
            {nf.format(row.families)} {t.families}
          </span>
          <span>
            <span className="visually-hidden">{t.finished} </span>
            {showDate && `${formatBoardDate(row.boardDate)} `}
            <time dateTime={row.finishedAt}>{formatSgtTime(row.finishedAt)}</time>
          </span>
        </span>
      </span>
    </li>
  );
}

/** Ranked group rows (§3.6): rank · name · 👥 size · families · HH:MM SGT. */
export function BoardList({
  rows,
  ownIds = [],
  pinned = null,
  showDate = false,
  label,
}: {
  rows: BoardRow[];
  ownIds?: number[];
  pinned?: BoardRow | null;
  showDate?: boolean;
  label: string;
}) {
  return (
    <>
      <ol className={s.list} role="list" aria-label={label}>
        {rows.map((r) => (
          <Row key={r.id} row={r} own={ownIds.includes(r.id)} showDate={showDate} />
        ))}
      </ol>
      {pinned && (
        <div className={s.pinned} data-testid="board-pinned">
          <p className={s.pinnedLabel} id="board-pinned-label">
            {t.pinned}
          </p>
          <ol className={s.list} role="list" aria-labelledby="board-pinned-label">
            <Row row={pinned} own showDate={false} />
          </ol>
        </div>
      )}
    </>
  );
}

interface BoardViewProps {
  board: {
    status: 'loading' | 'ready' | 'error';
    errorKind: string | null;
    rows: BoardRow[];
    pinned: BoardRow | null;
    ownIds: number[];
    reload: () => void;
  };
  emptyText: string;
  label: string;
  showDate?: boolean;
}

/** Board with its loading, empty, error and "unavailable" states. */
export function BoardView({ board, emptyText, label, showDate }: BoardViewProps) {
  // The wrapper stays mounted across states, so "Try again" can hand focus to it (WCAG 2.4.3).
  const wrapRef = useRef<HTMLDivElement>(null);
  const empty = board.rows.length === 0 && !board.pinned;
  // One persistent status region, so loading, results and empty states are all announced.
  const status =
    board.status === 'loading'
      ? t.loading
      : board.status === 'error'
        ? ''
        : empty
          ? emptyText
          : fill(t.count, { count: board.rows.length });

  // Loading and empty text is shown in the status region itself; only the count is visually hidden.
  const statusVisible = board.status === 'loading' || (board.status === 'ready' && empty);

  let body: ReactNode = null;
  if (board.status === 'error') {
    const unavailable = board.errorKind === 'unavailable';
    body = (
      <div className={s.state} data-testid="board-error">
        <p role="alert">{unavailable ? t.unavailable : t.error}</p>
        {!unavailable && (
          <button
            type="button"
            className={s.retry}
            onClick={() => {
              wrapRef.current?.focus();
              board.reload();
            }}
          >
            {t.retry}
          </button>
        )}
      </div>
    );
  } else if (board.status === 'ready' && !empty) {
    body = <BoardList rows={board.rows} ownIds={board.ownIds} pinned={board.pinned} showDate={showDate} label={label} />;
  }

  return (
    <div ref={wrapRef} tabIndex={-1} aria-label={label} className={s.wrap}>
      <p role="status" className={statusVisible ? s.state : 'visually-hidden'}>
        {status}
      </p>
      {body}
    </div>
  );
}
