import { groupActions, useGroup, useGroupStore } from '../../net/group';
import s from './Group.module.css';

/**
 * ?debug=1&fakePeers=N: this phone plays the main phone for every stage (the bots can't play).
 * Preview the waiting screen, or cut this phone's connection to see the pill.
 * Developer-only: plain text, not in content files.
 */
export function GroupDebugBar() {
  const g = useGroup();
  const viewAs = useGroupStore((x) => x.viewAs);
  const puppets = useGroupStore((x) => x.puppets);
  if (!puppets.length || !g.active) return null;
  return (
    <div className={s.debugBar} aria-label="Fake peers debug">
      <button type="button" aria-pressed={viewAs === null} onClick={() => groupActions.setViewAs(null)}>
        Main
      </button>
      <button type="button" aria-pressed={viewAs !== null} onClick={() => groupActions.setViewAs(0)}>
        Waiting
      </button>
      <button type="button" aria-pressed={!g.connected} onClick={() => groupActions.debugDisconnect(g.connected)}>
        {g.connected ? 'Go offline' : 'Go online'}
      </button>
    </div>
  );
}
