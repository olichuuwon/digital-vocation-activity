import type { CSSProperties } from 'react';
import { useScreenHeading } from '../app/screenFocus';
import type { Briefing, StageContent } from '../content/schemas';
import s from './components.module.css';

/** Stage intro (§2 rhythm): ≤25 words and one button, so there's an action within 5 seconds. */
export function BriefingCard({ briefing, stage, onGo }: { briefing: Briefing; stage: StageContent; onGo: () => void }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(briefing.heading);
  const style = { '--c': `var(--${stage.discipline})`, '--ink': `var(--${stage.discipline}-ink)` } as CSSProperties;
  return (
    <section className={s.screen} style={style}>
      <div className={s.briefing}>
        <span className={s.bigIcon} aria-hidden="true">
          {stage.icon}
        </span>
        <span className={s.tag}>{stage.specialisation}</span>
        <h1 ref={headingRef} tabIndex={-1}>
          {briefing.heading}
        </h1>
        <p className={s.body}>{briefing.body}</p>
      </div>
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={onGo}>
          {briefing.go}
        </button>
      </div>
    </section>
  );
}
