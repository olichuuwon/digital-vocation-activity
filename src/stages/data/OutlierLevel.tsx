import { useState } from 'react';
import type { OutlierChart } from '../../content/stage1Schema';
import { c } from './content';
import s from './data.module.css';

/**
 * Bonus L3 "Spot the Outlier" (§4.2): 20 households as horizontal bars. Tap the errors
 * (rule 2: impossible), leave unusual-but-possible values alone (rule 5), then Done.
 */
export function OutlierBoard({
  chart,
  disabled,
  onDone,
  labelledBy,
}: {
  chart: OutlierChart;
  disabled?: boolean;
  onDone: (tapped: number[]) => void;
  /** id of the level's h1, which names the chart. */
  labelledBy: string;
}) {
  const [tapped, setTapped] = useState<number[]>([]);
  const max = Math.max(...chart.bars.map((b) => Math.abs(b.value)), 1);
  const unit = chart.measure === 'people' ? c.outlier.unitPeople : c.outlier.unitWater;
  const toggle = (i: number) => setTapped((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]));
  return (
    <section aria-labelledby={labelledBy} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ul className={s.chart} role="list">
        {chart.bars.map((b, i) => {
          const on = tapped.includes(i);
          return (
            <li key={`${b.household}-${i}`}>
              <button
                type="button"
                className={s.bar}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(i)}
                data-testid="outlier-bar"
              >
                <span>{b.household}</span>
                <span className={s.barTrack} aria-hidden="true">
                  <span className={s.barFill} style={{ width: `${Math.max(2, (Math.abs(b.value) / max) * 100)}%` }} />
                </span>
                <span className={s.barValue}>
                  {b.value}
                  <span className="visually-hidden"> {unit}</span>
                  {on && (
                    <span className={s.flag} aria-hidden="true">
                      {' '}
                      ✗
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={s.doneBar}>
        <button type="button" className={s.action} style={{ width: '100%' }} disabled={disabled} onClick={() => onDone(tapped)}>
          {c.outlier.done}
        </button>
      </div>
    </section>
  );
}
