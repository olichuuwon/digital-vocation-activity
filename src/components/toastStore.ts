import { create } from 'zustand';
import { buzz } from '../app/haptics';
import { useAnnouncer } from '../app/screenFocus';
import { copy } from '../content';

export type Kind = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  kind: Kind;
  /** `spoken` is added to the screen-reader announcement only (e.g. what the next card is). */
  show: (message: string, kind?: Kind, spoken?: string) => void;
  clear: () => void;
}

/** One-line feedback, e.g. "Rule 3: duplicate" (§4.2). Newest replaces the old one. */
export const useToast = create<ToastState>()((set) => ({
  id: 0,
  message: '',
  kind: 'info',
  show: (message, kind = 'info', spoken) => {
    if (kind !== 'info') buzz(kind);
    const prefix = kind === 'success' ? copy.components.toastSuccess : kind === 'error' ? copy.components.toastError : '';
    const said = prefix ? `${prefix} ${message}` : message;
    useAnnouncer.getState().announce(spoken ? `${said} ${spoken}` : said);
    set((st) => ({ id: st.id + 1, message, kind }));
  },
  clear: () => set({ message: '' }),
}));

export const toast = (message: string, kind?: Kind, spoken?: string) => useToast.getState().show(message, kind, spoken);


/** Long enough to read at 200% text: 2.5s minimum, ~70ms per character, ×1.5 when relaxed. */
export function toastMs(message: string, relaxed: boolean): number {
  return Math.max(2500, message.length * 70) * (relaxed ? 1.5 : 1);
}
