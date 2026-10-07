import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useToast, type Kind } from './toastStore';
import s from './components.module.css';

const ICON: Record<Kind, string> = { success: '✓', error: '✗', info: 'ℹ︎' };
const SHOW_MS = 2500;

export function ToastHost() {
  const { id, message, kind, clear } = useToast();
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(clear, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [id, message, clear]);

  return (
    <div className={s.toastHost} role="status" aria-live="polite">
      <AnimatePresence>
        {message && (
          <motion.p
            key={id}
            className={s.toast}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span aria-hidden="true">{ICON[kind]} </span>
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
