import { useScreenHeading } from '../app/screenFocus';
import ui from '../app/ui.module.css';
import { bonusCount, copy, fill, stages } from '../content';
import type { Stage } from '../state/types';
import { Icon } from './Icon';

const t = copy.replay;

/**
 * Free play (§8.3): pick a stage to replay after a finished run. Replays unlock the bonus
 * levels, and each stage says how many it adds. Used from Home and from the debrief (callers
 * supply the <main> landmark).
 */
export function ReplayPicker({ onPick, onBack, backLabel }: { onPick: (stage: Stage) => void; onBack: () => void; backLabel: string }) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(t.heading);
  return (
    <section className={ui.screen} data-testid="replay-picker">
      <h1 className={ui.hero} ref={headingRef} tabIndex={-1}>
        {t.heading}
      </h1>
      <p className={ui.muted}>
        <Icon name="unlock" /> 
        {t.intro}
      </p>
      <div className={ui.actions}>
        {stages.map((st) => {
          const n = bonusCount(st);
          return (
            <button key={st.stage} type="button" className={ui.btn} onClick={() => onPick(st.stage as Stage)}>
              <Icon name={st.icon} />
              {st.stage}. {st.title}
              {n > 0 && <span className={ui.detail}>{n === 1 ? t.bonusOne : fill(t.bonusMany, { n })}</span>}
            </button>
          );
        })}
        <button type="button" className={ui.btn} onClick={onBack}>
          <Icon name="back" />
          {backLabel}
        </button>
      </div>
    </section>
  );
}
