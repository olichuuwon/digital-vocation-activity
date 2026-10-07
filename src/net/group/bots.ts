import { groupChannel } from './codes';
import type { MemoryHub } from './memoryTransport';
import { PROTOCOL, parseMessage } from './protocol';

// ?fakePeers=N (with ?debug=1): N pretend teammates on an in-memory channel, so one browser can
// exercise group UI. Bots join the lobby, answer the hand-off "Ready" and all-hands calls, and
// run any behaviours registered with registerBotBehaviour (stage owners add theirs).
// This device plays the main phone for every stage, including the bots' turns.

export interface BotApi {
  id: string;
  nick: string;
  /** 0-based bot number. */
  index: number;
  sendAction(type: string, payload?: unknown): void;
}

/** Called for every topic the main phone publishes (latest value; null = cleared). */
export type BotBehaviour = (topic: string, payload: unknown, bot: BotApi) => void;

const behaviours = new Set<BotBehaviour>();

export function registerBotBehaviour(fn: BotBehaviour): () => void {
  behaviours.add(fn);
  return () => void behaviours.delete(fn);
}

const later = (ms: number, fn: () => void) => setTimeout(fn, ms);

/** Built-in: answer the hand-off Ready when it's the bot's turn, and tap all-hands calls. */
const builtIn: BotBehaviour = (topic, payload, bot) => {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (topic === 'handoff' && p.nextId === bot.id) later(800, () => bot.sendAction('handoff:ready'));
  if (topic === 'allHands' && typeof p.id === 'string') later(400 + bot.index * 500, () => bot.sendAction('allHands:tap', { id: p.id }));
};

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
          for (const b of [builtIn, ...behaviours]) b(e.k.slice(2), e.d ?? null, api);
        }
      },
    });
    const send = (msg: Record<string, unknown>) => hub.send(client, { p: PROTOCOL, from: id, sid: null, ...msg });
    const api: BotApi = {
      id,
      nick,
      index: i,
      sendAction: (type, payload) => send({ t: 'act', id: `${id.slice(0, 8)}-${++actSeq}`, type, d: payload }),
    };
    stops.push(() => hub.remove(client));
  }
  return { ids, stop: () => stops.forEach((s) => s()) };
}
