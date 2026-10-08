import { z } from 'zod';
import blocklistJson from './blocklist.json';
import groupCopyJson from './groupCopy.json';
import groupNamesJson from './groupNames.json';

/*
 * Group play content (spec §3.5): UI copy, the generated-name lists and the profanity
 * blocklist. Parsed at import, like src/content/index.ts, so bad content fails fast.
 */
const txt = z.string().min(1);
const words = (n: number) =>
  txt.refine((s) => s.trim().split(/\s+/).length <= n, { message: `must be ${n} words or fewer` });
const section = <K extends string>(keys: readonly K[], max = 25) =>
  z.object(Object.fromEntries(keys.map((k) => [k, words(max)])) as Record<K, ReturnType<typeof words>>);

export const groupCopySchema = z.object({
  home: section(['backToGroup', 'leaveGroup', 'unavailable']),
  create: section([
    'heading', 'nameLabel', 'moreNames', 'ownName', 'useGenerated', 'customLabel', 'customHint',
    'nicknameLabel', 'nicknameHint', 'lengthLabel', 'lengthSet', 'create', 'back',
  ]),
  join: section(['heading', 'codeLabel', 'codeHint', 'nicknameLabel', 'nicknameHint', 'join', 'looking', 'back']),
  errors: section([
    'nameEmpty', 'nameTooLong', 'nameBlocked', 'nameDigits', 'nickEmpty', 'nickTooLong', 'nickBlocked', 'nickDigits',
    'badCode', 'notFound', 'full', 'started', 'noNetwork',
  ]),
  lobby: section([
    'codeLabel', 'scanHint', 'qrAlt', 'playersHeading', 'rotationNote', 'you', 'leaderTag', 'playerN', 'reconnecting', 'joinedSay', 'awaySay', 'icTag',
    'leadsStages', 'leadsFinale', 'moveUp', 'moveDown', 'shuffle', 'start', 'needTwo', 'waiting',
    'lengthLine', 'closesIn', 'leave', 'close',
  ]),
  // Support-phone text must be readable at a glance (§3.5.2: ≤15 words).
  support: section(
    ['supporting', 'mainHint', 'waitingCard', 'paused', 'promoted', 'upNext', 'upNextBody', 'ready', 'lobbyStage', 'finale'],
    15,
  ),
  pill: section(['reconnecting', 'sending'], 10),
  ended: section(['closed', 'lobbyExpired', 'runExpired', 'left', 'ok']),
  debrief: section(['groupLine', 'submitting', 'rank', 'onBoard', 'notRanked', 'retrying'], 12),
  host: section(['none', 'lobby', 'stage', 'finale', 'size']),
});
export type GroupCopy = z.infer<typeof groupCopySchema>;

const nameWord = z.string().regex(/^[A-Z][A-Za-z]+( [A-Z][A-Za-z]+)?$/);
export const groupNamesSchema = z
  .object({ adjectives: z.array(nameWord).min(10), nouns: z.array(nameWord).min(10) })
  .refine((n) => new Set(n.adjectives).size === n.adjectives.length && new Set(n.nouns).size === n.nouns.length, {
    message: 'duplicate words',
  });

const term = z.string().regex(/^[a-z]{2,}$/, 'lower-case letters only');
export const blocklistSchema = z.object({
  _note: z.string().optional(),
  anywhere: z.array(term).min(1),
  words: z.array(term).min(1),
});

export const groupCopy = groupCopySchema.parse(groupCopyJson);
export const groupNames = groupNamesSchema.parse(groupNamesJson);
export const blocklist = blocklistSchema.parse(blocklistJson);
