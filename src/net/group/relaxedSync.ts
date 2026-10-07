import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { useGame } from '../../state/store';
import { sendAction, useActions, useGroup } from './index';

/**
 * Relaxed timers across a group (§10): a support phone with relaxed timers on tells the main
 * phone, whose timers (the ones that matter) then run ×1.5 for everyone. Re-sent whenever the
 * main phone changes; the main phone forgets teammates who have left.
 */
export const RELAXED = 'relaxed';
const relaxedSchema = z.object({ on: z.boolean() });

export function useTeamRelaxedSync() {
  const g = useGroup();
  const mine = useGame((s) => s.settings.relaxed || s.relaxedThisSession);
  const support = g.active && !g.amMain;
  useEffect(() => {
    if (support && g.connected) sendAction(RELAXED, { on: mine });
  }, [support, mine, g.mainId, g.connected]);

  const peers = useRef(new Map<string, boolean>());
  const present = g.members.filter((m) => m.present).map((m) => m.id).join(',');
  const update = () => {
    const here = new Set(present.split(','));
    const on = g.active && g.amMain && [...peers.current].some(([id, v]) => v && here.has(id));
    if (useGame.getState().teamRelaxed !== on) useGame.setState({ teamRelaxed: on });
  };
  useActions((a) => {
    if (a.type !== RELAXED) return;
    const p = relaxedSchema.safeParse(a.payload);
    if (p.success) peers.current.set(a.from, p.data.on);
    update();
  });
  useEffect(() => {
    if (!g.amMain) peers.current.clear();
    update();
  }); // every render: membership and role changes are cheap to re-check
}
