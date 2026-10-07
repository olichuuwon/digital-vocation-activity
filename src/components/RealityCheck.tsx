import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { useScreenHeading } from '../app/screenFocus';
import { copy, fill } from '../content';
import { REALITY_DEFAULTS, type RealityCheckContent, type RealityVars, type RealityVisual } from '../content/schemas';
import { RealityVisualView } from './RealityVisuals';
import s from './components.module.css';

const t = copy.components;

/**
 * "Aha" reveal (§1 goal 3, §2): a few cards, tap anywhere on the card or Next to advance,
 * Skip to leave. `vars` fills `{name}` placeholders and feeds the visuals (e.g. handCleaned).
 * `visuals` swaps in a stage's own animation for a card (e.g. the player's blocks as Python).
 */
export function RealityCheck({
  check,
  onDone,
  vars: given = {},
  visuals,
}: {
  check: RealityCheckContent;
  onDone: () => void;
  vars?: Partial<RealityVars>;
  visuals?: Partial<Record<RealityVisual, ReactNode>>;
}) {
  const vars: RealityVars = { ...REALITY_DEFAULTS, ...given };
  const [i, setI] = useState(0);
  const headingRef = useScreenHeading<HTMLHeadingElement>(check.heading);
  const card = check.cards[i]!;
  const last = i === check.cards.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));

  return (
    <section className={s.screen}>
      <p className={s.muted} aria-hidden="true">
        💡 Reality Check
      </p>
      <h1 ref={headingRef} tabIndex={-1}>
        {check.heading}
      </h1>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          className={s.reality}
          onClick={next}
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
        </motion.div>
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
      <div className={`${s.actions} ${s.row}`}>
        {!last && (
          <button type="button" className={s.btn} onClick={onDone}>
            {t.skip}
          </button>
        )}
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={next}>
          {last ? t.continue : t.next}
        </button>
      </div>
    </section>
  );
}
