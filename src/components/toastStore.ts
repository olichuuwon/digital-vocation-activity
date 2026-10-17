import { create } from 'zustand';
import { buzz } from '../app/haptics';
import { onScreenChange, useAnnouncer } from '../app/screenFocus';
import { copy } from '../content';

export type Kind = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  /** When the current toast appeared (ms). */
  at: number;
  message: string;
  kind: Kind;
  /** `spoken` is added to the screen-reader announcement only (e.g. what the next card is). */
  show: (message: string, kind?: Kind, spoken?: string) => void;
  clear: () => void;
}

/** One-line feedback, e.g. "Rule 3: duplicate" (§4.2). Newest replaces the old one. */
export const useToast = create<ToastState>()((set) => ({
  id: 0,
  at: 0,
  message: '',
  kind: 'info',
  show: (message, kind = 'info', spoken) => {
    if (kind !== 'info') buzz(kind);
    const prefix = kind === 'success' ? copy.components.toastSuccess : kind === 'error' ? copy.components.toastError : '';
    const said = prefix ? `${prefix} ${message}` : message;
    useAnnouncer.getState().announce(spoken ? `${said} ${spoken}` : said);
    set((st) => ({ id: st.id + 1, at: Date.now(), message, kind }));
  },
  clear: () => set({ message: '' }),
}));

export const toast = (message: string, kind?: Kind, spoken?: string) => useToast.getState().show(message, kind, spoken);

/**
 * A new screen clears feedback left over from the last one, so a toast never covers the next
 * screen's heading or buttons. One that has only just appeared (e.g. "Time's up!", shown as a
 * level ends) is kept long enough to read.
 */
onScreenChange(() => {
  const st = useToast.getState();
  if (st.message && Date.now() - st.at > 600) st.clear();
});


/** Long enough to read at 200% text: 2.5s minimum, ~70ms per character, ×1.5 when relaxed. */
export function toastMs(message: string, relaxed: boolean): number {
  return Math.max(2500, message.length * 70) * (relaxed ? 1.5 : 1);
}
