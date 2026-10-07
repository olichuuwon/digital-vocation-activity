import { AnimatePresence, m } from 'framer-motion';
import { useEffect } from 'react';
import { useRelaxed } from '../state/store';
import { toastMs, useToast, type Kind } from './toastStore';
import s from './components.module.css';

const ICON: Record<Kind, string> = { success: '✓', error: '✗', info: 'ℹ︎' };

export function ToastHost() {
  const { id, message, kind, clear } = useToast();
  const relaxed = useRelaxed();
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(clear, toastMs(message, relaxed));
    return () => window.clearTimeout(timer);
  }, [id, message, clear, relaxed]);

  return (
    <div className={s.toastHost} aria-hidden="true">
      <AnimatePresence>
        {message && (
          <m.p
            key={id}
            className={s.toast}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span aria-hidden="true">{ICON[kind]} </span>
            {message}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
