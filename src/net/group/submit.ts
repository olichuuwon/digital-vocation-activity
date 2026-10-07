import { isRetryable, LeaderboardError, submitRun, type RunPayload } from '../leaderboard';
import { rememberOwnRun } from '../ownRuns';
import { createSubmitQueue, type SubmitQueue } from '../submitQueue';
import { safeStorage } from '../../state/storage';
import type { GroupResult } from './protocol';

// The group's one leaderboard submission (§3.5.3), through the existing retrying queue
// (src/net/submitQueue.ts). Persisted, so a reload or a dropped connection doesn't lose it.

const KEY = 'ship-it-group-submit';
type Listener = (token: string, result: GroupResult) => void;
const listeners = new Set<Listener>();
let queue: SubmitQueue | null = null;

export function onGroupSubmitResult(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const notify = (token: string, r: GroupResult) => listeners.forEach((l) => l(token, r));

export function getGroupSubmitQueue(): SubmitQueue {
  if (queue) return queue;
  const q = createSubmitQueue({
    submit: async (p: RunPayload) => {
      try {
        return await submitRun(p);
      } catch (e) {
        // A permanent rejection (e.g. anti-cheat) ends the attempt: tell the group.
        if (e instanceof LeaderboardError && !isRetryable(e.kind)) notify(p.groupToken, { kind: 'rejected' });
        throw e;
      }
    },
    load: () => safeStorage.getItem(KEY) as string | null,
    save: (raw) => void safeStorage.setItem(KEY, raw),
    now: () => Date.now(),
    schedule: (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
    onSubmitted: (p, r) => {
      rememberOwnRun(r.id);
      notify(p.groupToken, { kind: 'ok', id: r.id, rankToday: r.rankToday });
    },
  });
  window.addEventListener('online', () => void q.retryNow());
  queue = q;
  return q;
}
