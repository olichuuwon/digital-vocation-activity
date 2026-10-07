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
  useBuzzOnChange(t?.incident?.id ?? t?.allHands?.id ?? null);
  const tappedMe = !!g.me && !!t?.tapped.includes(g.me.id);
  return (
    <section className={s.cards} data-testid="support-routing" data-teams={mine.join(',')}>
      <article className={s.card}>
        <h2 className={s.cardTitle}>{sc.cards.routing.title}</h2>
        <p className={s.instruction}>{sc.cards.routing.instruction}</p>
        {t?.allHands ? (
          <>
            <p className={s.big}>{sc.cards.routing.allHands}</p>
            <button
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
              {finaleCopy.incidents[t.incident.id]?.text}
            </p>
            <div className={s.grid}>
              {mine.map((team) => (
                <button key={team} type="button" className={s.actionBtn} data-team={team} onClick={() => sendAction(ROUTE, { team, id: t.incident!.id })}>
                  <span aria-hidden="true">{ICON[team]} </span>
                  {finaleCopy.teamButtons[team]}
                </button>
              ))}
            </div>
            <p className={s.muted}>{fill(finaleCopy.liveOps.incidentOf, { n: t.incident.n, total: t.incident.total })}</p>
          </>
        ) : (
          <p className={s.muted}>{sc.cards.routing.waiting}</p>
        )}
      </article>
    </section>
  );
}
