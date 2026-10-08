import type { RunPayload } from '../leaderboard';
import type { GameState } from '../../state/types';
import { GroupEngine, type GameAdapter, type GroupSnapshot, type StoredGroup, type TokenStore } from './engine';
import { MemoryHub, memoryTransport, type MemoryClient } from './memoryTransport';
import { GONE_AFTER_MS, LOBBY_TTL_MS, PROMOTE_AFTER_MS, PROTOCOL, RUN_TTL_MS } from './protocol';

// Engine behaviour over an in-memory channel with fake timers: lobby, START, hand-off sync,
// takeover on a dropped main phone, expiry, rejoin and the one submission.

interface Device {
  engine: GroupEngine;
  game: GameAdapter & { run: GameState | null; local: (fn: (r: GameState) => GameState) => void };
  snap: () => GroupSnapshot;
  stored: () => StoredGroup | null;
  client: () => MemoryClient;
  submits: RunPayload[];
}

let hub: MemoryHub;
let uuidN = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, '0')}`;

function device(opts: { tokens?: StoredGroup | null } = {}): Device {
  let snap: GroupSnapshot | null = null;
  let stored: StoredGroup | null = opts.tokens ?? null;
  const listeners = new Set<(r: GameState | null) => void>();
  const game: Device['game'] = {
    run: null,
    getRun: () => game.run,
    setRun: (r) => {
      game.run = r;
      listeners.forEach((l) => l(r));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    local: (fn) => game.setRun(fn(game.run!)),
  };
  const tokens: TokenStore = { load: () => stored, save: (s) => void (stored = s) };
  const t = memoryTransport(hub);
  const submits: RunPayload[] = [];
  const engine = new GroupEngine({
    transport: t,
    game,
    tokens,
    uuid,
    onChange: (s) => void (snap = s),
    submit: (p) => void submits.push(p),
  });
  return { engine, game, snap: () => snap ?? engine.snapshot(), stored: () => stored, client: () => t.lastClient()!, submits };
}

const flush = () => vi.advanceTimersByTimeAsync(50);

async function lobbyOf(n: number) {
  const leader = device();
  leader.engine.create({ name: 'Bold Merlion', mode: 'booth', nick: 'Ann' });
  await flush();
  const code = leader.snap().session!.code;
  const members: Device[] = [];
  for (let i = 1; i < n; i++) {
    const d = device();
    d.engine.join({ code, nick: `P${i}` });
    await flush();
    members.push(d);
  }
  await flush();
  return { leader, members, all: [leader, ...members], code };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T06:00:00Z'));
  hub = new MemoryHub(5);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Rotation with the first member (not the leader) as P1, the IC who plays the finale. */
const icFirst = (leader: { engine: { snapshot(): { meId: string | null } } }, members: { engine: { snapshot(): { meId: string | null } } }[]) =>
  [members[0]!, leader, ...members.slice(1)].map((d) => d.engine.snapshot().meId!);

describe('lobby', () => {
  it('members join by code and see each other with nicknames from presence', async () => {
    const { leader, members, all } = await lobbyOf(3);
    for (const d of all) {
      expect(d.snap().status).toBe('lobby');
      expect(d.snap().session!.rotation).toHaveLength(3);
    }
    const ids = leader.snap().session!.rotation;
    expect(members[0]!.snap().people[ids[0]!]?.nick).toBe('Ann');
    expect(leader.snap().people[ids[2]!]?.nick).toBe('P2');
  });

  it('keeps nicknames out of the replicated state and the stored token', async () => {
    const { leader, members } = await lobbyOf(2);
    const token = JSON.stringify(members[0]!.stored());
    expect(token).toContain('"nick":"P1"'); // the device's own nickname only
    expect(token).not.toContain('Ann');
    expect(JSON.stringify(leader.snap().session)).not.toMatch(/Ann|P1/);
  });

  it('is capped at 4 players', async () => {
    const { code } = await lobbyOf(4);
    const fifth = device();
    fifth.engine.join({ code, nick: 'Late' });
    await flush();
    await flush();
    expect(fifth.snap().status).toBe('idle');
    expect(fifth.snap().joinError).toBe('full');
  });

  it('a wrong code times out as not found', async () => {
    const d = device();
    d.engine.join({ code: 'ZZZZ', nick: 'Lost' });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(d.snap().joinError).toBe('notFound');
    expect(d.stored()).toBeNull();
  });

  it('the leader reorders the rotation; members get it', async () => {
    const { leader, members } = await lobbyOf(3);
    const r = leader.snap().session!.rotation;
    leader.engine.setRotation([r[2]!, r[0]!, r[1]!]);
    await flush();
    expect(members[1]!.snap().session!.rotation).toEqual([r[2], r[0], r[1]]);
    // Members can't change it.
    members[0]!.engine.setRotation([r[1]!, r[0]!, r[2]!]);
    await flush();
    expect(leader.snap().session!.rotation).toEqual([r[2], r[0], r[1]]);
  });

  it('START needs 2+ players', async () => {
    const leader = device();
    leader.engine.create({ name: 'Solo Squad', mode: 'booth', nick: 'Ann' });
    await flush();
    expect(leader.engine.start()).toBe(false);
  });

  it('expires after 15 minutes without a start', async () => {
    const { all } = await lobbyOf(2);
    await vi.advanceTimersByTimeAsync(LOBBY_TTL_MS + 2_000);
    for (const d of all) {
      expect(d.snap().status).toBe('ended');
      expect(d.snap().ended).toBe('lobbyExpired');
      expect(d.stored()).toBeNull();
    }
  });

  it('frees the slot of a player missing for 30 s', async () => {
    const { leader, members } = await lobbyOf(3);
    hub.setOnline(members[1]!.client(), false);
    await vi.advanceTimersByTimeAsync(GONE_AFTER_MS + 2_000);
    expect(leader.snap().session!.rotation).toHaveLength(2);
  });

  it('the leader closing the group ends it for everyone', async () => {
    const { leader, members } = await lobbyOf(2);
    leader.engine.leave();
    await flush();
    expect(members[0]!.snap().ended).toBe('closed');
  });
});

describe('run', () => {
  it('START closes joining and gives everyone the same run in the leader’s length', async () => {
    const { leader, all, code } = await lobbyOf(3);
    expect(leader.engine.start()).toBe(true);
    await flush();
    for (const d of all) {
      expect(d.snap().status).toBe('playing');
      expect(d.game.run?.mode).toBe('booth');
      expect(d.game.run?.startedAt).toBe(leader.snap().session!.startedAt);
      expect(d.snap().session!.sizeAtStart).toBe(3);
    }
    const late = device();
    late.engine.join({ code, nick: 'Late' });
    await flush();
    await flush();
    expect(late.snap().joinError).toBe('started');
  });

  it('the main phone broadcasts; a hand-off passes the game to the next main phone', async () => {
    const { leader, members, all } = await lobbyOf(3);
    leader.engine.start();
    await flush();
    const [a, b, c] = leader.snap().session!.rotation;
    expect(leader.engine.amMain()).toBe(true); // prologue: rotation[0], the IC
    // Prologue done → stage 1 belongs to rotation[1].
    leader.game.local((r) => ({ ...r, stage: 1 }));
    await flush();
    for (const d of all) expect(d.snap().mainId).toBe(b);
    expect(members[0]!.engine.amMain()).toBe(true);
    // Supports can't move the run on.
    members[1]!.game.local((r) => ({ ...r, stage: 4 }));
    await flush();
    expect(leader.game.run?.stage).toBe(1);
    // Stage 1 done → stage 2 belongs to rotation[2].
    members[0]!.game.local((r) => ({ ...r, stage: 2, stars: { ...r.stars, data: 3 } }));
    await flush();
    for (const d of all) {
      expect(d.snap().stage).toBe(2);
      expect(d.snap().mainId).toBe(c);
    }
    expect(leader.game.run?.stars.data).toBe(3);
    expect(members[0]!.engine.amMain()).toBe(false);
    expect(members[1]!.engine.amMain()).toBe(true);
    // The old main's late updates are ignored now.
    members[0]!.game.local((r) => ({ ...r, levelIndex: 5 }));
    members[1]!.game.local((r) => ({ ...r, levelIndex: 1 }));
    await flush();
    expect(leader.game.run?.levelIndex).toBe(1);
    expect(a).toBe(leader.snap().meId);
  });

  it('supports send actions; only the main phone receives them', async () => {
    const { leader, members } = await lobbyOf(3);
    leader.engine.start();
    await flush();
    const got: string[] = [];
    const other: string[] = [];
    leader.engine.onAction((x) => got.push(`${x.type}:${JSON.stringify(x.payload)}`));
    members[1]!.engine.onAction((x) => other.push(x.type));
    members[0]!.engine.sendAction('boost_server', 2);
    await flush();
    expect(got).toEqual(['boost_server:2']);
    expect(other).toEqual([]);
  });

  it('topics reach every phone, including one that joins the channel later', async () => {
    const { leader, members } = await lobbyOf(2);
    leader.engine.start();
    await flush();
    leader.engine.publish('s1.seen', { ids: [14] });
    await flush();
    expect(members[0]!.snap().topics['s1.seen']).toEqual({ ids: [14] });
    // Reload: a fresh engine resumes from the token and catches up.
    const token = members[0]!.stored()!;
    members[0]!.engine.dispose();
    const again = device({ tokens: token });
    again.game.run = members[0]!.game.run;
    expect(again.engine.resume(token)).toBe(true);
    await flush();
    await flush();
    expect(again.snap().status).toBe('playing');
    expect(again.snap().topics['s1.seen']).toEqual({ ids: [14] });
  });

  it('throttles a busy topic to one send per 150 ms, latest value wins', async () => {
    const { leader, members } = await lobbyOf(2);
    leader.engine.start();
    await flush();
    const seen: unknown[] = [];
    const orig = members[0]!.client().handlers.onMessage;
    members[0]!.client().handlers.onMessage = (m) => {
      const msg = m as { t?: string; e?: { k: string; d: unknown } };
      if (msg.t === 'put' && msg.e?.k === 't:load') seen.push(msg.e.d);
      orig(m);
    };
    for (let i = 1; i <= 10; i++) leader.engine.publish('load', i);
    expect(leader.snap().topics.load).toBe(10); // local value is immediate
    await vi.advanceTimersByTimeAsync(400);
    expect(seen).toEqual([1, 10]);
    expect(members[0]!.snap().topics.load).toBe(10);
  });

  it('pauses when the main phone drops, then promotes the next player after 20 s', async () => {
    const { leader, members } = await lobbyOf(3);
    leader.engine.start();
    await flush();
    // Prologue done: stage 1 belongs to rotation[1] (members[0]).
    leader.game.local((r) => ({ ...r, stage: 1 }));
    await flush();
    const main = members[0]!;
    main.game.local((r) => ({ ...r, levelIndex: 1 }));
    await flush();
    hub.setOnline(main.client(), false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(members[1]!.snap().mainLostSince).not.toBeNull();
    expect(members[1]!.engine.amMain()).toBe(false);
    await vi.advanceTimersByTimeAsync(PROMOTE_AFTER_MS);
    const b = members[1]!;
    expect(b.engine.amMain()).toBe(true);
    expect(leader.snap().mainId).toBe(b.snap().meId);
    expect(leader.snap().promoted?.id).toBe(b.snap().meId);
    // Resumes from the last broadcast state.
    expect(b.game.run?.stage).toBe(1);
    expect(b.game.run?.levelIndex).toBe(1);
    // The old main comes back: it's a support now and mirrors the new main.
    hub.setOnline(main.client(), true);
    await flush();
    await flush();
    expect(main.engine.amMain()).toBe(false);
    b.game.local((r) => ({ ...r, levelIndex: 2 }));
    await flush();
    expect(main.game.run?.levelIndex).toBe(2);
  });

  it('a main phone back within 20 s keeps its role', async () => {
    const { leader, members } = await lobbyOf(2);
    leader.engine.start();
    await flush();
    hub.setOnline(leader.client(), false);
    await vi.advanceTimersByTimeAsync(10_000);
    hub.setOnline(leader.client(), true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(leader.engine.amMain()).toBe(true);
    expect(members[0]!.snap().mainLostSince).toBeNull();
  });

  it('submits once from the leader and shares the rank with everyone', async () => {
    const { leader, members, all } = await lobbyOf(3);
    // The leader moves a teammate to P1 (the IC): that phone plays the finale, the leader's submits.
    leader.engine.setRotation(icFirst(leader, members));
    await flush();
    leader.engine.start();
    await flush();
    vi.advanceTimersByTime(9 * 60_000);
    members[0]!.game.local((r) => ({ ...r, stage: 5 }));
    await flush();
    const fin = members[0]!;
    expect(fin.engine.amMain()).toBe(true);
    fin.game.local((r) => ({ ...r, finishedAt: Date.now(), scores: { ...r.scores, finale: { familiesReached: 812, incidentsRouted: 6 } } }));
    await flush();
    expect(leader.submits).toHaveLength(1);
    expect(fin.submits).toHaveLength(0);
    expect(members[1]!.submits).toHaveLength(0);
    const p = leader.submits[0]!;
    expect(p).toMatchObject({ groupName: 'Bold Merlion', groupSize: 3, mode: 'booth', families: 812 });
    expect(p.durationSec).toBeGreaterThanOrEqual(540);
    expect(JSON.stringify(p)).not.toMatch(/Ann|P1|P2/);
    leader.engine.submitResult(p.groupToken, { kind: 'ok', id: 42, rankToday: 3 });
    await flush();
    for (const d of all) expect(d.snap().result).toEqual({ kind: 'ok', id: 42, rankToday: 3 });
    // No second submission after the result.
    vi.advanceTimersByTime(5_000);
    expect(leader.submits).toHaveLength(1);
  });

  it('the finale main submits if the leader is gone', async () => {
    const { leader, members } = await lobbyOf(3);
    leader.engine.setRotation(icFirst(leader, members));
    await flush();
    leader.engine.start();
    await flush();
    members[0]!.game.local((r) => ({ ...r, stage: 5 }));
    await flush();
    hub.setOnline(leader.client(), false);
    await vi.advanceTimersByTimeAsync(2_000);
    members[0]!.game.local((r) => ({ ...r, finishedAt: Date.now() }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(members[0]!.submits).toHaveLength(1);
  });

  it('a run expires after 60 minutes', async () => {
    const { leader, all } = await lobbyOf(2);
    leader.engine.start();
    await flush();
    await vi.advanceTimersByTimeAsync(RUN_TTL_MS + 2_000);
    for (const d of all) expect(d.snap().ended).toBe('runExpired');
  });

  it('ignores messages from another group sharing the code, and junk', async () => {
    const { leader, members, code } = await lobbyOf(2);
    leader.engine.start();
    await flush();
    const rogue = hub.connect(`group:${code}`, null, { onMessage: () => {}, onPresence: () => {}, onStatus: () => {} });
    await flush();
    hub.send(rogue, { p: PROTOCOL, from: 'rogue-123', sid: '11111111-1111-4111-8111-111111111111', t: 'put', e: { k: 't:x', v: 999, by: 'rogue-123', d: 1 } });
    hub.send(rogue, { p: PROTOCOL, from: 'rogue-123', sid: null, t: 'put', e: { k: 't:x', v: 999, by: 'rogue-123', d: 1 } });
    hub.send(rogue, { nonsense: true });
    await flush();
    expect(members[0]!.snap().topics.x).toBeUndefined();
    expect(members[0]!.snap().status).toBe('playing');
  });
});
