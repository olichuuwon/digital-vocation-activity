import { useEffect, useRef, useState } from 'react';
import { copy, fill } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import { groupActions, stagesLedBy, useGroup, type Member } from '../../net/group';
import { joinUrl } from '../../net/group/codes';
import { LOBBY_TTL_MS } from '../../net/group/protocol';
import { moveMember, shuffled } from '../../net/group/rotation';
import { useAnnouncer, useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import s from './Group.module.css';

const t = groupCopy.lobby;

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "Main phone: stage 1, 4 and the finale" for a rotation slot. */
function ledLine(index: number, n: number): string {
  const led = stagesLedBy(index, n);
  const stages = led.filter((x) => x <= 4);
  const finale = led.includes(5);
  // With 4 or fewer players everyone leads at least one of stages 1–4.
  if (!stages.length) return '';
  return `${fill(t.leadsStages, { stages: stages.join(', ') })}${finale ? ` ${t.leadsFinale}` : ''}`;
}

/** Lobby (§3.5.1): QR + code, members and the main-phone rotation; the leader starts. */
export function GroupLobby() {
  const g = useGroup();
  const session = g.snap.session;
  const headingRef = useScreenHeading<HTMLHeadingElement>(session?.name ?? '');
  const [qr, setQr] = useState<string | null>(null);
  const [startMsg, setStartMsg] = useState('');
  const now = useNow(15_000);
  const code = session?.code ?? '';
  const url = code ? joinUrl(window.location.origin, import.meta.env.BASE_URL, code) : '';
  const leader = g.role === 'leader';

  useEffect(() => {
    if (!url) return;
    let live = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M' }))
      .then((d) => live && setQr(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);

  // Teammates joining or dropping are spoken (the list itself updates silently).
  const announce = useAnnouncer((a) => a.announce);
  const roster = JSON.stringify(g.members.filter((m) => !m.isMe).map((m) => [m.id, m.present, m.nick]));
  const prevRoster = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevRoster.current;
    prevRoster.current = roster;
    if (prev === null) return;
    const before = new Map((JSON.parse(prev) as [string, boolean, string][]).map(([id, present]) => [id, present]));
    const said: string[] = [];
    for (const [id, present, nick] of JSON.parse(roster) as [string, boolean, string][]) {
      if (!before.has(id) && present) said.push(fill(t.joinedSay, { name: nick }));
      else if (before.get(id) === true && !present) said.push(fill(t.awaySay, { name: nick }));
    }
    if (said.length) announce(said.join(' '));
  }, [roster, announce]);

  if (!session) return null;
  const present = g.members.filter((m) => m.present).length;
  const canStart = present >= 2;
  const minsLeft = Math.max(1, Math.ceil((session.createdAt + LOBBY_TTL_MS - now) / 60_000));
  const leaderName = g.members.find((m) => m.isLeader)?.nick ?? '';

  const move = (i: number, dir: -1 | 1) => groupActions.setRotation(moveMember(g.rotation, i, dir));

  return (
    <main className={ui.screen}>
      <div className={s.lobbyTop}>
        <h1 ref={headingRef} tabIndex={-1} data-testid="group-name">
          {session.name}
        </h1>
        {qr ? (
          <img className={s.qr} src={qr} alt={fill(t.qrAlt, { name: session.name, code })} width={240} height={240} />
        ) : (
          <div className={s.qr} aria-hidden="true" />
        )}
        <p className={ui.muted}>{t.codeLabel}</p>
        <p className={s.code}>
          <span aria-hidden="true" data-testid="group-code">
            {code}
          </span>
          {/* Spaced letters, so screen readers spell the code instead of reading it as a word. */}
          <span className="visually-hidden">{code.split('').join(' ')}</span>
        </p>
        <p className={ui.muted}>{t.scanHint}</p>
        <p className={ui.muted}>
          {session.mode === 'booth' ? copy.length.booth : copy.length.full} · {fill(t.closesIn, { min: minsLeft })}
        </p>
      </div>

      <section aria-labelledby="players-h" className={ui.card}>
        <h2 id="players-h" style={{ marginTop: 0 }}>
          {fill(t.playersHeading, { n: g.members.length })}
        </h2>
        <p className={ui.muted}>{t.rotationNote}</p>
        <ol className={s.members} role="list" data-testid="members">
          {g.members.map((m: Member, i) => (
            <li key={m.id} className={`${s.member} ${m.present ? '' : s.away}`} data-testid="member" data-me={m.isMe || undefined}>
              <span className={s.memberNum} aria-hidden="true">
                {i + 1}
              </span>
              <span className={s.memberText}>
                <span className={s.memberName}>
                  <span className="visually-hidden">{i + 1}. </span>
                  {m.nick}
                  {m.isMe && ` (${t.you})`}
                  {m.isLeader && ` · ${t.leaderTag}`}
                </span>
                <span className={s.memberMeta}>{m.present ? ledLine(i, g.members.length) : t.reconnecting}</span>
              </span>
              {leader && g.members.length > 1 && (
                <span className={s.moveBtns}>
                  <button
                    type="button"
                    className={s.moveBtn}
                    aria-disabled={i === 0 || undefined}
                    aria-label={fill(t.moveUp, { name: m.nick })}
                    onClick={() => i > 0 && move(i, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className={s.moveBtn}
                    aria-disabled={i === g.members.length - 1 || undefined}
                    aria-label={fill(t.moveDown, { name: m.nick })}
                    onClick={() => i < g.members.length - 1 && move(i, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className={ui.actions}>
        {leader ? (
          <>
            {g.members.length > 2 && (
              <button type="button" className={ui.btn} onClick={() => groupActions.setRotation(shuffled(g.rotation))}>
                {t.shuffle} <span aria-hidden="true">🔀</span>
              </button>
            )}
            <p className={canStart ? ui.muted : s.hint} id="start-note" role="status">
              {canStart ? '' : t.needTwo}
            </p>
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              aria-disabled={!canStart || undefined}
              aria-describedby="start-note"
              onClick={() => {
                if (!canStart || !groupActions.start()) setStartMsg(t.needTwo);
              }}
            >
              {t.start} <span aria-hidden="true">🚀</span>
            </button>
            {startMsg && !canStart && <p className={s.error}>{startMsg}</p>}
          </>
        ) : (
          <p className={s.notice} role="status" data-testid="lobby-waiting">
            {fill(t.waiting, { name: leaderName })}
          </p>
        )}
        <button type="button" className={ui.btn} onClick={() => groupActions.leave()}>
          {leader ? t.close : t.leave}
        </button>
      </div>
    </main>
  );
}
