import { useEffect, useRef, useState } from 'react';
import { useAnnouncer } from '../app/screenFocus';
import { copy, fill } from '../content';
import { useRelaxed } from '../state/store';
import { ANNOUNCE_AT, formatClock, levelSeconds, secondsLeft } from '../state/timer';
import s from './components.module.css';

const t = copy.components;
const TICK_MS = 200;
const MAX_TICK_MS = 500;

/**
 * Level countdown (§2). Relaxed mode adds ×1.5 (§10). Pauses while `running` is false or the
 * tab is hidden. Screen readers hear only checkpoints (30s, 10s, time up), not every second.
 * Remount with a new `key` to restart.
 */
export function Timer({ seconds, running = true, onExpire }: { seconds: number; running?: boolean; onExpire?: () => void }) {
  const relaxed = useRelaxed();
  const total = levelSeconds(seconds, relaxed);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef(0);
  const announced = useRef(new Set<number>());
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  const announce = useAnnouncer((a) => a.announce);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    // iOS freezes JS while the screen is locked, and hidden tabs tick late. Restart the
    // clock on return, and cap each tick, so time away never counts against the player.
    const onVisible = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) elapsedRef.current += Math.max(0, Math.min(now - last, MAX_TICK_MS));
      last = now;
      setElapsedMs(elapsedRef.current);
      const left = secondsLeft(total, elapsedRef.current);
      for (const at of ANNOUNCE_AT) {
        if ((at < total || at === 0) && left <= at && !announced.current.has(at)) {
          announced.current.add(at);
          announce(at === 0 ? t.timeUp : fill(t.secondsLeft, { n: at }));
        }
      }
      if (left === 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current?.();
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, total, announce]);

  const left = secondsLeft(total, elapsedMs);
  const urgent = left <= 10;
  return (
    <div className={`${s.timer} ${urgent ? s.urgent : ''}`} data-testid="timer">
      <span aria-hidden="true">{urgent ? '⏰' : '⏱️'}</span>
      <span role="timer" aria-label={t.timeLeft}>
        {formatClock(left)}
      </span>
      <span className={s.timerTrack} aria-hidden="true">
        <span className={s.timerFill} style={{ display: 'block', width: `${total > 0 ? (left / total) * 100 : 0}%` }} />
      </span>
      {!running && left > 0 && <span className={s.muted}>{t.paused}</span>}
    </div>
  );
}
