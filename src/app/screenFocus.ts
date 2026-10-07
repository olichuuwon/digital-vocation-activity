import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { copy } from '../content';

let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Shared polite live region (§10). Stages push result text with `announce()`.
 * Clears first, then sets on the next tick, so the same text twice is still read out.
 */
export const useAnnouncer = create<{ message: string; announce: (m: string) => void }>()((set) => ({
  message: '',
  announce: (message) => {
    clearTimeout(pending);
    set({ message: '' });
    pending = setTimeout(() => set({ message }), 60);
  },
}));

let firstScreen = true;

/**
 * Sets the tab title and, after the first screen, moves focus to the screen heading so
 * screen-reader users hear where they are when a screen swaps (WCAG 2.4.3).
 */
export function useScreenHeading<T extends HTMLElement>(title: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    // An empty title means "not a screen yet" (e.g. a level still showing its intro).
    if (!title) return;
    const game = copy.home.title;
    document.title = title === game ? game : `${title} · ${game}`;
    if (firstScreen) {
      firstScreen = false;
      return;
    }
    ref.current?.focus();
  }, [title]);
  return ref;
}
