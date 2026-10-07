import { useEffect } from 'react';
import { fill } from '../../content';
import { useAnnouncer } from '../screenFocus';
import { groupCopy } from '../../content/groupSchema';
import { useGroup } from '../../net/group';
import s from './Group.module.css';

const t = groupCopy.debrief;

/**
 * Debrief in group mode (§8.3): replaces the solo note with the leaderboard rank reveal. The
 * leader's phone submits; the result is shared, so every phone shows "You're #3 today!".
 */
export function GroupRank() {
  const g = useGroup();
  const session = g.snap.session;
  const r = g.snap.result;
  const text =
    r?.kind === 'ok'
      ? r.rankToday
        ? fill(t.rank, { rank: r.rankToday })
        : t.onBoard
      : r?.kind === 'rejected'
        ? t.notRanked
        : g.connected
          ? t.submitting
          : t.retrying;
  // The rank is spoken once it arrives, through the shared announcer (no second live region).
  const announce = useAnnouncer((a) => a.announce);
  const ranked = r?.kind === 'ok' || r?.kind === 'rejected' ? text : null;
  useEffect(() => {
    if (ranked) announce(ranked);
  }, [ranked, announce]);
  if (!session) return null;
  return (
    <div data-testid="group-rank">
      <p className={s.rankNote}>{fill(t.groupLine, { name: session.name, size: session.sizeAtStart ?? g.members.length })}</p>
      <p className={s.rank} data-ranked={r?.kind === 'ok' || undefined}>
        {r?.kind === 'ok' && <span aria-hidden="true">🏆 </span>}
        {text}
      </p>
    </div>
  );
}
