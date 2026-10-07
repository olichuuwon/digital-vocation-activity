import { useRef, useState, type KeyboardEvent } from 'react';
import { BoardView } from '../../components/BoardList';
import { copy, fill } from '../../content';
import { LeaderboardError, submitRun } from '../../net/leaderboard';
import { rememberOwnRun } from '../../net/ownRuns';
import { formatBoardDate, sgtDate } from '../../net/sgtTime';
import { newUuid } from '../../net/uuid';
import { useAnnouncer, useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import { useBoard } from '../useBoard';
import s from './Leaderboard.module.css';

const t = copy.leaderboard;
type Tab = 'today' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: t.today },
  { id: 'all', label: t.all },
];

/** Leaderboard from Home (§3.6): Today (default) and View all with a day filter. */
export function Leaderboard({ onBack, debug }: { onBack: () => void; debug: boolean }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(t.heading);
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState<string | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ today: null, all: null });
  const board = useBoard(tab === 'today' ? { kind: 'today' } : { kind: 'all', date });

  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs, automatic activation).
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((x) => x.id === tab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next]!.id;
    setTab(id);
    tabRefs.current[id]?.focus();
  };

  const note = tab === 'today' ? t.todayNote : date ? fill(t.dateNote, { date: formatBoardDate(date) }) : t.allTimeNote;
  const emptyText = tab === 'today' ? t.emptyToday : date ? t.emptyDate : t.emptyAll;

  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {t.heading}
      </h1>
      <div role="tablist" aria-label={t.tabsLabel} className={s.tabs}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`board-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="board-panel"
            tabIndex={tab === id ? 0 : -1}
            className={s.tab}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
          >
            {label}
          </button>
        ))}
      </div>
      <section role="tabpanel" id="board-panel" aria-labelledby={`board-tab-${tab}`} className={s.panel}>
        {tab === 'all' && (
          <div className={s.filter}>
            <label className={s.dateLabel}>
              {t.dateLabel}
              <input
                type="date"
                className={s.date}
                value={date ?? ''}
                max={sgtDate()}
                onChange={(e) => setDate(e.target.value || null)}
              />
            </label>
            <button type="button" className={ui.btn} disabled={date === null} onClick={() => setDate(null)}>
              {t.allTime}
            </button>
          </div>
        )}
        <p className={ui.muted}>{note}</p>
        <BoardView board={board} emptyText={emptyText} label={note} showDate={tab === 'all' && date === null} />
        <p className={ui.muted}>{t.soloNote}</p>
      </section>
      <div className={ui.actions}>
        {debug && import.meta.env.DEV && <DebugSubmit onDone={board.reload} />}
        <button type="button" className={ui.btn} onClick={onBack}>
          <span>
            <span aria-hidden="true">← </span>
            {t.back}
          </span>
        </button>
      </div>
    </main>
  );
}

/** ?debug=1 helper for `npm run dev` only, so the deployed site can't post fake rows. */
function DebugSubmit({ onDone }: { onDone: () => void }) {
  const announce = useAnnouncer((a) => a.announce);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await submitRun({
        groupToken: newUuid(),
        groupName: 'QA Test',
        groupSize: 2,
        mode: 'booth',
        families: Math.floor(Math.random() * 1201),
        durationSec: 480 + Math.floor(Math.random() * 600),
      });
      rememberOwnRun(r.id);
      announce(t.testSubmitted);
      onDone();
    } catch (e) {
      announce(fill(t.testFailed, { reason: e instanceof LeaderboardError ? e.kind : 'error' }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={ui.btn} disabled={busy} onClick={() => void submit()}>
      {t.testSubmit}
    </button>
  );
}
