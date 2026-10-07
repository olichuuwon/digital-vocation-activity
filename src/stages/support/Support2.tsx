import { fill } from '../../content';
import { LABELS } from '../../content/stage2Schema';
import { sendAction, useTopic } from '../../net/group';
import { c as aiCopy } from '../ai/content';
import { sc } from './content';
import { SupportCards } from './SupportCards';
import { useBuzzOnChange } from './useBuzz';
import { REVEAL, S2, s2Schema } from './topics';
import s from './support.module.css';

/** Stage 2 support cards: Reveal power, Field guide, Auditor (§3.5.2). */
export default function Support2() {
  const t = useTopic(S2, s2Schema);
  useBuzzOnChange(t?.audit ?? null);
  const canReveal = t?.level === 'covered' && (t.charges ?? 0) > 0;
  return (
    <SupportCards
      stage={2}
      render={{
        reveal:
          t?.level === 'covered' ? (
            <>
              <button
                type="button"
                className={s.actionBtn}
                aria-disabled={!canReveal || undefined}
                onClick={() => canReveal && sendAction(REVEAL)}
                data-testid="support-reveal"
              >
                <span aria-hidden="true">👁️ </span>
                {sc.cards.reveal.button}
              </button>
              <p className={s.muted}>{canReveal ? fill(sc.cards.reveal.left, { n: t.charges ?? 0 }) : sc.cards.reveal.none}</p>
            </>
          ) : (
            <p className={s.muted}>{sc.common.waiting}</p>
          ),
        fieldGuide: (
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LABELS.map((l) => (
              <div key={l}>
                <dt style={{ fontWeight: 800 }}>{aiCopy.labels[l]}</dt>
                <dd style={{ margin: 0 }}>{aiCopy.fieldGuide.entries[l]}</dd>
              </div>
            ))}
          </dl>
        ),
        auditor: t?.audit ? (
          <p className={s.big} data-testid="support-audit">
            {fill(sc.cards.auditor.confidence, { label: t.audit.predicted, pct: t.audit.pct })}
          </p>
        ) : (
          <p className={s.muted}>{sc.cards.auditor.none}</p>
        ),
      }}
    />
  );
}
