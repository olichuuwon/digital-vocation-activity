import { useEffect, useRef, useState } from 'react';
import { useAnnouncer } from '../../app/screenFocus';
import { fill } from '../../content';
import { TEAMS, type Team } from '../../content/finaleSchema';
import { dealCards, sendAction, useGroup, useTopic } from '../../net/group';
import { c as finaleCopy } from '../finale/content';
import { sc } from './content';
import { useBuzzOnChange } from './useBuzz';
import { ALL_HANDS_TAP, ROUTE, S5, s5Schema } from './topics';
import s from './support.module.css';

const ICON: Record<Team, string> = { data: '📊', ai: '🧠', logic: '🧩', cloud: '☁️' };

/**
 * Finale support card (§8.2 group mode): this phone holds some specialisations; when an incident
 * belongs to one, the player shouts and routes it here. "All hands" calls need everyone's tap.
 */
export default function Support5() {
  const g = useGroup();
  const t = useTopic(S5, s5Schema);
  const mine = dealCards<Team>(TEAMS, g.supportCount, g.mySupportIndex);
  const incidentText = t?.incident ? (finaleCopy.incidents[t.incident.id]?.text ?? '') : '';
  useBuzzOnChange(
    t?.incident?.id ?? t?.allHands?.id ?? null,
    t?.allHands ? sc.cards.routing.allHands : `🚨 ${incidentText}`,
    true,
  );
  const tappedMe = !!g.me && !!t?.tapped.includes(g.me.id);
  /** The incident this phone already routed (until the next one arrives). */
  const [sent, setSent] = useState<{ id: string; team: Team } | null>(null);
  const sentHere = sent && t?.incident?.id === sent.id ? sent : null;
  const readyRef = useRef<HTMLButtonElement>(null);
  // An all-hands call lasts 5 s: put the Ready button in view and under the finger/focus.
  useEffect(() => {
    if (!t?.allHands) return;
    readyRef.current?.scrollIntoView({ block: 'nearest' });
    readyRef.current?.focus({ preventScroll: true });
  }, [t?.allHands?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = (team: Team) => {
    if (!t?.incident || sentHere) return;
    sendAction(ROUTE, { team, id: t.incident.id });
    setSent({ id: t.incident.id, team });
    useAnnouncer.getState().announce(fill(sc.cards.routing.sent, { team: finaleCopy.teamButtons[team] }));
  };

  return (
    <section className={s.cards} data-testid="support-routing" data-teams={mine.join(',')}>
      <article className={s.card}>
        <h2 className={s.cardTitle}>{sc.cards.routing.title}</h2>
        {t?.allHands ? (
          <>
            <p className={s.big}>{sc.cards.routing.allHands}</p>
            <button
              ref={readyRef}
              type="button"
              className={s.actionBtn}
              aria-disabled={tappedMe || undefined}
              data-testid="support-all-hands"
              onClick={() => !tappedMe && sendAction(ALL_HANDS_TAP, { id: t.allHands!.id })}
            >
              {tappedMe ? '✓ ' : ''}
              {sc.cards.routing.confirm}
            </button>
          </>
        ) : t?.incident ? (
          <>
            <p className={s.big}>
              <span aria-hidden="true">🚨 </span>
              {incidentText}
            </p>
            <div className={s.grid}>
              {mine.map((team) => (
                <button
                  key={team}
                  type="button"
                  className={s.actionBtn}
                  data-team={team}
                  aria-disabled={!!sentHere || undefined}
                  aria-pressed={sentHere ? sentHere.team === team : undefined}
                  onClick={() => route(team)}
                >
                  <span aria-hidden="true">{sentHere?.team === team ? '✓ ' : `${ICON[team]} `}</span>
                  {finaleCopy.teamButtons[team]}
                </button>
              ))}
            </div>
            {sentHere && <p className={s.row}>{fill(sc.cards.routing.sent, { team: finaleCopy.teamButtons[sentHere.team] })}</p>}
            <p className={s.muted}>{fill(finaleCopy.liveOps.incidentOf, { n: t.incident.n, total: t.incident.total })}</p>
          </>
        ) : (
          <>
            <p className={s.instruction}>{sc.cards.routing.instruction}</p>
            <p className={s.muted}>{sc.cards.routing.waiting}</p>
          </>
        )}
      </article>
    </section>
  );
}
