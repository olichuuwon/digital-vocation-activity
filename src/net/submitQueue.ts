import { z } from 'zod';
import { safeStorage } from '../state/storage';
import {
  isRetryable,
  LeaderboardError,
  runPayloadSchema,
  submitRun,
  type LeaderboardErrorKind,
  type RunPayload,
  type SubmitResult,
} from './leaderboard';
import { rememberOwnRun } from './ownRuns';

// Score submission queue (§3.5.6). Persisted in localStorage so a dropped connection or a
// reload doesn't lose the group's run. Safe to resend: submit_run is idempotent per token.
// Stored: the run payload (incl. group token) only. No nicknames.
// Nothing in gameplay calls this yet: group submission arrives in M6.5.

export interface QueueItem {
  payload: RunPayload;
  attempts: number;
  queuedAt: number;
  nextAttemptAt: number;
}

export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 60_000;
/** Give up after a day: a stale run would land on the wrong daily board anyway. */
export const EXPIRY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------
// Pure queue logic
// ---------------------------------------------------------------------------------------

/** 2s, 4s, 8s … capped at 60s. `attempts` = failures so far (≥ 1). */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
}

/** Adds a run; a token already queued is left alone (one run per group). */
export function enqueue(items: QueueItem[], payload: RunPayload, now: number): QueueItem[] {
  if (items.some((i) => i.payload.groupToken === payload.groupToken)) return items;
  return [...items, { payload, attempts: 0, queuedAt: now, nextAttemptAt: now }];
}

export const dueItems = (items: QueueItem[], now: number) => items.filter((i) => i.nextAttemptAt <= now);

export function nextWakeAt(items: QueueItem[]): number | null {
  return items.length ? Math.min(...items.map((i) => i.nextAttemptAt)) : null;
}

export const markSuccess = (items: QueueItem[], token: string) =>
  items.filter((i) => i.payload.groupToken !== token);

/** Retryable failures back off; permanent rejections are dropped. */
export function markFailure(items: QueueItem[], token: string, kind: LeaderboardErrorKind, now: number): QueueItem[] {
  if (!isRetryable(kind)) return markSuccess(items, token);
  return items.map((i) => {
    if (i.payload.groupToken !== token) return i;
    const attempts = i.attempts + 1;
    return { ...i, attempts, nextAttemptAt: now + backoffMs(attempts) };
  });
}

export const pruneExpired = (items: QueueItem[], now: number) => items.filter((i) => now - i.queuedAt < EXPIRY_MS);

/** Retry everything now (e.g. the browser just came back online). */
export const retryAllNow = (items: QueueItem[], now: number) => items.map((i) => ({ ...i, nextAttemptAt: now }));

const storedSchema = z.array(
  z.object({
    payload: runPayloadSchema.extend({ groupName: z.string().min(1).max(40) }),
    attempts: z.number().int().min(0),
    queuedAt: z.number(),
    nextAttemptAt: z.number(),
  }),
);

/** Reads the stored queue; anything malformed is dropped rather than crashing. */
export function parseStoredQueue(raw: string | null): QueueItem[] {
  if (!raw) return [];
  try {
    const r = storedSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------

/** idle = nothing queued · sending = request in flight · waiting = queued, retrying soon. */
export type QueueStatus = 'idle' | 'sending' | 'waiting';

export interface QueueDeps {
  submit: (p: RunPayload) => Promise<SubmitResult>;
  load: () => string | null;
  save: (raw: string) => void;
  now: () => number;
  schedule: (fn: () => void, ms: number) => () => void;
  onSubmitted?: (payload: RunPayload, result: SubmitResult) => void;
}

export function createSubmitQueue(deps: QueueDeps) {
  let items = pruneExpired(parseStoredQueue(deps.load()), deps.now());
  let sending = false;
  let cancelTimer: (() => void) | null = null;
  const listeners = new Set<(s: QueueStatus) => void>();

  const status = (): QueueStatus => (sending ? 'sending' : items.length ? 'waiting' : 'idle');
  const emit = () => listeners.forEach((l) => l(status()));
  const persist = () => deps.save(JSON.stringify(items));

  function arm() {
    cancelTimer?.();
    cancelTimer = null;
    const at = nextWakeAt(items);
    if (at === null || sending) return;
    cancelTimer = deps.schedule(() => void flush(), Math.max(0, at - deps.now()));
  }

  async function flush(): Promise<void> {
    if (sending) return;
    items = pruneExpired(items, deps.now());
    const item = dueItems(items, deps.now())[0];
    if (!item) {
      persist();
      emit();
      arm();
      return;
    }
    sending = true;
    emit();
    const token = item.payload.groupToken;
    try {
      const result = await deps.submit(item.payload);
      items = markSuccess(items, token);
      deps.onSubmitted?.(item.payload, result);
    } catch (e) {
      const kind = e instanceof LeaderboardError ? e.kind : 'network';
      items = markFailure(items, token, kind, deps.now());
    }
    sending = false;
    persist();
    emit();
    if (dueItems(items, deps.now()).length) return flush();
    arm();
  }

  return {
    enqueue(payload: RunPayload) {
      items = enqueue(items, payload, deps.now());
      persist();
      return flush();
    },
    flush,
    retryNow() {
      items = retryAllNow(items, deps.now());
      return flush();
    },
    status,
    pending: () => items.length,
    subscribe(fn: (s: QueueStatus) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      cancelTimer?.();
      listeners.clear();
    },
  };
}

export type SubmitQueue = ReturnType<typeof createSubmitQueue>;

const STORAGE_KEY = 'ship-it-submit-queue';
let shared: SubmitQueue | null = null;

/** App-wide queue (for M6.5). Flushes on start and whenever the browser comes back online. */
export function getSubmitQueue(): SubmitQueue {
  if (shared) return shared;
  const q = createSubmitQueue({
    submit: submitRun,
    load: () => safeStorage.getItem(STORAGE_KEY) as string | null,
    save: (raw) => void safeStorage.setItem(STORAGE_KEY, raw),
    now: () => Date.now(),
    schedule: (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
    onSubmitted: (_p, r) => rememberOwnRun(r.id),
  });
  window.addEventListener('online', () => void q.retryNow());
  void q.flush();
  shared = q;
  return q;
}
