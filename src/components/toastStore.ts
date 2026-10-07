import { create } from 'zustand';
import { buzz } from '../app/haptics';

export type Kind = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  kind: Kind;
  show: (message: string, kind?: Kind) => void;
  clear: () => void;
}

/** One-line feedback, e.g. "Rule 3: duplicate" (§4.2). Newest replaces the old one. */
export const useToast = create<ToastState>()((set) => ({
  id: 0,
  message: '',
  kind: 'info',
  show: (message, kind = 'info') => {
    if (kind !== 'info') buzz(kind);
    set((st) => ({ id: st.id + 1, message, kind }));
  },
  clear: () => set({ message: '' }),
}));

export const toast = (message: string, kind?: Kind) => useToast.getState().show(message, kind);

