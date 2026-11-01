import type { CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { stages } from '../content';
import styles from './PipelineStrip.module.css';

/**
 * Persistent progress through the four teams (§9), drawn as the supply route: one line, four
 * stops. Done = filled stop with a tick; current = ringed stop and bold, underlined name;
 * upcoming = hollow stop. Never colour alone. Stage 5 = all done.
 */
export function PipelineStrip({ stage }: { stage: number }) {
  return (
    <ol className={styles.strip} aria-label="Mission progress">
      {stages.map((s) => {
        const state = s.stage < stage ? 'done' : s.stage === stage ? 'current' : 'upcoming';
        const style = {
          '--c': `var(--${s.discipline})`,
          '--ink': `var(--${s.discipline}-ink)`,
        } as CSSProperties;
        return (
          <li
            key={s.stage}
            className={`${styles.seg} ${styles[state] ?? ''}`}
            style={style}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.track} aria-hidden="true">
              <span className={`${styles.stop} icon-only`}>{state === 'done' && <Icon name="check" size={12} strokeWidth={2.5} />}</span>
            </span>
            <span className={styles.label}>
              {s.short}
              <span className="visually-hidden">
                {state === 'done' ? ', done' : state === 'current' ? ', in progress' : ', not started'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
