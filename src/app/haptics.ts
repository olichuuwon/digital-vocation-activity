import { useGame } from '../state/store';
import { playCue } from './sound';

/**
 * Feedback (§3.3): haptics (short tick on success, triple buzz on error; feature-detected, a no-op
 * on iOS Safari) plus the optional sound when it's on in Settings.
 */
const PATTERNS: Record<'success' | 'error', number | number[]> = { success: 15, error: [40, 60, 40, 60, 40] };

export function buzz(kind: 'success' | 'error') {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* some browsers throw without a user gesture; haptics are optional */
  }
  if (useGame.getState().settings.sound) playCue(kind);
}
