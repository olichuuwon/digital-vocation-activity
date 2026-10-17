import { groupChannel } from './codes';
import type { MemoryHub } from './memoryTransport';
import { PROTOCOL, parseMessage } from './protocol';

// ?fakePeers=N (with ?debug=1): N pretend teammates on an in-memory channel, so one browser can
// exercise team UI. Bots join the lobby and answer the hand-off "Ready" when it's their turn.
// This device plays the main phone for every stage, including the bots' turns.

const later = (ms: number, fn: () => void) => setTimeout(fn, ms);

export const BOT_NAMES = ['Bot Ana', 'Bot Ben', 'Bot Cai'];

/** Starts `count` bots on the group's channel. Returns a stop function. */
export function startBots(hub: MemoryHub, code: string, count: number, uuid: () => string): { ids: string[]; stop: () => void } {
  const stops: (() => void)[] = [];
  const ids: string[] = [];
  for (let i = 0; i < Math.min(3, count); i++) {
    const id = uuid();
    ids.push(id);
    const nick = BOT_NAMES[i]!;
    let actSeq = 0;
    const seen = new Map<string, number>();
    const client = hub.connect(groupChannel(code), { id, nick }, {
      onStatus: (st) => {
        if (st === 'connected') send({ t: 'hello', join: true });
      },
      onPresence: () => {},
      onMessage: (raw) => {
        const m = parseMessage(raw);
        if (!m) return;
        const entries = m.t === 'put' ? [m.e] : m.t === 'sync' ? m.es : [];
        for (const e of entries) {
          if (!e.k.startsWith('t:') || (seen.get(e.k) ?? -1) >= e.v) continue;
          seen.set(e.k, e.v);
          // The hand-off topic: say Ready when it's this bot's turn.
          const d = (e.d ?? {}) as Record<string, unknown>;
          if (e.k === 't:handoff' && d.nextId === id) later(800, () => sendAction('handoff:ready'));
        }
      },
    });
    const send = (msg: Record<string, unknown>) => hub.send(client, { p: PROTOCOL, from: id, sid: null, ...msg });
    const sendAction = (type: string) => send({ t: 'act', id: `${id.slice(0, 8)}-${++actSeq}`, type });
    stops.push(() => hub.remove(client));
  }
  return { ids, stop: () => stops.forEach((s) => s()) };
}
