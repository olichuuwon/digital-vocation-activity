import { useEffect, useState } from 'react';
import { groupCopy } from '../../content/groupSchema';
import { useGroup } from '../../net/group';
import s from './Group.module.css';

/**
 * Small "Reconnecting…" pill (§3.5.6) while a group phone is offline. Play carries on
 * locally; a queued score submission says it will be sent later. Shown after a 1.5 s grace
 * period so a quick blip doesn't flash it.
 */
export function GroupPill() {
  const g = useGroup();
  const offline = g.inGroup && g.status !== 'joining' && !g.connected;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!offline) return;
    const id = setTimeout(() => setShow(true), 1500);
    return () => {
      clearTimeout(id);
      setShow(false);
    };
  }, [offline]);
  if (!offline || !show) return null;
  return (
    <div className={s.pill} role="status" data-testid="reconnecting">
      {g.snap.submitting ? groupCopy.pill.sending : groupCopy.pill.reconnecting}
    </div>
  );
}
