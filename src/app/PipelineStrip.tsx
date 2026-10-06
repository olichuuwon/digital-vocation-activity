import type { CSSProperties } from 'react';
import { stages } from '../content';
import styles from './PipelineStrip.module.css';

/** Persistent progress through the four teams (§9). Stage 5 = all done. */
export function PipelineStrip({ stage }: { stage: number }) {
  return (
    <ol className={styles.strip} aria-label="Mission progress">
      {stages.map((s) => {
        const state = s.stage < stage ? 'done' : s.stage === stage ? 'current' : 'upcoming';
        const style = { '--c': `var(--${s.discipline})`, '--ink': `var(--${s.discipline}-ink)` } as CSSProperties;
        return (
          <li
            key={s.stage}
            className={`${styles.seg} ${styles[state] ?? ''}`}
            style={style}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.bar} aria-hidden="true" />
            <span className={styles.label}>
              <span aria-hidden="true">{state === 'done' ? '✓ ' : state === 'current' ? '▶ ' : `${s.icon} `}</span>
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
