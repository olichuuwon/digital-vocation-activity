/** Relaxed mode gives ×1.5 time (spec §10). Whole seconds, rounded up so it never shrinks. */
export const RELAXED_FACTOR = 1.5;

export function levelSeconds(baseSeconds: number, relaxed: boolean): number {
  return relaxed ? Math.ceil(baseSeconds * RELAXED_FACTOR) : baseSeconds;
}

/** Whole seconds left, never negative. `elapsedMs` excludes paused time. */
export function secondsLeft(totalSeconds: number, elapsedMs: number): number {
  return Math.max(0, Math.ceil(totalSeconds - elapsedMs / 1000));
}

/** "0:45", "1:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Screen-reader checkpoints: announce these once each, not every second. */
export const ANNOUNCE_AT = [30, 10, 0] as const;

/**
 * WCAG 2.2.1 "extend": from 20s left the player can add time with one tap, up to 10 times.
 * Stages decide whether an extension costs points.
 */
export const EXTEND_WHEN_LEFT = 20;
export const EXTEND_BY_SECONDS = 30;
export const MAX_EXTENSIONS = 10;

export function canExtend(left: number, extensions: number): boolean {
  return left > 0 && left <= EXTEND_WHEN_LEFT && extensions < MAX_EXTENSIONS;
}
