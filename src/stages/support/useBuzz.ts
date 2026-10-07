import { useEffect, useRef } from 'react';
import { buzz } from '../../app/haptics';

/** A buzz when a support card gets new info (§3.5.2 "haptics as signals"), at most every 2 s. */
export function useBuzzOnChange(value: unknown) {
  const key = JSON.stringify(value ?? null);
  const last = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = { key, at: Date.now() };
    if (prev && prev.key !== key && Date.now() - prev.at > 2000 && value != null) buzz('success');
  }, [key, value]);
}
