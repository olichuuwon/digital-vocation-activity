import { groupCopy } from '../../content/groupSchema';
import type { EndReason } from '../../net/group/engine';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

const t = groupCopy.ended;
const text: Record<EndReason, string> = { closed: t.closed, lobbyExpired: t.lobbyExpired, runExpired: t.runExpired, left: t.left };

/** The group ended (closed by the leader, lobby or run expired). One tap back to Home. */
export function GroupEnded({ reason, onOk }: { reason: EndReason; onOk: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(text[reason]);
  return (
    <main className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: '1.5rem' }}>
        {text[reason]}
      </h1>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onOk}>
          {t.ok}
        </button>
      </div>
    </main>
  );
}
