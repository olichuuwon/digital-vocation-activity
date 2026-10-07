import { useState } from 'react';
import { useScreenHeading } from '../../app/screenFocus';
import { c } from './content';
import s from './data.module.css';
import ui from '../../components/components.module.css';

type OptionId = keyof typeof c.automate.options;

/** §4.3: after the Reality Check, one tap to choose the rule to automate. Correct = bonus. */
export function Automate({
  options,
  onDone,
}: {
  options: { id: string; correct: boolean }[];
  onDone: (pickedId: string) => void;
}) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(c.automate.question);
  const [picked, setPicked] = useState<{ id: string; correct: boolean } | null>(null);
  return (
    <section className={ui.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {c.automate.question}
      </h1>
      <div className={s.choices}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={s.option}
            style={{ fontFamily: 'inherit' }}
            aria-pressed={picked?.id === o.id}
            disabled={picked !== null && picked.id !== o.id}
            onClick={() => !picked && setPicked(o)}
          >
            {picked?.id === o.id && <span aria-hidden="true">{o.correct ? '✓ ' : '✗ '}</span>}
            {c.automate.options[o.id as OptionId] ?? o.id}
          </button>
        ))}
      </div>
      <p role="status" className={ui.body}>
        {picked ? (picked.correct ? c.automate.right : c.automate.wrong) : ''}
      </p>
      {picked && (
        <div className={ui.actions}>
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => onDone(picked.id)}>
            Continue
          </button>
        </div>
      )}
    </section>
  );
}
