import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/** Shared polite live region (§10). Stages push result text with `announce()`. */
export const useAnnouncer = create<{ message: string; announce: (m: string) => void }>()((set) => ({
  message: '',
  announce: (message) => set({ message }),
}));

let firstScreen = true;

/**
 * Sets the tab title and, after the first screen, moves focus to the screen heading so
 * screen-reader users hear where they are when a screen swaps (WCAG 2.4.3).
 */
export function useScreenHeading<T extends HTMLElement>(title: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    document.title = title === 'Ship It' ? title : `${title} · Ship It`;
    if (firstScreen) {
      firstScreen = false;
      return;
    }
    ref.current?.focus();
  }, [title]);
  return ref;
}
