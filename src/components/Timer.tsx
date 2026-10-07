import { useEffect, useRef, useState } from 'react';
import { useAnnouncer } from '../app/screenFocus';
import { copy, fill } from '../content';
import { useGame, useRelaxed } from '../state/store';
import { ANNOUNCE_AT, canExtend, EXTEND_BY_SECONDS, formatClock, levelSeconds, secondsLeft } from '../state/timer';
import s from './components.module.css';

const t = copy.components;
const TICK_MS = 200;
const MAX_TICK_MS = 500;

/**
 * Level countdown (§2). Relaxed mode adds ×1.5 (§10). Pauses while `running` is false or the
 * tab is hidden or Settings is open. Screen readers hear only checkpoints (30s, 10s, time up), not every second.
 * Remount with a new `key` to restart.
 */
export function Timer({
  seconds,
  running: runningProp = true,
  onExpire,
  onExtend,
}: {
  seconds: number;
  /** Pass false while a dialog (Rulebook, Settings) is open. */
  running?: boolean;
  onExpire?: () => void;
  /** Called after each "+30 seconds" tap, with the running count. */
  onExtend?: (extensions: number) => void;
}) {
  const relaxed = useRelaxed();
  const settingsOpen = useGame((g) => g.settingsOpen);
  const running = runningProp && !settingsOpen;
  const [extensions, setExtensions] = useState(0);
  const total = levelSeconds(seconds, relaxed) + extensions * EXTEND_BY_SECONDS;
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
        if ((at < total || at === 0) && left <= at && !announced.current.has(at) && !expired.current) {
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
  const extend = () => {
    const n = extensions + 1;
    setExtensions(n);
    // Let the 30s/10s checkpoints fire again for the new time.
    announced.current.clear();
    announce(t.extended);
    onExtend?.(n);
  };
  return (
    <div className={`${s.timer} ${urgent ? s.urgent : ''}`} data-testid="timer">
      <span aria-hidden="true">{urgent ? '⏰' : '⏱️'}</span>
      <span role="timer">
        <span className="visually-hidden">{t.timeLeft} </span>
        {formatClock(left)}
      </span>
      <span className={s.timerTrack} aria-hidden="true">
        <span className={s.timerFill} style={{ display: 'block', width: `${total > 0 ? (left / total) * 100 : 0}%` }} />
      </span>
      {!running && left > 0 && <span className={s.muted}>{t.paused}</span>}
      {running && canExtend(left, extensions) && (
        <button type="button" className={s.extendBtn} onClick={extend}>
          {t.extend}
        </button>
      )}
    </div>
  );
}
