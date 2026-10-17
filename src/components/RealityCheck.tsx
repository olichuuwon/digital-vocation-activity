import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useScreenHeading } from '../app/screenFocus';
import { copy, fill } from '../content';
import { REALITY_DEFAULTS, type RealityCheckContent, type RealityVars, type RealityVisual } from '../content/schemas';
import { RealityVisualView } from './RealityVisuals';
import s from './components.module.css';
import { useToast } from './toastStore';
import { useRelaxed } from '../state/store';

const t = copy.components;

/**
 * "Aha" reveal (§1 goal 3, §2): the stage's key learning points, one card at a time. No skipping:
 * every card is shown, and Next unlocks after a short read time (READ_MS, ×1.5 relaxed).
 * `vars` fills `{name}` placeholders and feeds the visuals (e.g. handCleaned). `visuals` swaps
 * in a stage's own animation for a card (e.g. the player's blocks as Python). `kicker` is the
 * small label above the heading ("Reality Check" by default).
 */
export const READ_MS = 1200;
export function RealityCheck({
  check,
  onDone,
  vars: given = {},
  visuals,
  kicker = t.realityCheck,
}: {
  kicker?: string;
  check: RealityCheckContent;
  onDone: () => void;
  vars?: Partial<RealityVars>;
  visuals?: Partial<Record<RealityVisual, ReactNode>>;
}) {
  const vars: RealityVars = { ...REALITY_DEFAULTS, ...given };
  const [i, setI] = useState(0);
  const relaxed = useRelaxed();
  // Each card gets a moment on screen before Next works, so the learning point is seen.
  const [readyAt, setReadyAt] = useState(-1);
  useEffect(() => {
    const id = setTimeout(() => setReadyAt(i), READ_MS * (relaxed ? 1.5 : 1));
    return () => clearTimeout(id);
  }, [i, relaxed]);
  const ready = readyAt === i;
  // A toast from the last level would cover the heading: start the reveal clean.
  useEffect(() => useToast.getState().clear(), []);
  const headingRef = useScreenHeading<HTMLHeadingElement>(check.heading);
  const card = check.cards[i]!;
  const last = i === check.cards.length - 1;
  const next = () => {
    if (!ready) return;
    if (last) onDone();
    else setI(i + 1);
  };

  return (
    <section className={s.screen}>
      <p className={s.muted} aria-hidden="true">
        💡 {kicker}
      </p>
      <h1 ref={headingRef} tabIndex={-1}>
        {check.heading}
      </h1>
      <AnimatePresence mode="wait">
        <m.div
          key={i}
          className={s.reality}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          data-testid="reality-card"
        >
          <div className={s.visual} aria-hidden={visuals?.[card.visual] ? undefined : true}>
            {visuals?.[card.visual] ?? <RealityVisualView visual={card.visual} vars={vars} />}
          </div>
          {card.title && <h2>{fill(card.title, vars)}</h2>}
          <p className={s.body}>{fill(card.body, vars)}</p>
        </m.div>
      </AnimatePresence>
      {/* Persistent region outside AnimatePresence: a region that mounts already filled isn't read. */}
      <p aria-live="polite" className="visually-hidden">
        {i > 0 &&
          `${fill(t.cardOf, { n: i + 1, total: check.cards.length })}. ${card.title ? `${fill(card.title, vars)}. ` : ''}${fill(card.body, vars)}`}
      </p>
      {check.cards.length > 1 && (
        <div className={s.dots} aria-hidden="true">
          {check.cards.map((_, n) => (
            <span key={n} className={`${s.dot} ${n === i ? s.dotOn : ''}`} />
          ))}
        </div>
      )}
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={next} disabled={!ready} data-testid="reality-next">
          {last ? t.continue : t.next}
        </button>
      </div>
    </section>
  );
}
