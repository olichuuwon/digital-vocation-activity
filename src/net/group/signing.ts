import { ed25519 } from '@noble/curves/ed25519.js';

// Signed team messages. Anyone with a team's 4-letter code can send to its channel, so every
// phone signs what it sends with its own Ed25519 key, the leader lists each member's public key
// in the session, and phones drop anything not signed by the member it claims to be from.
// Synchronous (noble), so the engine keeps its message order without async plumbing.

const enc = new TextEncoder();
const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Base64 of a 32-byte public key, and of a 64-byte signature. */
export const PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{43}=$/;
export const SIGNATURE_RE = /^[A-Za-z0-9+/]{86}==$/;

/**
 * JSON with object keys sorted, so a value signs to the same bytes on every phone whatever order
 * its fields arrive in. Undefined object fields are left out, as JSON.stringify does.
 */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`;
  if (x !== null && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(x) ?? 'null';
}

export function newSecretKey(): string {
  return toB64(ed25519.utils.randomSecretKey());
}

export function publicKeyOf(secretKey: string): string {
  return toB64(ed25519.getPublicKey(fromB64(secretKey)));
}

export function sign(value: unknown, secretKey: string): string {
  return toB64(ed25519.sign(enc.encode(canonical(value)), fromB64(secretKey)));
}

/** False for a bad signature, a wrong key or malformed input (never throws). */
export function verify(value: unknown, signature: string, publicKey: string): boolean {
  try {
    return ed25519.verify(fromB64(signature), enc.encode(canonical(value)), fromB64(publicKey));
  } catch {
    return false;
  }
}
