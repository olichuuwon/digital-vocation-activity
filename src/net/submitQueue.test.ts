import { LeaderboardError, type RunPayload, type SubmitResult } from './leaderboard';
import {
  backoffMs,
  createSubmitQueue,
  dueItems,
  enqueue,
  EXPIRY_MS,
  markFailure,
  markSuccess,
  nextWakeAt,
  parseStoredQueue,
  pruneExpired,
  retryAllNow,
  type QueueItem,
} from './submitQueue';

const payload = (n: number): RunPayload => ({
  groupToken: `1b4e28ba-2fa1-4d3b-a3f5-${String(n).padStart(12, '0')}`,
  groupName: `Group ${n}`,
  groupSize: 3,
  mode: 'booth',
  families: 900,
  durationSec: 700,
});

describe('queue logic (pure)', () => {
  it('backs off 2s, 4s, 8s … capped at 60s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  });

  it('enqueues once per group token', () => {
    let q: QueueItem[] = [];
    q = enqueue(q, payload(1), 100);
    q = enqueue(q, payload(1), 200);
    q = enqueue(q, payload(2), 300);
    expect(q.map((i) => [i.payload.groupName, i.queuedAt])).toEqual([
      ['Group 1', 100],
      ['Group 2', 300],
    ]);
  });

  it('retries retryable failures with backoff and drops rejected ones', () => {
    let q = enqueue(enqueue([], payload(1), 0), payload(2), 0);
    q = markFailure(q, payload(1).groupToken, 'network', 1000);
    expect(q[0]).toMatchObject({ attempts: 1, nextAttemptAt: 3000 });
    q = markFailure(q, payload(1).groupToken, 'rate_limited', 3000);
    expect(q[0]).toMatchObject({ attempts: 2, nextAttemptAt: 7000 });
    expect(dueItems(q, 5000).map((i) => i.payload.groupName)).toEqual(['Group 2']);
    expect(nextWakeAt(q)).toBe(0);
    q = markFailure(q, payload(2).groupToken, 'rejected', 5000);
    expect(q).toHaveLength(1);
    expect(nextWakeAt(q)).toBe(7000);
    expect(markSuccess(q, payload(1).groupToken)).toEqual([]);
    expect(nextWakeAt([])).toBeNull();
  });

  it('retryAllNow and pruneExpired', () => {
    let q = markFailure(enqueue([], payload(1), 0), payload(1).groupToken, 'network', 0);
    expect(dueItems(q, 10)).toHaveLength(0);
    q = retryAllNow(q, 10);
    expect(dueItems(q, 10)).toHaveLength(1);
    expect(pruneExpired(q, EXPIRY_MS - 1)).toHaveLength(1);
    expect(pruneExpired(q, EXPIRY_MS)).toHaveLength(0);
  });

  it('parses stored queues and drops anything malformed', () => {
    const q = enqueue([], payload(1), 5);
    expect(parseStoredQueue(JSON.stringify(q))).toEqual(q);
    expect(parseStoredQueue(null)).toEqual([]);
    expect(parseStoredQueue('{not json')).toEqual([]);
    expect(parseStoredQueue(JSON.stringify([{ payload: { nickname: 'Ali' } }]))).toEqual([]);
  });
});

describe('createSubmitQueue (runner)', () => {
  function harness(submit: (p: RunPayload) => Promise<SubmitResult>, stored: string | null = null) {
    let now = 0;
    let saved = stored;
    const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
    const submitted: number[] = [];
    const q = createSubmitQueue({
      submit,
      load: () => saved,
      save: (raw) => {
        saved = raw;
      },
      now: () => now,
      schedule: (fn, ms) => {
        const t = { at: now + ms, fn, cancelled: false };
        timers.push(t);
        return () => {
          t.cancelled = true;
        };
      },
      onSubmitted: (_p, r) => submitted.push(r.id),
    });
    const advance = async (ms: number) => {
      now += ms;
      for (const t of timers.filter((x) => !x.cancelled && x.at <= now)) {
        t.cancelled = true;
        t.fn();
      }
      await new Promise((r) => setTimeout(r, 0));
    };
    return { q, advance, submitted, saved: () => saved };
  }

  it('sends immediately when online and clears storage', async () => {
    const submit = vi.fn(async () => ({ id: 9, rankToday: 1 }));
    const h = harness(submit);
    await h.q.enqueue(payload(1));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(h.submitted).toEqual([9]);
    expect(h.q.status()).toBe('idle');
    expect(JSON.parse(h.saved()!)).toEqual([]);
  });

  it('keeps the run through failures, retries with backoff, then succeeds', async () => {
    let fails = 2;
    const submit = vi.fn(async () => {
      if (fails-- > 0) throw new LeaderboardError('network');
      return { id: 5, rankToday: 2 };
    });
    const h = harness(submit);
    const statuses: string[] = [];
    h.q.subscribe((s) => statuses.push(s));
    await h.q.enqueue(payload(1));
    expect(h.q.status()).toBe('waiting');
    expect(JSON.parse(h.saved()!)).toHaveLength(1);
    await h.advance(1999);
    expect(submit).toHaveBeenCalledTimes(1);
    await h.advance(1);
    expect(submit).toHaveBeenCalledTimes(2);
    await h.advance(4000);
    expect(submit).toHaveBeenCalledTimes(3);
    expect(h.q.status()).toBe('idle');
    expect(h.submitted).toEqual([5]);
    expect(statuses).toContain('waiting');
    expect(statuses.at(-1)).toBe('idle');
  });

  it('drops a run the server rejects (no endless retries)', async () => {
    const submit = vi.fn(async () => {
      throw new LeaderboardError('rejected', 'invalid_families');
    });
    const h = harness(submit);
    await h.q.enqueue(payload(1));
    expect(h.q.pending()).toBe(0);
    expect(h.q.status()).toBe('idle');
  });

  it('resumes a queue saved before a reload', async () => {
    const stored = JSON.stringify(enqueue([], payload(3), 0));
    const submit = vi.fn(async () => ({ id: 11, rankToday: null }));
    const h = harness(submit, stored);
    expect(h.q.pending()).toBe(1);
    await h.q.flush();
    expect(submit).toHaveBeenCalledWith(payload(3));
    expect(h.q.pending()).toBe(0);
  });

  it('retryNow skips the backoff (e.g. on the online event)', async () => {
    let fail = true;
    const submit = vi.fn(async () => {
      if (fail) throw new LeaderboardError('network');
      return { id: 1, rankToday: 1 };
    });
    const h = harness(submit);
    await h.q.enqueue(payload(1));
    fail = false;
    await h.q.retryNow();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(h.q.pending()).toBe(0);
  });
});
