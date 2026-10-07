import { z } from 'zod';
import { sgtDate } from '../sgtTime';
import { MAX_GROUP_NAME } from './moderation';
import type { Channel, GroupTransport } from './transport';

// "Groups currently playing" on /host (§3.5.1), without storing anything: each group's main
// phone (the leader in the lobby) shows {name, size, stage} in the presence of a public
// channel for today's SGT date, and /host lists whoever is present. Names only; no nicknames.

export const hostChannelName = (date = sgtDate()) => `host:${date}`;

export const hostMetaSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(MAX_GROUP_NAME),
  size: z.number().int().min(1).max(4),
  /** null = still in the lobby. */
  stage: z.number().int().min(0).max(5).nullable(),
});
export type HostGroup = z.infer<typeof hostMetaSchema>;

export function parseHostGroups(metas: unknown[]): HostGroup[] {
  const byId = new Map<string, HostGroup>();
  for (const raw of metas) {
    const r = hostMetaSchema.safeParse(raw);
    if (!r.success) continue;
    const prev = byId.get(r.data.id);
    // Two phones of one group can overlap during a hand-off: keep the furthest stage.
    if (!prev || (r.data.stage ?? -1) > (prev.stage ?? -1)) byId.set(r.data.id, r.data);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** /host: listen to today's channel. Returns a stop function. */
export function watchHost(transport: GroupTransport, onGroups: (g: HostGroup[]) => void, onStatus?: (ok: boolean) => void) {
  const ch = transport.join(hostChannelName(), null, {
    onMessage: () => {},
    onPresence: (metas) => onGroups(parseHostGroups(metas)),
    onStatus: (st) => onStatus?.(st === 'connected'),
  });
  return () => ch.leave();
}

/** A group phone: announce (or stop announcing) this group on today's host channel. */
export function createHostAnnouncer(transport: GroupTransport) {
  let ch: Channel | null = null;
  let last = '';
  return {
    update(info: HostGroup | null) {
      const key = info ? JSON.stringify(info) : '';
      if (key === last) return;
      last = key;
      if (!info) {
        ch?.leave();
        ch = null;
        return;
      }
      // Ignore: presence-only, nothing to receive.
      if (!ch) ch = transport.join(hostChannelName(), info, { onMessage: () => {}, onPresence: () => {}, onStatus: () => {} });
      else ch.track(info);
    },
  };
}
