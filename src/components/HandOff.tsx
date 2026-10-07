import type { CSSProperties } from 'react';
import { useScreenHeading } from '../app/screenFocus';
import { copy, fill } from '../content';
import type { StageContent } from '../content/schemas';
import { useHandOff, useHandOffSync } from '../net/group';
import type { Stage } from '../state/types';
import s from './components.module.css';

const t = copy.components;

/**
 * Between stages (§2, §3.5.2). In a group, the main-player role rotates: name the next main
 * player (nickname stays on the device). Solo: just name the next team. One "Ready" tap.
 */
export function HandOff({ stage, nextName: demoName, onReady }: { stage: StageContent; nextName?: string; onReady: () => void }) {
  // Group mode: `stage` is the next team, so the hand-off is from the stage before it. The next
  // main player's phone shows "You're up next" with a Ready button (§2); either Ready continues.
  const from = (stage.stage - 1) as Stage;
  const group = useHandOff(from);
  const nextName = demoName ?? group.nextName;
  useHandOffSync(true, onReady, from);
  const heading = nextName ? t.handoffHeading : t.handoffSoloHeading;
  const headingRef = useScreenHeading<HTMLHeadingElement>(heading);
  const style = { '--c': `var(--${stage.discipline})`, '--ink': `var(--${stage.discipline}-ink)` } as CSSProperties;
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
