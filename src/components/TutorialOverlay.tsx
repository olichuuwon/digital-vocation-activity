import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { copy } from '../content';
import s from './components.module.css';

const t = copy.components;

export type Gesture = 'tap' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'drag';

const PATH: Record<Gesture, { x: number[]; y: number[] }> = {
  tap: { x: [0, 0, 0], y: [0, 10, 0] },
  'swipe-right': { x: [-40, 40], y: [0, 0] },
  'swipe-left': { x: [40, -40], y: [0, 0] },
  'swipe-up': { x: [0, 0], y: [30, -30] },
  drag: { x: [-30, 30], y: [-20, 20] },
};

/**
 * Interactive tutorial hint (§2): an animated hand shows the gesture over the real control.
 * The player can do the gesture or tap "Got it". Reduced motion shows a still hand.
 */
export function TutorialOverlay({
  text,
  gesture,
  onDismiss,
  children,
}: {
  text: string;
  gesture: Gesture;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => btnRef.current?.focus(), []);
  const p = PATH[gesture];
  return (
    <section className={s.tutorial} aria-label={t.tutorialLabel}>
      {children}
      <motion.span
        className={s.hand}
        aria-hidden="true"
        animate={reduce ? undefined : { x: p.x, y: p.y }}
        transition={{ duration: 1.1, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut', repeatDelay: 0.3 }}
      >
        👆
      </motion.span>
      <p className={s.body}>{text}</p>
      <button ref={btnRef} type="button" className={`${s.btn} ${s.primary}`} onClick={onDismiss}>
        {t.gotIt}
      </button>
    </section>
  );
}
