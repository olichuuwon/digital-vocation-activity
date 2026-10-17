import { useEffect, type CSSProperties } from 'react';
import { useScreenHeading } from '../app/screenFocus';
import { copy, fill } from '../content';
import type { StageContent } from '../content/schemas';
import { useGroup, useHandOff, useHandOffSync } from '../net/group';
import type { Stage } from '../state/types';
import s from './components.module.css';

const t = copy.components;

/**
 * Between stages in a team (§2, §3.5.2): names the next player (nickname stays on the device),
 * whose own phone shows "You're up next" + I'm ready. Solo there's nobody to hand to, so it
 * continues straight to the next stage's briefing (`demo` forces the card, for /dev/components).
 */
export function HandOff({ stage, nextName: demoName, onReady, demo = false }: { stage: StageContent; nextName?: string; onReady: () => void; demo?: boolean }) {
  const inTeam = useGroup().active;
  const skip = !inTeam && !demo;
  useEffect(() => {
    if (skip) onReady();
  }, [skip]); // eslint-disable-line react-hooks/exhaustive-deps
  // Group mode: `stage` is the next team, so the hand-off is from the stage before it. The next
  // main player's phone shows "You're up next" with a Ready button (§2); either Ready continues.
  const from = (stage.stage - 1) as Stage;
  const group = useHandOff(from);
  const nextName = demoName ?? group.nextName;
  useHandOffSync(true, onReady, from);
  const heading = nextName ? t.handoffHeading : t.handoffSoloHeading;
  const headingRef = useScreenHeading<HTMLHeadingElement>(heading);
  const style = { '--c': `var(--${stage.discipline})`, '--ink': `var(--${stage.discipline}-ink)` } as CSSProperties;
  if (skip) return null;
  return (
    <section className={s.screen} style={style}>
      <div className={s.briefing}>
        <span className={s.bigIcon} aria-hidden="true">
          {stage.icon}
        </span>
        <h1 ref={headingRef} tabIndex={-1}>
          {heading}
        </h1>
        <p className={s.body}>
          {nextName
            ? fill(t.handoffBody, { name: nextName, stage: stage.specialisation })
            : fill(t.handoffSoloBody, { stage: stage.specialisation })}
        </p>
      </div>
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={onReady}>
          {t.ready}
        </button>
      </div>
    </section>
  );
}
