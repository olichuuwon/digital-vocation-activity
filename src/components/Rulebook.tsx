import { useEffect, useRef, useState } from 'react';
import { copy, rulebook } from '../content';
import type { Rule } from '../content/schemas';
import s from './components.module.css';

const t = copy.components;

function RuleItem({ rule, isNew }: { rule: Rule; isNew: boolean }) {
  return (
    <li className={`${s.rule} ${isNew ? s.ruleNew : ''}`} data-testid="rule">
      <p className={s.ruleTitle}>
        <span>
          {rule.id}. {rule.title}
        </span>
        {isNew && <span className={s.newTag}>{t.newRule}</span>}
      </p>
      <p className={s.muted}>{rule.body}</p>
      {rule.examples.length > 0 && (
        <ul className={s.examples} role="list">
          {rule.examples.map((e) => (
            <li key={e.before}>
              {e.before} <span aria-hidden="true">→</span>
              <span className="visually-hidden">becomes</span> {e.after}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The one new rule, shown as a card before a level (§4.1). */
export function NewRuleCard({ ruleId }: { ruleId: number }) {
  const rule = rulebook.rules.find((r) => r.id === ruleId);
  if (!rule) return null;
  return (
    <ul className={s.rules} role="list" aria-label={t.newRule}>
      <RuleItem rule={rule} isNew />
    </ul>
  );
}

/**
 * Pinned "📘 Rulebook" button + bottom sheet (§4.1). Native <dialog> gives focus trapping and Esc.
 * `rulesInPlay` limits the list to the rules unlocked so far.
 */
export function RulebookButton({ rulesInPlay, newRuleId }: { rulesInPlay: number[]; newRuleId?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  const rules = rulebook.rules.filter((r) => rulesInPlay.includes(r.id));

  return (
    <>
      <button type="button" className={s.rulebookBtn} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">📘 </span>
        {t.rulebook}
      </button>
      <dialog ref={ref} className={s.sheet} aria-labelledby="rulebook-heading" onClose={() => setOpen(false)}>
        <div className={s.sheetHead}>
          <h2 id="rulebook-heading">{rulebook.heading}</h2>
          <button type="button" className={s.btn} onClick={() => setOpen(false)}>
            {t.close}
          </button>
        </div>
        <ul className={s.rules} role="list" aria-label={t.rulesInPlay}>
          {rules.map((r) => (
            <RuleItem key={r.id} rule={r} isNew={r.id === newRuleId} />
          ))}
        </ul>
        <button
          type="button"
          className={`${s.btn} ${s.primary}`}
          style={{ width: '100%', marginTop: 16 }}
          onClick={() => setOpen(false)}
        >
          {t.close}
        </button>
      </dialog>
    </>
  );
}
