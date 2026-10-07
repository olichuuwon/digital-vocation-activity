/** Haptics (§3.3): short tick on success, triple buzz on error. Feature-detected; no-op on iOS Safari. */
const PATTERNS: Record<'success' | 'error', number | number[]> = { success: 15, error: [40, 60, 40, 60, 40] };

export function buzz(kind: 'success' | 'error') {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* some browsers throw without a user gesture; haptics are optional */
  }
}
