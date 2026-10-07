import { z } from 'zod';
import { gameStateSchema } from '../../state/schema';
import { MAX_GROUP_NAME, MAX_NICKNAME } from './moderation';

// Wire format for group play. Everything received is untrusted (anyone who knows a code can
// send to its channel), so every message and every replicated value is zod-validated, and
// oversized messages are dropped before parsing. Nicknames only ever travel in presence and
// are never written to a table.

export const PROTOCOL = 1;
/** Drop anything bigger than this (JSON characters). A GameState is about 1 KB. */
export const MAX_MESSAGE_CHARS = 16_000;
/** Max size of a topic or action payload (JSON characters). */
export const MAX_PAYLOAD_CHARS = 4_000;
export const MAX_MEMBERS = 4;

// Timings (spec §3.5.1, §3.5.6).
export const LOBBY_TTL_MS = 15 * 60_000;
export const RUN_TTL_MS = 60 * 60_000;
/** Main phone missing this long → the next in the rotation takes over. */
export const PROMOTE_AFTER_MS = 20_000;
/** A teammate missing this long is left out (cards re-dealt, lobby slot freed). */
export const GONE_AFTER_MS = 30_000;
/** The main phone says "still here" when it has been quiet this long. */
export const BEAT_MS = 5_000;
/** The main phone counts as missing after this long without a word. */
export const MAIN_SILENT_MS = 15_000;
/** A joiner gives up if no leader answers within this time. */
export const JOIN_TIMEOUT_MS = 8_000;

export const memberIdSchema = z.string().regex(/^[A-Za-z0-9-]{6,40}$/);
const nickname = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(MAX_NICKNAME));

/** What each phone shows in the channel's presence (ephemeral, never stored). */
export const presenceSchema = z.object({ id: memberIdSchema, nick: nickname });
export type PresenceMeta = z.infer<typeof presenceSchema>;

export const sessionSchema = z
  .object({
    /** Random per group: tells two groups apart if they ever share a code. */
    sid: z.uuid(),
    code: z.string().regex(/^[A-Z2-9]{4}$/),
    name: z.string().min(1).max(MAX_GROUP_NAME),
    mode: z.enum(['booth', 'full']),
    leaderId: memberIdSchema,
    /** Main-phone order; also the member list. */
    rotation: z.array(memberIdSchema).min(1).max(MAX_MEMBERS),
    status: z.enum(['lobby', 'playing', 'closed']),
    closedReason: z.enum(['closed', 'lobbyExpired']).nullable().optional(),
    createdAt: z.number(),
    startedAt: z.number().nullable(),
    sizeAtStart: z.number().int().min(2).max(MAX_MEMBERS).nullable(),
    /** submit_run token: makes the one leaderboard submission retry-safe. */
    token: z.uuid(),
  })
  .refine((s) => new Set(s.rotation).size === s.rotation.length, { message: 'duplicate member' });
export type Session = z.infer<typeof sessionSchema>;

export const resultSchema = z.union([
  z.object({ kind: z.literal('ok'), id: z.number().int().positive(), rankToday: z.number().int().positive().nullable() }),
  z.object({ kind: z.literal('rejected') }),
]);
export type GroupResult = z.infer<typeof resultSchema>;

/** Replicated keys: the session, the shared run, the result, takeovers per stage, topics. */
export const KEY_RE = /^(session|run|result|ov:[0-5]|t:[A-Za-z0-9_.:-]{1,40})$/;
export const entrySchema = z.object({
  k: z.string().regex(KEY_RE),
  /** Lamport version: higher wins; ties go to the higher member id. */
  v: z.number().int().min(0),
  by: memberIdSchema,
  d: z.unknown(),
});
export type Entry = z.infer<typeof entrySchema>;

const base = { p: z.literal(PROTOCOL), from: memberIdSchema, sid: z.uuid().nullable() };
const actionType = z.string().regex(/^[A-Za-z0-9_.:-]{1,40}$/);

export const messageSchema = z.discriminatedUnion('t', [
  /** "I'm here, send me what you know." `join` = a new player asking to join the lobby. */
  z.object({ ...base, t: z.literal('hello'), join: z.boolean() }),
  z.object({ ...base, t: z.literal('put'), e: entrySchema }),
  z.object({ ...base, t: z.literal('sync'), es: z.array(entrySchema).max(64) }),
  /** Support → main phone. `id` de-duplicates resends. */
  z.object({ ...base, t: z.literal('act'), id: z.string().min(1).max(40), type: actionType, d: z.unknown().optional() }),
  z.object({ ...base, t: z.literal('beat') }),
  z.object({ ...base, t: z.literal('bye') }),
]);
export type Message = z.infer<typeof messageSchema>;
/** A message before `p`, `from` and `sid` are stamped on. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type OutMessage = DistOmit<Message, 'p' | 'from' | 'sid'>;

const jsonSize = (x: unknown) => {
  try {
    return JSON.stringify(x)?.length ?? 0;
  } catch {
    return Infinity;
  }
};

/** Validates an incoming message. Returns null for anything malformed or oversized. */
export function parseMessage(raw: unknown): Message | null {
  if (jsonSize(raw) > MAX_MESSAGE_CHARS) return null;
  const r = messageSchema.safeParse(raw);
  if (!r.success) return null;
  const m = r.data;
  if (m.t === 'act' && jsonSize(m.d) > MAX_PAYLOAD_CHARS) return null;
  return m;
}

/** Validates the value carried by a replicated entry for its key. */
export function parseEntryData(key: string, d: unknown): unknown {
  if (key === 'session') {
    const r = sessionSchema.safeParse(d);
    return r.success ? r.data : undefined;
  }
  if (key === 'run') {
    const r = gameStateSchema.safeParse(d);
    return r.success ? r.data : undefined;
  }
  if (key === 'result') {
    const r = resultSchema.safeParse(d);
    return r.success ? r.data : undefined;
  }
  if (key.startsWith('ov:')) {
    const r = memberIdSchema.safeParse(d);
    return r.success ? r.data : undefined;
  }
  // Topics: any JSON up to the size limit; consumers validate the shape (useTopic schema).
  return jsonSize(d) <= MAX_PAYLOAD_CHARS ? d : undefined;
}

/** True if `a` beats `b` (Lamport order, member id tie-break). */
export const newer = (a: { v: number; by: string }, b: { v: number; by: string } | undefined) =>
  !b || a.v > b.v || (a.v === b.v && a.by > b.by);

export function parsePresence(list: unknown[]): PresenceMeta[] {
  const seen = new Map<string, PresenceMeta>();
  for (const raw of list) {
    const r = presenceSchema.safeParse(raw);
    if (r.success) seen.set(r.data.id, r.data);
  }
  return [...seen.values()];
}
