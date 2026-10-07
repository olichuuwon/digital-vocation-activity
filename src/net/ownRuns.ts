import { z } from 'zod';
import { safeStorage } from '../state/storage';

// Row ids of runs this device submitted, so the board can highlight "Your group" (§3.6).
// Only public row ids are kept: no names, no tokens.
const KEY = 'ship-it-own-runs';
const MAX = 10;

const ownRunsSchema = z.array(z.number().int().positive()).max(50);

export function loadOwnRunIds(): number[] {
  try {
    const r = ownRunsSchema.safeParse(JSON.parse((safeStorage.getItem(KEY) as string | null) ?? '[]'));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

/** Most recent first, de-duplicated, capped at MAX. */
export function addOwnRunId(ids: number[], id: number): number[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, MAX);
}

export function rememberOwnRun(id: number) {
  void safeStorage.setItem(KEY, JSON.stringify(addOwnRunId(loadOwnRunIds(), id)));
}
