import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useAnnouncer, useScreenHeading } from '../app/screenFocus';
import { copy, fill } from '../content';
import type { StarCount } from '../state/types';
import s from './components.module.css';

const t = copy.components;

/** Stage result (§3.3): 0–3 stars. Filled ★ vs outline ☆, so stars don't rely on colour. */
export function StarResult({
  stars,
  heading,
  lines = [],
  onContinue,
}: {
  stars: StarCount;
  heading: string;
  lines?: string[];
  onContinue: () => void;
}) {
  const headingRef = useScreenHeading<HTMLHeadingElement>(heading);
  const announce = useAnnouncer((a) => a.announce);
  const label = fill(t.starsLabel, { n: stars });
  useEffect(() => announce(label), [announce, label]);

  return (
    <section className={s.screen}>
      <h1 ref={headingRef} tabIndex={-1}>
        {heading}
      </h1>
      <p className="visually-hidden">{label}</p>
      <div className={s.stars} aria-hidden="true" data-testid="stars">
        {[1, 2, 3].map((n) => (
          <motion.span
            key={n}
            className={n <= stars ? s.starOn : s.starOff}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 * n, type: 'spring', stiffness: 400, damping: 15 }}
          >
            {n <= stars ? '★' : '☆'}
          </motion.span>
        ))}
      </div>
      {lines.length > 0 && (
        <ul className={s.lines}>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={onContinue}>
          {t.continue}
        </button>
      </div>
    </section>
  );
}
