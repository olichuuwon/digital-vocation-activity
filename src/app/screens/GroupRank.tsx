import { fill } from '../../content';
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
  if (!session) return null;
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
  return (
    <div data-testid="group-rank">
      <p className={s.rankNote}>{fill(t.groupLine, { name: session.name, size: session.sizeAtStart ?? g.members.length })}</p>
      <p className={s.rank} role="status" aria-live="polite" data-ranked={r?.kind === 'ok' || undefined}>
        {r?.kind === 'ok' && <span aria-hidden="true">🏆 </span>}
        {text}
      </p>
    </div>
  );
}
