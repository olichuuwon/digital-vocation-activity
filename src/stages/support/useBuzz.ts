import { useEffect, useRef } from 'react';
import { buzz } from '../../app/haptics';
import { useAnnouncer } from '../../app/screenFocus';

/**
 * New info on a support card (§3.5.2 "haptics as signals"): a buzz plus one spoken line through
 * the shared announcer (topics update silently otherwise), at most every 2 s. `urgent` (finale
 * incidents and all-hands calls) skips the throttle: those can't be missed.
 */
export function useBuzzOnChange(value: unknown, text: string, urgent = false) {
  const key = JSON.stringify(value ?? null);
  const last = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    const prev = last.current;
    if (prev && prev.key === key) return;
    const now = Date.now();
    last.current = { key, at: prev && !urgent && now - prev.at <= 2000 ? prev.at : now };
    if (!prev || value == null || (!urgent && now - prev.at <= 2000)) return;
    buzz('success');
    useAnnouncer.getState().announce(text);
  }, [key, value, text, urgent]);
}
