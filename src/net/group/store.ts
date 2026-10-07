import { z } from 'zod';
import { create } from 'zustand';
import { parseParams } from '../../app/params';
import { useGame } from '../../state/store';
import { safeStorage } from '../../state/storage';
import type { Mode } from '../../state/types';
import { supabaseConfig } from '../supabase';
import { rememberOwnRun } from '../ownRuns';
import { newUuid } from '../uuid';
import { startBots } from './bots';
import { GroupEngine, type ActionEvent, type GameAdapter, type GroupSnapshot, type StoredGroup, type TokenStore } from './engine';
import { createHostAnnouncer } from './hostChannel';
import { MemoryHub, memoryTransport } from './memoryTransport';
import { resultSchema, sessionSchema } from './protocol';
import { relayTransport } from './relayTransport';
import { getGroupSubmitQueue, onGroupSubmitResult } from './submit';
import { supabaseTransport } from './supabaseTransport';
import type { GroupTransport } from './transport';

// App-wide group state (zustand) and the one GroupEngine for this device.
// Persisted: only the rejoin token (localStorage 'ship-it-group'): code, own member id, own
// nickname, the session (ids, name, code, mode, rotation) and the result. No other nicknames.

export const TOKEN_KEY = 'ship-it-group';

const storedSchema = z.object({
  v: z.literal(1),
  code: z.string().regex(/^[A-Z2-9]{4}$/),
  memberId: z.string().min(6).max(40),
  nick: z.string().min(1).max(16),
  session: sessionSchema.nullable(),
  result: resultSchema.nullable(),
  savedAt: z.number(),
});

export const tokenStore: TokenStore = {
  load() {
    try {
      const r = storedSchema.safeParse(JSON.parse((safeStorage.getItem(TOKEN_KEY) as string | null) ?? 'null'));
      return r.success ? (r.data as StoredGroup) : null;
    } catch {
      return null;
    }
  },
  save(s) {
    if (s) void safeStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    else void safeStorage.removeItem(TOKEN_KEY);
  },
};

const gameAdapter: GameAdapter = {
  getRun: () => useGame.getState().run,
  setRun: (run) => useGame.setState({ run }),
  subscribe: (fn) => useGame.subscribe((s, prev) => s.run !== prev.run && fn(s.run)),
};

export const IDLE: GroupSnapshot = {
  status: 'idle',
  joinError: null,
  ended: null,
  meId: null,
  myNick: null,
  session: null,
  connected: false,
  people: {},
  overrides: {},
  topics: {},
  result: null,
  stage: null,
  finished: false,
  mainId: null,
  mainLostSince: null,
  promoted: null,
  gone: [],
  submitting: false,
};

interface GroupStore {
  snap: GroupSnapshot;
  /** Which transport this build uses; null = group play unavailable. */
  transport: GroupTransport['kind'] | null;
  /** ?fakePeers: member ids this device plays for. */
  puppets: string[];
  /** Debug (?fakePeers): preview the support screen as support #n instead of playing main. */
  viewAs: number | null;
}

export const useGroupStore = create<GroupStore>()(() => ({ snap: IDLE, transport: null, puppets: [], viewAs: null }));

// ---------------------------------------------------------------------------------------
// Transport choice: ?debug=1&fakePeers=N → in-memory with bots; VITE_GROUP_RELAY_URL → the
// WebSocket test relay (e2e builds); else Supabase Realtime if configured.
// ---------------------------------------------------------------------------------------
const params = typeof window !== 'undefined' ? parseParams(window.location.search) : null;
const fakePeers = params?.debug ? params.fakePeers : 0;
const relayUrl = (import.meta.env.VITE_GROUP_RELAY_URL as string | undefined)?.trim();

let hub: MemoryHub | null = null;
let transport: GroupTransport | null = null;

function pickTransport(): GroupTransport | null {
  if (transport) return transport;
  if (fakePeers > 0) {
    hub = new MemoryHub(30);
    transport = memoryTransport(hub);
  } else if (relayUrl) transport = relayTransport(relayUrl);
  else if (supabaseConfig) transport = supabaseTransport();
  return transport;
}

/** Transport for other channels (e.g. /host); null without a backend. Never the fake hub. */
export function sharedTransport(): GroupTransport | null {
  if (fakePeers > 0) return null;
  return pickTransport();
}

const puppets = new Set<string>();
let stopBots: (() => void) | null = null;
let engine: GroupEngine | null = null;
let announcer: ReturnType<typeof createHostAnnouncer> | null = null;

function getEngine(): GroupEngine | null {
  if (engine) return engine;
  const t = pickTransport();
  useGroupStore.setState({ transport: t?.kind ?? null });
  if (!t) return null;
  engine = new GroupEngine({
    transport: t,
    game: gameAdapter,
    tokens: tokenStore,
    puppets,
    uuid: newUuid,
    onChange: (snap) => {
      useGroupStore.setState({ snap });
      announce(snap);
    },
    submit: (payload) => void getGroupSubmitQueue().enqueue(payload),
    // Every phone remembers the row id, so the board highlights "Your group" (§3.6).
    onResult: (r) => r.kind === 'ok' && rememberOwnRun(r.id),
  });
  onGroupSubmitResult((token, result) => engine?.submitResult(token, result));
  return engine;
}

/** Shows this group on /host while this phone is the main phone (or the leader in the lobby). */
function announce(snap: GroupSnapshot) {
  if (!transport || transport.kind === 'memory') return;
  announcer ??= createHostAnnouncer(transport);
  const s = snap.session;
  const live =
    s &&
    !snap.finished &&
    ((snap.status === 'lobby' && s.leaderId === snap.meId) || (snap.status === 'playing' && snap.mainId === snap.meId));
  announcer.update(
    live ? { id: s.sid, name: s.name, size: s.sizeAtStart ?? s.rotation.length, stage: snap.status === 'playing' ? snap.stage : null } : null,
  );
}

/** Is group play possible in this build (backend configured, or a test relay / fake peers)? */
export const groupAvailable = () => fakePeers > 0 || !!relayUrl || !!supabaseConfig;

function startFakePeers() {
  stopBots?.();
  puppets.clear();
  const code = engine?.snapshot().session?.code;
  if (!hub || !code) return;
  const bots = startBots(hub, code, fakePeers, newUuid);
  bots.ids.forEach((id) => puppets.add(id));
  stopBots = bots.stop;
  useGroupStore.setState({ puppets: [...puppets] });
}

// ---------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------

export const groupActions = {
  create(opts: { name: string; mode: Mode; nick: string }) {
    const e = getEngine();
    if (!e) return;
    e.create(opts);
    if (fakePeers > 0) startFakePeers();
  },
  join(opts: { code: string; nick: string }) {
    getEngine()?.join(opts);
  },
  /** On app load: reconnect if this device has a live group token. */
  resumeIfStored(): boolean {
    const stored = tokenStore.load();
    if (!stored) return false;
    if (fakePeers > 0) {
      tokenStore.save(null); // bots don't survive a reload
      return false;
    }
    const e = getEngine();
    if (!e || !e.resume(stored)) {
      tokenStore.save(null);
      return false;
    }
    // Retry an unsent submission from before the reload.
    if (stored.session?.status === 'playing') void getGroupSubmitQueue().flush();
    return true;
  },
  leave() {
    engine?.leave();
    stopBots?.();
    stopBots = null;
    puppets.clear();
    useGroupStore.setState({ puppets: [], viewAs: null });
  },
  /** Back to idle after an "ended" notice. */
  dismiss() {
    engine?.dispose();
    useGroupStore.setState({ snap: IDLE, viewAs: null });
  },
  setRotation: (rotation: string[]) => engine?.setRotation(rotation),
  start: () => engine?.start() ?? false,
  setViewAs: (viewAs: number | null) => useGroupStore.setState({ viewAs }),
  /** Test/debug: simulate this phone losing its connection. */
  debugDisconnect(offline: boolean) {
    const c = hub && transport && 'lastClient' in transport ? (transport as ReturnType<typeof memoryTransport>).lastClient() : null;
    if (c && hub) hub.setOnline(c, !offline);
  },
};

/** Main phone → all phones (last value cached, late joiners get it). `null` clears it. */
export function publish(topic: string, payload: unknown) {
  engine?.publish(topic, payload);
}

/** Support phone → main phone (e.g. `reveal_tile`, `boost_server`). */
export function sendAction(type: string, payload?: unknown) {
  engine?.sendAction(type, payload);
}

/** Main phone: listen for support actions. Returns an unsubscribe function. */
export function onAction(fn: (a: ActionEvent) => void): () => void {
  return getEngine()?.onAction(fn) ?? (() => {});
}

// Test hook for e2e: lets a spec read the group state without poking React internals.
if (typeof window !== 'undefined' && params?.debug) {
  (window as unknown as { __group: unknown }).__group = { state: () => useGroupStore.getState(), actions: groupActions };
}
