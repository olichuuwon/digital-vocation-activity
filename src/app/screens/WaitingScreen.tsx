import { useEffect, useState } from 'react';
import { fill, levelsFor, stageContent, stages } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import { HANDOFF_READY, HANDOFF_TOPIC, sendAction, stagesLedBy, useGroup, useTopic } from '../../net/group';
import { PROMOTE_AFTER_MS } from '../../net/group/protocol';
import { useGame } from '../../state/store';
import type { Discipline } from '../../state/types';
import { z } from 'zod';
import { useAnnouncer, useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import s from './Group.module.css';

const t = groupCopy.waiting;
const handoffSchema = z.object({ stage: z.number().int().min(0).max(5), nextId: z.string().nullable() });

function useSecondsSince(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** True for `ms` after `at` (a notice that fades). */
function useRecent(at: number | null, ms: number) {
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (at === null) return;
    const id = setTimeout(() => setExpired(at), Math.max(0, at + ms - Date.now()));
    return () => clearTimeout(id);
  }, [at, ms]);
  return at !== null && expired !== at;
}

const stageName = (stage: number) => (stage === 5 ? t.finale : (stageContent(stage)?.title ?? ''));

/**
 * What everyone except the current player sees during a team run (§3.5.2): who is playing which
 * stage, the team's stars so far, when this phone's turn comes, and the hand-off "Ready".
 * Teammates watch the player's phone and talk it through in person.
 */
export function WaitingScreen() {
  const g = useGroup();
  const run = useGame((x) => x.run);
  const stage = g.stage ?? 0;
  const content = stage >= 1 && stage <= 4 ? stageContent(stage) : undefined;
  const mainName = g.main?.nick ?? '';
  const heading = stage === 0 ? fill(t.prologue, { name: mainName }) : fill(t.playing, { name: mainName });
  const headingRef = useScreenHeading<HTMLHeadingElement>(heading);
  const handoff = useTopic(HANDOFF_TOPIC, handoffSchema);
  const upNext = !!handoff && handoff.stage === stage && !!g.me && handoff.nextId === g.me.id;
  const myNext = g.me ? stagesLedBy(g.me.index, g.members.length).find((x) => x > stage) : undefined;
  const pausedFor = useSecondsSince(g.paused?.since ?? null);
  const promoted = g.snap.promoted;
  const recent = useRecent(promoted?.at ?? null, 8_000);
  const showPromoted = !!promoted && promoted.stage === stage && recent && !g.paused;
  const promotedName = g.members.find((m) => m.id === promoted?.id)?.nick ?? '';
  const levels = content ? levelsFor(content) : [];
  const levelIndex = run && run.stage === stage ? run.levelIndex : 0;
  // Each notice is spoken once when it appears (the visible ones aren't live regions: the pause
  // countdown would be re-read every second).
  const announce = useAnnouncer((a) => a.announce);
  const pausedName = g.paused?.name ?? null;
  useEffect(() => {
    if (pausedName !== null) announce(fill(t.paused, { name: pausedName, s: Math.ceil(PROMOTE_AFTER_MS / 1000) }));
  }, [pausedName, announce]);
  useEffect(() => {
    if (showPromoted) announce(fill(t.promoted, { name: promotedName }));
  }, [showPromoted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (upNext) announce(`${t.upNext} ${fill(t.upNextBody, { stage: stageName(stage + 1) })}`);
  }, [upNext]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className={s.waiting} data-testid="waiting-screen" data-stage={stage} data-main={mainName}>
      <div className={s.waitHead}>
        <span className={s.waitIcon} aria-hidden="true">
          {content?.icon ?? (stage === 5 ? '🚚' : '🎮')}
        </span>
        <h1 ref={headingRef} tabIndex={-1} data-testid="now-playing">
          {heading}
        </h1>
        {stage >= 1 && (
          <p className={ui.muted}>
            {stageName(stage)}
            {levels.length > 1 && ` · ${fill(t.level, { n: Math.min(levelIndex + 1, levels.length), total: levels.length })}`}
          </p>
        )}
      </div>

      {g.paused && (
        <p className={s.notice} data-testid="paused">
          {fill(t.paused, { name: g.paused.name, s: Math.max(0, Math.ceil(PROMOTE_AFTER_MS / 1000) - pausedFor) })}
        </p>
      )}
      {showPromoted && <p className={s.notice}>{fill(t.promoted, { name: promotedName })}</p>}

      <div className={ui.card}>
        <p style={{ margin: 0 }}>
          <span aria-hidden="true">🗣️ </span>
          {fill(t.tip, { name: mainName })}
        </p>
      </div>

      {run && (
        <section className={ui.card} aria-labelledby="team-stars">
          <h2 id="team-stars" style={{ marginTop: 0, fontSize: '1rem' }}>
            {t.stars}
          </h2>
          <ul className={s.starRow} role="list">
            {stages.map((st) => {
              const n = run.stars[st.discipline as Discipline];
              return (
                <li key={st.stage} aria-label={`${st.title}: ${n} of 3`}>
                  <span aria-hidden="true">
                    {st.icon} {'★'.repeat(n)}
                    {'☆'.repeat(3 - n)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!upNext && (
        <p className={ui.muted} data-testid="my-turn">
          {myNext !== undefined ? fill(t.yourTurn, { stage: stageName(myNext) }) : t.turnsDone}
        </p>
      )}

      {/* In the thumb zone: sticks to the bottom of the screen (§10 mobile). */}
      {upNext && (
        <div className={s.upNext} data-testid="up-next">
          <strong>{t.upNext}</strong>
          <span>{fill(t.upNextBody, { stage: stageName(stage + 1) })}</span>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => sendAction(HANDOFF_READY)}>
            {t.ready}
          </button>
        </div>
      )}
    </main>
  );
}
