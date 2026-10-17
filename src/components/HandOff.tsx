import { useEffect, type CSSProperties } from 'react';
import { useScreenHeading } from '../app/screenFocus';
import { copy, fill } from '../content';
import type { StageContent } from '../content/schemas';
import { groupActions, useGroup, useHandOff, useHandOffSync } from '../net/group';
import type { Stage } from '../state/types';
import s from './components.module.css';

const t = copy.components;

/**
 * Between stages in a team (§2, §3.5.2): names the next player (nickname stays on the device).
 * Only the next player starts their turn, from their own phone ("You're up next" → I'm ready);
 * this card just waits. If their phone isn't connected, a fallback lets this phone play their
 * turn so the game never gets stuck. Solo there's nobody to hand to, so it continues straight to
 * the next stage's briefing (`demo` forces the card, for /dev/components).
 */
export function HandOff({ stage, nextName: demoName, onReady, demo = false }: { stage: StageContent; nextName?: string; onReady: () => void; demo?: boolean }) {
  const view = useGroup();
  const inTeam = view.active;
  const skip = !inTeam && !demo;
  useEffect(() => {
    if (skip) onReady();
  }, [skip]); // eslint-disable-line react-hooks/exhaustive-deps
  // `stage` is the next stage, so the hand-off is from the stage before it.
  const from = (stage.stage - 1) as Stage;
  const group = useHandOff(from);
  // This phone can start the next stage only when it's this phone's turn (or a lone/demo card).
  const mine = !inTeam || !group.nextId || group.nextIsMe;
  const nextPresent = !group.nextId || view.members.some((m) => m.id === group.nextId && m.present);
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
        {mine ? (
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={onReady}>
            {t.ready}
          </button>
        ) : (
          <>
            <p className={s.handoffWaiting} data-testid="handoff-waiting" role="status">
              <span aria-hidden="true">⏳ </span>
              {fill(t.handoffWaiting, { name: nextName ?? '' })}
            </p>
            {!nextPresent && (
              <button
                type="button"
                className={s.btn}
                data-testid="handoff-takeover"
                onClick={() => {
                  groupActions.claim(stage.stage as Stage);
                  onReady();
                }}
              >
                {fill(t.handoffTakeOver, { name: nextName ?? '' })}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
