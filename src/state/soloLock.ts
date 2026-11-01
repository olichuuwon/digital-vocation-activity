import { safeStorage } from './storage';

// Solo opens once this phone has finished a team game (owner decision, Nov 2026): the booth is
// about playing together. ?debug=1 always opens it, so facilitators can test alone.
const KEY = 'ship-it-team-done';

export const soloUnlocked = (search = window.location.search): boolean =>
  safeStorage.getItem(KEY) === '1' || new URLSearchParams(search).get('debug') === '1';

export const markTeamDone = () => safeStorage.setItem(KEY, '1');
