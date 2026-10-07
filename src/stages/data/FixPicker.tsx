import { useEffect, useRef } from 'react';
import type { DataRecord } from '../../content/stage1Schema';
import { c } from './content';
import s from './data.module.css';

/** Quick-fix picker (§4.2 L2): 2–3 options for the field that needs fixing. */
export function FixPicker({
  record,
  onPick,
  onCancel,
}: {
  record: DataRecord;
  onPick: (option: number) => void;
  onCancel: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  // Only shown for fixable records; Fix on any other card is judged straight away.
  const field = record.fix?.field ?? 'sector';
  const options = record.fix?.options ?? [];
  return (
    <section className={s.picker} aria-labelledby="fix-heading">
      <h2 id="fix-heading" ref={headingRef} tabIndex={-1}>
        {c.fixPrompt}
      </h2>
      <p style={{ margin: 0 }}>
        {c.fieldLabels[field]}: <strong>{field === 'water' && record.water ? `${record.water.value} ${record.water.unit}` : (record.sector ?? c.fieldLabels.missing)}</strong>
      </p>
      {options.map((o, i) => (
        <button key={o} type="button" className={s.option} onClick={() => onPick(i)}>
          {o}
        </button>
      ))}
      <button type="button" className={s.action} onClick={onCancel}>
        <span aria-hidden="true">←</span> Back
      </button>
    </section>
  );
}
