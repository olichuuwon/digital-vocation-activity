import type { Mode, Stage } from '../state/types';

// URL params from spec §2 and §11: ?mode=booth|full|quick, ?debug=1, ?stage=N, ?relaxed=1, ?fakePeers=N
export interface UrlParams {
  mode: Mode | null;
  debug: boolean;
  stage: Stage | null;
  relaxed: boolean;
  fakePeers: number;
}

const truthy = (v: string | null) => v === '1' || v === 'true';

export function parseParams(search: string): UrlParams {
  const p = new URLSearchParams(search);

  const rawMode = p.get('mode');
  const mode: Mode | null =
    rawMode === 'booth' || rawMode === 'quick' ? 'booth' : rawMode === 'full' ? 'full' : null;

  const rawStage = p.get('stage');
  const n = rawStage === null || rawStage === '' ? NaN : Number(rawStage);
  const stage = Number.isInteger(n) && n >= 0 && n <= 5 ? (n as Stage) : null;

  const peers = Number(p.get('fakePeers'));
  const fakePeers = Number.isInteger(peers) ? Math.min(Math.max(peers, 0), 3) : 0;

  return { mode, debug: truthy(p.get('debug')), stage, relaxed: truthy(p.get('relaxed')), fakePeers };
}
