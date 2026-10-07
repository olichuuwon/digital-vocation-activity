import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BoardView } from '../../components/BoardList';
import { copy, fill, stageContent } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import { watchHost, type HostGroup } from '../../net/group/hostChannel';
import { sharedTransport } from '../../net/group/store';
import { hostListRecent, LeaderboardError, setHidden, type HostRow, type HostStatus } from '../../net/leaderboard';
import { formatSgtTime } from '../../net/sgtTime';
import type { Mode } from '../../state/types';
import { gameUrl, parseParams } from '../params';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import { useBoard } from '../useBoard';
import s from './Host.module.css';
import g from './Group.module.css';

const t = copy.host;
const POLL_MS = 10_000;

/** `/host` booth screen (§3.5.1): QR to the game, live Today board, facilitator panel. */
export default function Host({ mode }: { mode: Mode | null }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(t.heading);
  const board = useBoard({ kind: 'today' }, POLL_MS);
  const url = gameUrl(window.location.origin, import.meta.env.BASE_URL, mode, parseParams(window.location.search).relaxed);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M' })
      .then((d) => live && setQr(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <main className={s.host}>
      <header className={s.head}>
        <h1 ref={headingRef} tabIndex={-1}>
          {copy.home.title} · {t.heading}
        </h1>
      </header>
      <div className={s.grid}>
        <section className={`${ui.card} ${s.qrCard}`} aria-labelledby="host-scan">
          <h2 id="host-scan">{t.scan}</h2>
          {qr ? (
            <img className={s.qr} src={qr} alt={fill(t.qrAlt, { url })} width={640} height={640} />
          ) : (
            <div className={s.qr} aria-hidden="true" />
          )}
          <p className={s.url}>{url}</p>
        </section>

        <section className={`${ui.card} ${s.boardCard}`} aria-labelledby="host-board">
          <h2 id="host-board">{t.board}</h2>
          {board.updatedAt && (
            <p className={ui.muted} data-testid="host-updated">
              {fill(board.errorKind ? t.stale : t.updated, {
                time: formatSgtTime(new Date(board.updatedAt).toISOString()),
              })}
            </p>
          )}
          <BoardView board={board} emptyText={copy.leaderboard.emptyToday} label={t.board} />
        </section>

        <PlayingNow />

        <FacilitatorPanel onChanged={board.reload} />
      </div>
    </main>
  );
}

/**
 * Groups playing right now (§3.5.1): each group's main phone shows {name, size, stage} in the
 * presence of today's host channel. Nothing is stored; a group vanishes when it finishes.
 */
function PlayingNow() {
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [transport] = useState(() => sharedTransport());
  useEffect(() => (transport ? watchHost(transport, setGroups) : undefined), [transport]);
  const where = (x: HostGroup) =>
    x.stage === null
      ? groupCopy.host.lobby
      : x.stage === 5
        ? groupCopy.host.finale
        : x.stage === 0
          ? groupCopy.support.lobbyStage
          : fill(groupCopy.host.stage, { n: x.stage, title: stageContent(x.stage)?.title ?? '' });
  return (
    <section className={ui.card} aria-labelledby="host-playing" data-testid="host-playing">
      <h2 id="host-playing">{t.playing}</h2>
      {groups.length === 0 ? (
        <p className={ui.muted}>{transport ? groupCopy.host.none : t.playingSoon}</p>
      ) : (
        <ul className={g.hostList} role="list">
          {groups.map((x) => (
            <li key={x.id} className={g.hostRow} data-testid="host-group">
              <strong>{x.name}</strong>
              <span className={ui.muted}>
                <span aria-hidden="true">👥 </span>
                {fill(groupCopy.host.size, { n: x.size })} · {where(x)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const statusText: Partial<Record<HostStatus, string>> = {
  wrong_pin: t.wrongPin,
  locked: t.locked,
  not_configured: t.notConfigured,
};

/** PIN-gated hide/unhide. The PIN lives in memory only and is checked server-side. */
function FacilitatorPanel({ onChanged }: { onChanged: () => void }) {
  const [pinInput, setPinInput] = useState('');
  const [pin, setPin] = useState<string | null>(null);
  const [rows, setRows] = useState<HostRow[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  // Unlock/lock swap the panel's content; move focus so it isn't lost to <body> (WCAG 2.4.3).
  const wasUnlocked = useRef(false);
  useEffect(() => {
    if (pin !== null && !wasUnlocked.current) headingRef.current?.focus();
    if (pin === null && wasUnlocked.current) pinRef.current?.focus();
    wasUnlocked.current = pin !== null;
  }, [pin]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof LeaderboardError && e.kind === 'unavailable' ? copy.leaderboard.unavailable : t.networkError);
    } finally {
      setBusy(false);
    }
  };

  const lock = (msg = '') => {
    setPin(null);
    setRows([]);
    setPinInput('');
    setMessage(msg);
  };

  const list = (p: string) =>
    run(async () => {
      const res = await hostListRecent(p);
      if (res.status === 'ok') {
        setPin(p);
        setRows(res.rows);
      } else {
        lock(statusText[res.status] ?? t.wrongPin);
      }
    });

  const unlock = (e: FormEvent) => {
    e.preventDefault();
    if (pinInput) void list(pinInput);
  };

  const toggle = (row: HostRow) =>
    pin &&
    !busy &&
    run(async () => {
      const status = await setHidden(row.id, !row.hidden, pin);
      if (status === 'ok' || status === 'not_found') {
        const res = await hostListRecent(pin);
        if (res.status === 'ok') setRows(res.rows);
        if (status === 'ok') setMessage(fill(row.hidden ? t.shownDone : t.hiddenDone, { name: row.groupName }));
        onChanged();
      } else {
        lock(statusText[status] ?? t.wrongPin);
      }
    });

  return (
    <section className={ui.card} aria-labelledby="host-facilitator">
      <h2 id="host-facilitator" ref={headingRef} tabIndex={-1}>
        {t.facilitator}
      </h2>
      {pin === null ? (
        <form className={s.pinForm} onSubmit={unlock}>
          <p className={ui.muted}>{t.facilitatorNote}</p>
          <label className={s.pinLabel}>
            {t.pinLabel}
            <input
              ref={pinRef}
              className={s.pin}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? 'host-pin-message' : undefined}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button type="submit" className={`${ui.btn} ${ui.primary}`} disabled={busy || pinInput.length < 6}>
            {busy ? t.checking : t.unlock}
          </button>
        </form>
      ) : (
        <div className={s.hostList}>
          {rows.length === 0 ? (
            <p className={ui.muted}>{t.noneToday}</p>
          ) : (
            <ul className={s.modList} role="list" aria-label={t.facilitator}>
              {rows.map((r) => (
                <li key={r.id} className={s.modRow} data-testid="host-row">
                  <span className={s.modName}>
                    {r.groupName}
                    {r.hidden && <span className={s.hiddenTag}>{t.hiddenTag}</span>}
                  </span>
                  <span className={ui.muted}>
                    {r.families} {copy.leaderboard.families} · {formatSgtTime(r.finishedAt)}
                  </span>
                  <button
                    type="button"
                    className={ui.btn}
                    aria-disabled={busy || undefined}
                    aria-label={`${r.hidden ? t.unhide : t.hide} ${r.groupName}`}
                    onClick={() => void toggle(r)}
                  >
                    {r.hidden ? t.unhide : t.hide}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={s.row}>
            <button
              type="button"
              className={ui.btn}
              aria-disabled={busy || undefined}
              onClick={() => !busy && void list(pin)}
            >
              {t.refresh}
            </button>
            <button type="button" className={ui.btn} onClick={() => lock()}>
              {t.lock}
            </button>
          </div>
        </div>
      )}
      <p id="host-pin-message" role="status" aria-live="polite" className={s.message}>
        {message}
      </p>
    </section>
  );
}
