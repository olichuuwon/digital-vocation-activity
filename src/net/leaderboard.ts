import { z } from 'zod';
import { getSupabase } from './supabase';

// Typed client for the leaderboard RPCs in supabase/migrations/0001_runs.sql.
// Every response is zod-validated; anything unexpected becomes a LeaderboardError.

export type LeaderboardErrorKind =
  | 'unavailable' // not configured, or the backend refuses (migration missing, grants wrong)
  | 'network' // offline, timeout, 5xx: retry later
  | 'rate_limited' // server busy: retry later
  | 'rejected' // the server said the payload is invalid: never retry
  | 'bad_response'; // response didn't match the schema

export class LeaderboardError extends Error {
  constructor(
    readonly kind: LeaderboardErrorKind,
    message: string = kind,
  ) {
    super(message);
    this.name = 'LeaderboardError';
  }
}

/** Retry later? (network trouble, rate limit, or the backend isn't ready yet). */
export const isRetryable = (kind: LeaderboardErrorKind) => kind !== 'rejected';

/** Maps a PostgREST / supabase-js error to a kind. Pure, for tests. */
export function classifyError(err: { code?: string | null; message?: string | null }): LeaderboardErrorKind {
  const code = err.code ?? '';
  if (code === 'PT429') return 'rate_limited';
  if (code === '22023' || code.startsWith('23')) return 'rejected';
  // Permission denied / function missing / bad key: the backend isn't set up for us.
  if (code === '42501' || code === '42883' || code === 'PGRST202' || code.startsWith('PGRST3')) return 'unavailable';
  return 'network';
}

// ---------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const groupSize = z.number().int().min(2).max(4);
const families = z.number().int().min(0).max(1200);
const mode = z.enum(['booth', 'full']);

const boardRowSchema = z
  .object({
    rank: z.number().int().positive(),
    id: z.number().int().positive(),
    group_name: z.string().min(1).max(40),
    group_size: groupSize,
    mode,
    families,
    finished_at: z.string().min(1),
    board_date: isoDate,
  })
  .transform((r) => ({
    rank: r.rank,
    id: r.id,
    groupName: r.group_name,
    groupSize: r.group_size,
    mode: r.mode,
    families: r.families,
    finishedAt: r.finished_at,
    boardDate: r.board_date,
  }));
export type BoardRow = z.output<typeof boardRowSchema>;

const submitResultSchema = z
  .object({ id: z.number().int().positive(), rank_today: z.number().int().positive().nullable() })
  .transform((r) => ({ id: r.id, rankToday: r.rank_today }));
export type SubmitResult = z.output<typeof submitResultSchema>;

const hostStatus = z.enum(['ok', 'wrong_pin', 'locked', 'not_configured', 'not_found']);
export type HostStatus = z.infer<typeof hostStatus>;

const hostRowSchema = z
  .object({
    id: z.number().int().positive(),
    group_name: z.string().min(1).max(40),
    group_size: groupSize,
    mode,
    families,
    finished_at: z.string().min(1),
    hidden: z.boolean(),
  })
  .transform((r) => ({
    id: r.id,
    groupName: r.group_name,
    groupSize: r.group_size,
    mode: r.mode,
    families: r.families,
    finishedAt: r.finished_at,
    hidden: r.hidden,
  }));
export type HostRow = z.output<typeof hostRowSchema>;

const hostListSchema = z.object({ status: hostStatus, rows: z.array(hostRowSchema) });
const hideResultSchema = z.object({ status: hostStatus });

/** What the client sends when a group finishes. No nicknames, no device data. */
export const runPayloadSchema = z.object({
  groupToken: z.uuid(),
  groupName: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(20)),
  groupSize,
  mode,
  families,
  durationSec: z.number().int().min(0).max(3600),
});
export type RunPayload = z.input<typeof runPayloadSchema>;

function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new LeaderboardError('bad_response', r.error.message);
  return r.data;
}

export const parseBoard = (data: unknown): BoardRow[] => parse(z.array(boardRowSchema), data);
export const parseSubmitResult = (data: unknown): SubmitResult => parse(submitResultSchema, data);
export const parseHostList = (data: unknown) => parse(hostListSchema, data);
export const parseHideResult = (data: unknown): HostStatus => parse(hideResultSchema, data).status;

// ---------------------------------------------------------------------------------------
// RPC calls
// ---------------------------------------------------------------------------------------
const TIMEOUT_MS = 10_000;

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  let sb;
  try {
    sb = await getSupabase();
  } catch {
    throw new LeaderboardError('network', 'client failed to load');
  }
  if (!sb) throw new LeaderboardError('unavailable', 'not configured');
  let res;
  try {
    res = await sb.rpc(fn, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  } catch (e) {
    throw new LeaderboardError('network', e instanceof Error ? e.message : String(e));
  }
  if (res.error) throw new LeaderboardError(classifyError(res.error), res.error.message);
  return res.data;
}

export async function submitRun(payload: RunPayload): Promise<SubmitResult> {
  const p = runPayloadSchema.safeParse(payload);
  if (!p.success) throw new LeaderboardError('rejected', p.error.message);
  const v = p.data;
  return parseSubmitResult(
    await rpc('submit_run', {
      p_group_token: v.groupToken,
      p_group_name: v.groupName,
      p_group_size: v.groupSize,
      p_mode: v.mode,
      p_families: v.families,
      p_duration_sec: v.durationSec,
    }),
  );
}

export const fetchToday = async () => parseBoard(await rpc('leaderboard_today'));

export const fetchAll = async (date?: string | null) =>
  parseBoard(await rpc('leaderboard_all', { p_date: date ? parse(isoDate, date) : null }));

export async function fetchRank(id: number): Promise<BoardRow | null> {
  return parseBoard(await rpc('run_rank', { p_id: id }))[0] ?? null;
}

export const setHidden = async (id: number, hidden: boolean, pin: string) =>
  parseHideResult(await rpc('set_run_hidden', { p_id: id, p_hidden: hidden, p_pin: pin }));

export const hostListRecent = async (pin: string) => parseHostList(await rpc('host_list_recent', { p_pin: pin }));
