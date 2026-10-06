import { useState } from 'react';
import { copy } from '../../content';
import { useGame } from '../../state/store';
import type { Mode } from '../../state/types';
import { useScreenHeading } from '../screenFocus';
import ui from '../ui.module.css';

const t = copy.home;
const l = copy.length;

/** Entry screen (§3.5.1). Group play and the leaderboard arrive in M0.5/M6.5. */
export function Home({ facilitatorMode, onEnter }: { facilitatorMode: Mode | null; onEnter: () => void }) {
  const hasRun = useGame((s) => s.run !== null);
  const startRunInStore = useGame((s) => s.startRun);
  const startRun = (mode: Mode) => {
    startRunInStore(mode);
    onEnter();
  };
  const [picking, setPicking] = useState(false);
  const headingRef = useScreenHeading<HTMLHeadingElement>(picking ? l.heading : t.title);

  const playSolo = () => (facilitatorMode ? startRun(facilitatorMode) : setPicking(true));

  if (picking) {
    return (
      <main className={ui.screen}>
        <h1 className={ui.hero} ref={headingRef} tabIndex={-1}>
          {l.heading}
        </h1>
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => startRun('booth')}>
            {l.booth} <span className={ui.detail}>{l.boothDetail}</span>
          </button>
          <button type="button" className={ui.btn} onClick={() => startRun('full')}>
            {l.full} <span className={ui.detail}>{l.fullDetail}</span>
          </button>
          <button type="button" className={ui.btn} onClick={() => setPicking(false)}>
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={ui.screen}>
      <div className={ui.hero}>
        <h1 ref={headingRef} tabIndex={-1}>
          {t.title}
        </h1>
        <p className={ui.muted}>{t.tagline}</p>
      </div>
      <div className={ui.actions}>
        {hasRun && (
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={onEnter}>
            {t.resume}
          </button>
        )}
        <button type="button" className={`${ui.btn} ${hasRun ? '' : ui.primary}`} onClick={playSolo}>
          {hasRun ? t.newRun : t.playSolo}
        </button>
        <button type="button" className={ui.btn} aria-disabled="true">
          {t.createGroup} <span className={ui.detail}>{t.comingSoon}</span>
        </button>
        <button type="button" className={ui.btn} aria-disabled="true">
          {t.joinGroup} <span className={ui.detail}>{t.comingSoon}</span>
        </button>
        <button type="button" className={ui.btn} aria-disabled="true">
          {t.leaderboard} <span className={ui.detail}>{t.comingSoon}</span>
        </button>
      </div>
    </main>
  );
}
