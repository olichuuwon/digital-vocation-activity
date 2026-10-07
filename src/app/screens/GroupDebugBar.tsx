import { groupActions, useGroup, useGroupStore } from '../../net/group';
import s from './Group.module.css';

/**
 * ?debug=1&fakePeers=N: this phone plays the main phone for every stage (the bots can't play).
 * Preview the support screen as any support, or cut this phone's connection to see the pill.
 * Developer-only: plain text, not in content files.
 */
export function GroupDebugBar() {
  const g = useGroup();
  const viewAs = useGroupStore((x) => x.viewAs);
  const puppets = useGroupStore((x) => x.puppets);
  if (!puppets.length || !g.active) return null;
  const supports = g.snap.session ? Math.max(0, g.members.length - 1) : 0;
  return (
    <div className={s.debugBar} aria-label="Fake peers debug">
      <button type="button" aria-pressed={viewAs === null} onClick={() => groupActions.setViewAs(null)}>
        Main
      </button>
      {Array.from({ length: supports }, (_, i) => (
        <button key={i} type="button" aria-pressed={viewAs === i} onClick={() => groupActions.setViewAs(i)}>
          Support {i + 1}
        </button>
      ))}
      <button type="button" aria-pressed={!g.connected} onClick={() => groupActions.debugDisconnect(g.connected)}>
        {g.connected ? 'Go offline' : 'Go online'}
      </button>
    </div>
  );
}
