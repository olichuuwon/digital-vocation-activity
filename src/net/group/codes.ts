import { isBlocked } from './moderation';

// 4-character group codes (spec §3.5.1, e.g. K7QM). No I, O, 0 or 1, so nobody mixes them up
// when typing a code read off another phone. 32 symbols → about a million codes.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export function generateCode(rand: () => number = Math.random): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
    if (!isBlocked(code)) return code;
  }
}

/** Upper-cases and strips spaces/dashes. Returns null if it isn't a valid code. */
export function normaliseCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** Realtime channel name for a group. */
export const groupChannel = (code: string) => `group:${code}`;

/** The link the lobby QR opens: the game with the code prefilled (`?join=K7QM`). */
export function joinUrl(origin: string, base: string, code: string): string {
  const url = new URL(base, origin);
  url.searchParams.set('join', code);
  return url.toString();
}
