import { safeStorage } from './storage';

// Solo is meant for after a team game (owner decision, Nov 2026): the booth is about playing
// together. Before that, a player (or a facilitator testing, or anyone during an outage) can
// still play solo by typing the phrase, so it's never a dead end.
const KEY = 'ship-it-team-done';

export const soloUnlocked = (): boolean => safeStorage.getItem(KEY) === '1';

export const markTeamDone = () => safeStorage.setItem(KEY, '1');

/** Typed phrase that opens Solo before a team game. Case and outer spaces don't matter. */
export const SOLO_PHRASE = 'play-solo';
export const isSoloPhrase = (typed: string) => typed.trim().toLowerCase() === SOLO_PHRASE;
