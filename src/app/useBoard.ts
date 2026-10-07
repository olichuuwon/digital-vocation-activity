import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAll, fetchRank, fetchToday, LeaderboardError, type BoardRow, type LeaderboardErrorKind } from '../net/leaderboard';
import { loadOwnRunIds } from '../net/ownRuns';
import { sgtDate } from '../net/sgtTime';

export type BoardQuery = { kind: 'today' } | { kind: 'all'; date: string | null };

export interface BoardState {
  status: 'loading' | 'ready' | 'error';
  errorKind: LeaderboardErrorKind | null;
  rows: BoardRow[];
  /** The device's own group when it's on today's board but outside the rows shown. */
  pinned: BoardRow | null;
  ownIds: number[];
  updatedAt: number | null;
}

const initial: BoardState = { status: 'loading', errorKind: null, rows: [], pinned: null, ownIds: [], updatedAt: null };

/** Fetches one board plus the device's pinned row. Never throws. */
async function fetchBoard(query: BoardQuery): Promise<(prev: BoardState) => BoardState> {
  const ownIds = loadOwnRunIds();
  try {
    const rows = query.kind === 'today' ? await fetchToday() : await fetchAll(query.date);
    let pinned: BoardRow | null = null;
    const latestOwn = ownIds[0];
    if (query.kind === 'today' && latestOwn !== undefined && !rows.some((r) => ownIds.includes(r.id))) {
      const own = await fetchRank(latestOwn).catch(() => null);
      if (own && own.boardDate === sgtDate() && own.rank > rows.length) pinned = own;
    }
    return () => ({ status: 'ready', errorKind: null, rows, pinned, ownIds, updatedAt: Date.now() });
  } catch (e) {
    const kind = e instanceof LeaderboardError ? e.kind : 'network';
    // A failed refresh keeps the last good rows.
    return (prev) =>
      prev.status === 'ready' ? { ...prev, errorKind: kind } : { ...initial, status: 'error', errorKind: kind, ownIds };
  }
}

/**
 * Loads a board. With `pollMs`, refreshes on an interval while the tab is visible and
 * immediately when it becomes visible again.
 */
export function useBoard(query: BoardQuery, pollMs?: number) {
  const key = query.kind === 'today' ? 'today' : `all:${query.date ?? ''}`;
  // State is tagged with its query, so switching tabs shows "loading" until new data lands.
  const [tagged, setTagged] = useState<{ key: string; state: BoardState }>({ key, state: initial });
  const state = tagged.key === key ? tagged.state : initial;
  const seq = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const load = useCallback(() => {
    const mine = ++seq.current;
    return fetchBoard(queryRef.current).then((apply) => {
      if (mine !== seq.current) return; // a newer request (or unmount) superseded this one
      setTagged((t) => ({ key, state: apply(t.key === key ? t.state : initial) }));
    });
  }, [key]);

  const reload = useCallback(() => {
    setTagged((t) => (t.key === key && t.state.status === 'error' ? { key, state: initial } : t));
    void load();
  }, [key, load]);

  useEffect(() => {
    const requests = seq; // the counter object itself, not a DOM ref
    void load();
    const tick = () => {
      if (!document.hidden) void load();
    };
    // Without polling, still refetch once the Singapore day rolls over at 00:00.
    let day = sgtDate();
    const dayCheck = () => {
      if (sgtDate() !== day) {
        day = sgtDate();
        tick();
      }
    };
    const id = window.setInterval(pollMs ? tick : dayCheck, pollMs ?? 30_000);
    if (pollMs) document.addEventListener('visibilitychange', tick);
    return () => {
      requests.current++; // drop in-flight responses
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load, pollMs]);

  return { ...state, reload };
}
