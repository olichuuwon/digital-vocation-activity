import { blocklist, groupNames } from '../../content/groupSchema';

// Moderation for player-typed text (spec §3.5.5): custom group names and nicknames.
// Matching ignores case, accents, spacing/punctuation, repeated letters and basic leetspeak.
// The facilitator can still hide a group name from /host (server-side PIN check).

export const MAX_GROUP_NAME = 20;
export const MAX_NICKNAME = 16;

const LEET: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '+': 't' };

/** Lower-case, accents stripped, leetspeak mapped. `one` = how to read "1" (i or l). */
function fold(text: string, one: 'i' | 'l'): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0-9@$!+]/g, (ch) => (ch === '1' ? one : (LEET[ch] ?? ch)));
}

const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

const anywhere = blocklist.anywhere.flatMap((w) => [w, collapse(w)]);
const wordSet = new Set(blocklist.words.flatMap((w) => [w, collapse(w)]));

/** True if the text contains a blocked term. Pure. */
export function isBlocked(text: string): boolean {
  for (const one of ['i', 'l'] as const) {
    const folded = fold(text, one);
    const tokens = folded.split(/[^a-z]+/).filter(Boolean);
    const compact = tokens.join('');
    const candidates = [compact, collapse(compact)];
    if (candidates.some((c) => anywhere.some((w) => c.includes(w)))) return true;
    // Whole-word terms: each word, the whole name squashed ("c b" → "cb"), and plurals.
    for (const tok of [...tokens, ...tokens.map(collapse), ...candidates]) {
      if (wordSet.has(tok) || (tok.endsWith('s') && wordSet.has(tok.slice(0, -1)))) return true;
    }
  }
  return false;
}

/** Trims and collapses inner whitespace, like the server does (submit_run). */
export const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Rejects control, zero-width and bidi characters (the server rejects them too). */
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

export type TextProblem = 'empty' | 'tooLong' | 'digits' | 'blocked';

function check(raw: string, max: number): TextProblem | null {
  const s = tidy(raw);
  if (!s) return 'empty';
  if ([...s].length > max) return 'tooLong';
  // No numbers at all (owner decision 2026-10-08): digits are the easiest way round the
  // filter ("4ss"), and real names don't need them.
  if (/\p{Nd}/u.test(s)) return 'digits';
  if (BAD_CHARS.test(s) || isBlocked(s)) return 'blocked';
  return null;
}

export const checkGroupName = (raw: string) => check(raw, MAX_GROUP_NAME);
export const checkNickname = (raw: string) => check(raw, MAX_NICKNAME);

/** All generated names that fit the 20-character limit. */
export const allGeneratedNames = (): string[] =>
  groupNames.adjectives.flatMap((a) => groupNames.nouns.map((n) => `${a} ${n}`)).filter((n) => n.length <= MAX_GROUP_NAME);

/** `count` distinct generated names ("Swift Kingfisher"). `rand` is injectable for tests. */
export function generateNames(count: number, rand: () => number = Math.random): string[] {
  const out = new Set<string>();
  const { adjectives, nouns } = groupNames;
  for (let guard = 0; out.size < count && guard < count * 50; guard++) {
    const name = `${adjectives[Math.floor(rand() * adjectives.length)]} ${nouns[Math.floor(rand() * nouns.length)]}`;
    if (name.length <= MAX_GROUP_NAME) out.add(name);
  }
  return [...out];
}
