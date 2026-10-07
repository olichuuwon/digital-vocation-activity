import { Suspense, useEffect, useState } from 'react';
import { fill, stageContent } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import { HANDOFF_READY, HANDOFF_TOPIC, sendAction, useGroup, useTopic } from '../../net/group';
import { PROMOTE_AFTER_MS } from '../../net/group/protocol';
import { z } from 'zod';
import { supportViews } from '../../stages/supportRegistry';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';
import s from './Group.module.css';

const t = groupCopy.support;
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

/**
 * What a support phone shows during a group run (§3.5.2): who has the main phone, the stage's
 * support card (from src/stages/supportRegistry.ts), pause and hand-off notices.
 */
export function SupportScreen() {
  const g = useGroup();
  const stage = g.stage ?? 0;
  const content = stage >= 1 && stage <= 4 ? stageContent(stage) : undefined;
  const title = stage === 0 ? t.lobbyStage : stage === 5 ? t.finale : (content?.title ?? '');
  const headingRef = useScreenHeading<HTMLHeadingElement>(title);
  const mainName = g.main?.nick ?? '';
  const View = stage >= 1 ? supportViews[stage as 1 | 2 | 3 | 4 | 5] : undefined;
  const handoff = useTopic(HANDOFF_TOPIC, handoffSchema);
  const upNext = !!handoff && handoff.stage === stage && !!g.me && handoff.nextId === g.me.id;
  const pausedFor = useSecondsSince(g.paused?.since ?? null);
  const promoted = g.snap.promoted;
  const recent = useRecent(promoted?.at ?? null, 8_000);
  const showPromoted = !!promoted && promoted.stage === stage && recent && !g.paused;
  const promotedName = g.members.find((m) => m.id === promoted?.id)?.nick ?? '';

  return (
    <main className={s.support} data-testid="support-screen" data-stage={stage} data-main={mainName}>
      <div className={s.supportHead}>
        <h1 ref={headingRef} tabIndex={-1}>
          {content && <span aria-hidden="true">{content.icon} </span>}
          {title}
        </h1>
        <p className={ui.muted} data-testid="supporting">
          <strong>{fill(t.supporting, { name: mainName })}</strong>
        </p>
        <p className={ui.muted}>{fill(t.mainHint, { name: mainName })}</p>
      </div>

      {g.paused && (
        <p className={s.notice} role="status" data-testid="paused">
          {fill(t.paused, { name: g.paused.name, s: Math.max(0, Math.ceil(PROMOTE_AFTER_MS / 1000) - pausedFor) })}
        </p>
      )}
      {showPromoted && (
        <p className={s.notice} role="status">
          {fill(t.promoted, { name: promotedName })}
        </p>
      )}
      {upNext && (
        <div className={s.upNext} role="status" data-testid="up-next">
          <strong>{t.upNext}</strong>
          <span>{fill(t.upNextBody, { stage: stage < 4 ? (stageContent(stage + 1)?.specialisation ?? '') : t.finale })}</span>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => sendAction(HANDOFF_READY)}>
            {t.ready}
          </button>
        </div>
      )}

      <div className={s.slot} data-testid="support-slot">
        {View ? (
          <Suspense fallback={null}>
            <View />
          </Suspense>
        ) : (
          <div className={ui.card}>
            <p className={ui.muted}>{t.waitingCard}</p>
          </div>
        )}
      </div>
    </main>
  );
}
