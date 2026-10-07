import type { Stage } from '../../state/types';

// Main-phone rotation and support-card dealing (spec §3.5.2). Pure functions.

/**
 * Index in the rotation of the main phone for a stage. Stage 0 (prologue) is played by the
 * first in the rotation; stage k (1–4) by rotation[(k-1) % n]; the finale (5) continues the
 * cycle: rotation[4 % n]. With 4 players everyone leads one stage and the first leads the
 * finale too; with 3, members 1 and 2 lead twice; with 2, they alternate.
 */
export function nominalMainIndex(stage: Stage, n: number): number {
  if (n <= 0) return 0;
  return stage === 0 ? 0 : (stage - 1) % n;
}

/** Member id of the main phone: a takeover for that stage (main dropped) beats the rotation. */
export function mainFor(stage: Stage, rotation: readonly string[], overrides: Readonly<Record<number, string>> = {}): string | null {
  return overrides[stage] ?? rotation[nominalMainIndex(stage, rotation.length)] ?? null;
}

/** The stages (1–5) member `index` leads in an `n`-player rotation (lobby display). */
export function stagesLedBy(index: number, n: number): Stage[] {
  return ([1, 2, 3, 4, 5] as const).filter((s) => nominalMainIndex(s, n) === index);
}

/** Members after `fromId` in rotation order (wrapping), excluding `fromId`. */
function after(rotation: readonly string[], fromId: string | null): string[] {
  const i = fromId === null ? -1 : rotation.indexOf(fromId);
  return [...rotation.slice(i + 1), ...rotation.slice(0, Math.max(0, i))].filter((id) => id !== fromId);
}

/**
 * Support phones in rotation order starting after the main phone, skipping members who have
 * gone (disconnected for more than 30 s, §3.5.6). Their cards are re-dealt to the rest.
 */
export function supportsFor(rotation: readonly string[], mainId: string | null, isGone: (id: string) => boolean = () => false): string[] {
  return after(rotation, mainId).filter((id) => !isGone(id));
}

/** Who takes over when the main phone drops: the next connected member in the rotation. */
export function nextMainCandidate(rotation: readonly string[], mainId: string, isAlive: (id: string) => boolean): string | null {
  return after(rotation, mainId).find(isAlive) ?? null;
}

/**
 * Support cards for one phone (§3.5.2). One support gets every card (shown as tabs). With 2–3
 * supports, cards are dealt round-robin, one per phone; if there are more phones than cards,
 * cards are shared so every support phone still has something to do.
 */
export function dealCards<T>(cardIds: readonly T[], supportCount: number, mySupportIndex: number | null): T[] {
  if (mySupportIndex === null || supportCount <= 0 || cardIds.length === 0) return [];
  if (supportCount === 1) return [...cardIds];
  const i = mySupportIndex % supportCount;
  if (cardIds.length <= supportCount) return [cardIds[i % cardIds.length]!];
  return cardIds.filter((_, k) => k % supportCount === i);
}

/** Fisher–Yates shuffle (lobby "Shuffle order"). */
export function shuffled<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Moves the member at `index` one place up (-1) or down (+1). Out-of-range moves are no-ops. */
export function moveMember<T>(items: readonly T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= items.length || j < 0 || j >= items.length) return [...items];
  const a = [...items];
  [a[index], a[j]] = [a[j]!, a[index]!];
  return a;
}
