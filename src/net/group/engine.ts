import type { RunPayload } from '../leaderboard';
import { newRun } from '../../state/store';
import type { GameState, Mode, Stage } from '../../state/types';
import { generateCode, groupChannel } from './codes';
import {
  BEAT_MS,
  GONE_AFTER_MS,
  JOIN_TIMEOUT_MS,
  LOBBY_TTL_MS,
  MAIN_SILENT_MS,
  MAX_MEMBERS,
  PROMOTE_AFTER_MS,
  PROTOCOL,
  RUN_TTL_MS,
  newer,
  parseEntryData,
  parseMessage,
  parsePresence,
  type Entry,
  type GroupResult,
  type Message,
  type OutMessage,
  type Session,
} from './protocol';
import { mainFor, nextMainCandidate } from './rotation';
import type { Channel, ChannelStatus, GroupTransport } from './transport';

/*
 * Group engine: one per device. Replicates a small key/value state across the group's
 * channel and decides who runs the game. See ./index.ts for the sync model (the contract).
 *
 * Replicated keys (last-writer-wins on a Lamport version):
 *   session  written by the leader: name, code, mode, rotation, status, start time, run token
 *   run      the shared GameState, written by the main phone
 *   ov:<n>   takeover for stage n (the main phone dropped; the next in the rotation claims it)
 *   result   the leaderboard result (row id + today's rank), written by the submitting device
 *   t:<name> topics published by the main phone for support phones
 */

export interface GameAdapter {
  getRun(): GameState | null;
  setRun(run: GameState): void;
  subscribe(fn: (run: GameState | null) => void): () => void;
}

/** What this device remembers to rejoin after a reload (localStorage). No other nicknames. */
export interface StoredGroup {
  v: 1;
  code: string;
  memberId: string;
  /** This device's own nickname (device-only, §3.5.1). */
  nick: string;
  session: Session | null;
  result: GroupResult | null;
  savedAt: number;
}

export interface TokenStore {
  load(): StoredGroup | null;
  save(s: StoredGroup | null): void;
}

export type GroupStatus = 'idle' | 'joining' | 'lobby' | 'playing' | 'ended';
export type JoinError = 'notFound' | 'full' | 'started' | 'noNetwork';
export type EndReason = 'closed' | 'lobbyExpired' | 'runExpired' | 'left';

export interface Person {
  id: string;
  /** From presence (ephemeral); null if we haven't seen them since a reload. */
  nick: string | null;
  present: boolean;
  /** When they went missing (null = here). */
  lostSince: number | null;
}

export interface GroupSnapshot {
  status: GroupStatus;
  joinError: JoinError | null;
  ended: EndReason | null;
  meId: string | null;
  myNick: string | null;
  session: Session | null;
  connected: boolean;
  people: Record<string, Person>;
  overrides: Record<number, string>;
  topics: Record<string, unknown>;
  result: GroupResult | null;
  /** Stage of the shared run this device holds (null before the start). */
  stage: Stage | null;
  finished: boolean;
  mainId: string | null;
  /** The main phone went missing at this time (pause, §3.5.6). */
  mainLostSince: number | null;
  /** Latest takeover this device saw, for a "{name} now has the main phone" notice. */
  promoted: { stage: number; id: string; at: number } | null;
  /** Members missing for 30 s+ (left out of support dealing). */
  gone: string[];
  /** Is a leaderboard submission queued on this device? */
  submitting: boolean;
}

export interface ActionEvent {
  type: string;
  payload: unknown;
  from: string;
}

export interface EngineDeps {
  transport: GroupTransport;
  game: GameAdapter;
  tokens: TokenStore;
  onChange: (snap: GroupSnapshot) => void;
  /** Queue the leaderboard submission (idempotent per token). */
  submit?: (payload: RunPayload) => void;
  /** A result arrived (any device): remember the row id for "Your group" highlighting. */
  onResult?: (result: GroupResult) => void;
  /** Member ids this device also plays for (?fakePeers bots). */
  puppets?: ReadonlySet<string>;
  now?: () => number;
  random?: () => number;
  uuid: () => string;
  /** Tick interval (ms); tests can shrink it. */
  tickMs?: number;
}

/** Minimum gap between two sends of the same topic (ms). */
export const TOPIC_MIN_MS = 150;

const pos = (r: GameState) => r.stage * 1000 + r.levelIndex;
const isAhead = (a: GameState, b: GameState) => pos(a) > pos(b) || (pos(a) === pos(b) && !!a.finishedAt && !b.finishedAt);

export class GroupEngine {
  private status: GroupStatus = 'idle';
  private joinError: JoinError | null = null;
  private ended: EndReason | null = null;
  private me: string | null = null;
  private nick: string | null = null;
  private code: string | null = null;
  private channel: Channel | null = null;
  private connected = false;
  private connectedSince = 0;
  private entries = new Map<string, Entry>();
  private clock = 0;
  private held: GameState | null = null;
  private heldBy: string | null = null;
  private applying = false;
  private present = new Set<string>();
  private nicks = new Map<string, string>();
  private lastHeard = new Map<string, number>();
  private lostSince = new Map<string, number>();
  private mainSeen: { id: string | null; since: number } = { id: null, since: 0 };
  private lastSent = 0;
  private promoted: GroupSnapshot['promoted'] = null;
  private handlers = new Set<(a: ActionEvent) => void>();
  private seenActions: string[] = [];
  private pending: { msg: OutMessage; at: number }[] = [];
  private submitted = false;
  private joinDeadline = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubGame: (() => void) | null = null;
  private lastSnap = '';
  private topicSends = new Map<string, { at: number; timer: ReturnType<typeof setTimeout> | null }>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private deps: EngineDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
  }

  // -------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------

  /** Leader: create a lobby. */
  create(opts: { name: string; mode: Mode; nick: string }) {
    this.reset();
    this.me = this.deps.uuid();
    this.nick = opts.nick;
    const now = this.now();
    const session: Session = {
      sid: this.deps.uuid(),
      code: generateCode(this.random),
      name: opts.name,
      mode: opts.mode,
      leaderId: this.me,
      rotation: [this.me],
      status: 'lobby',
      closedReason: null,
      createdAt: now,
      startedAt: null,
      sizeAtStart: null,
      token: this.deps.uuid(),
    };
    this.code = session.code;
    this.status = 'lobby';
    this.putLocal('session', session);
    this.open();
  }

  /** Join by code (QR link or typed). */
  join(opts: { code: string; nick: string }) {
    this.reset();
    this.me = this.deps.uuid();
    this.nick = opts.nick;
    this.code = opts.code;
    this.status = 'joining';
    this.joinDeadline = this.now() + JOIN_TIMEOUT_MS;
    this.save();
    this.open();
  }

  /** Rejoin after a reload with the token from localStorage. Returns false if it expired. */
  resume(stored: StoredGroup): boolean {
    const now = this.now();
    const s = stored.session;
    if (s && expired(s, now, this.deps.game.getRun())) return false;
    if (!s && now - stored.savedAt > LOBBY_TTL_MS) return false;
    this.reset();
    this.me = stored.memberId;
    this.nick = stored.nick;
    this.code = stored.code;
    if (s) {
      this.entries.set('session', { k: 'session', v: 0, by: s.leaderId, d: s });
      this.status = s.status === 'playing' ? 'playing' : 'lobby';
      const run = this.deps.game.getRun();
      if (s.status === 'playing' && run && run.startedAt === s.startedAt) this.held = run;
    } else {
      this.status = 'joining';
      this.joinDeadline = now + JOIN_TIMEOUT_MS;
    }
    if (stored.result) {
      this.entries.set('result', { k: 'result', v: 0, by: this.me, d: stored.result });
      this.submitted = true;
    }
    this.open();
    return true;
  }

  /** Leave the group (and close the lobby if this is the leader). */
  leave() {
    const s = this.session;
    if (s && this.isLeader && s.status === 'lobby') this.putLocal('session', { ...s, status: 'closed', closedReason: 'closed' });
    this.send({ t: 'bye' });
    this.end('left');
  }

  /** Leader, lobby only: set the main-phone order. Must be a permutation of the members. */
  setRotation(rotation: string[]) {
    const s = this.session;
    if (!s || !this.isLeader || s.status !== 'lobby') return;
    if (rotation.length !== s.rotation.length || !rotation.every((id) => s.rotation.includes(id))) return;
    this.putLocal('session', { ...s, rotation });
  }

  /** Leader: START. Joining closes; members still missing are left out. Needs 2+. */
  start(): boolean {
    const s = this.session;
    if (!s || !this.isLeader || s.status !== 'lobby') return false;
    const rotation = s.rotation.filter((id) => this.alive(id));
    if (rotation.length < 2) return false;
    const startedAt = this.now();
    const session: Session = { ...s, rotation, status: 'playing', startedAt, sizeAtStart: rotation.length };
    this.putLocal('session', session);
    this.status = 'playing';
    const run = newRun(s.mode, startedAt);
    this.held = run;
    this.heldBy = this.me;
    this.putLocal('run', run);
    this.applyRun(run);
    this.emit();
    return true;
  }

  /** Main phone → everyone. Keep payloads small; `null` clears the topic. */
  publish(topic: string, payload: unknown) {
    if (!this.session || !this.me) return;
    const k = `t:${topic}`;
    const e: Entry = { k, v: ++this.clock, by: this.me, d: payload ?? null };
    this.entries.set(k, e);
    this.emit();
    // At most one send per topic every 150 ms (the latest value wins), so a stage that
    // publishes on every sim tick stays well inside the free tier's message limits.
    const t = this.topicSends.get(k) ?? { at: 0, timer: null };
    this.topicSends.set(k, t);
    if (t.timer) return;
    const wait = Math.max(0, t.at + TOPIC_MIN_MS - this.now());
    const go = () => {
      t.timer = null;
      t.at = this.now();
      const latest = this.entries.get(k);
      if (latest) this.send({ t: 'put', e: latest });
    };
    if (wait === 0) go();
    else t.timer = setTimeout(go, wait);
  }

  /** Support → main phone. Queued for a few seconds while offline. */
  sendAction(type: string, payload?: unknown) {
    if (!this.me) return;
    const id = `${this.me.slice(0, 8)}-${Math.floor(this.random() * 1e9).toString(36)}`;
    // A device that is itself the main (solo testing, fakePeers) handles its own actions.
    if (this.amMain()) {
      this.deliverAction({ type, payload, from: this.me });
      return;
    }
    this.send({ t: 'act', id, type, d: payload });
  }

  /** Main phone: receive support actions. Returns an unsubscribe function. */
  onAction(fn: (a: ActionEvent) => void) {
    this.handlers.add(fn);
    return () => void this.handlers.delete(fn);
  }

  /** Act as a bot's action arriving (fakePeers). */
  injectAction(a: ActionEvent) {
    this.deliverAction(a);
  }

  /** The leaderboard submission finished (from the submit queue). */
  submitResult(token: string, result: GroupResult) {
    if (this.session?.token !== token) return;
    this.putLocal('result', result);
    this.deps.onResult?.(result);
    this.save();
    this.emit();
  }

  /** Test/debug: drop the connection (presence follows on the server side). */
  get channelHandle() {
    return this.channel;
  }

  dispose() {
    for (const t of this.topicSends.values()) if (t.timer) clearTimeout(t.timer);
    this.topicSends.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubGame?.();
    this.unsubGame = null;
    this.channel?.leave();
    this.channel = null;
  }

  snapshot(): GroupSnapshot {
    const now = this.now();
    const s = this.session;
    const ids = new Set([...(s?.rotation ?? []), ...this.present]);
    const people: Record<string, Person> = {};
    for (const id of ids) {
      people[id] = {
        id,
        nick: id === this.me ? this.nick : (this.nicks.get(id) ?? null),
        present: id === this.me ? this.connected : this.present.has(id),
        lostSince: this.lostSince.get(id) ?? null,
      };
    }
    const mainId = this.mainId();
    const lost = mainId && !this.controls(mainId) ? (this.lostSince.get(mainId) ?? null) : null;
    return {
      status: this.status,
      joinError: this.joinError,
      ended: this.ended,
      meId: this.me,
      myNick: this.nick,
      session: s,
      connected: this.connected,
      people,
      overrides: this.overrides(),
      topics: this.topics(),
      result: (this.entries.get('result')?.d as GroupResult | undefined) ?? null,
      stage: this.held?.stage ?? null,
      finished: !!this.held?.finishedAt,
      mainId,
      mainLostSince: this.status === 'playing' && !this.held?.finishedAt ? lost : null,
      promoted: this.promoted,
      gone: (s?.rotation ?? []).filter((id) => this.isGone(id, now)),
      submitting: this.submitted && !this.entries.has('result'),
    };
  }

  // -------------------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------------------

  private get session(): Session | null {
    return (this.entries.get('session')?.d as Session | undefined) ?? null;
  }

  private get isLeader() {
    return !!this.me && this.session?.leaderId === this.me;
  }

  private controls(id: string | null) {
    return !!id && (id === this.me || !!this.deps.puppets?.has(id));
  }

  amMain() {
    return this.status === 'playing' && this.controls(this.mainId());
  }

  private overrides(): Record<number, string> {
    const out: Record<number, string> = {};
    for (const [k, e] of this.entries) if (k.startsWith('ov:')) out[Number(k.slice(3))] = e.d as string;
    return out;
  }

  private topics(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, e] of this.entries) if (k.startsWith('t:') && e.d !== null) out[k.slice(2)] = e.d;
    return out;
  }

  private mainFor(stage: Stage) {
    const s = this.session;
    return s ? mainFor(stage, s.rotation, this.overrides()) : null;
  }

  private mainId() {
    if (this.status !== 'playing') return null;
    return this.mainFor(this.held?.stage ?? 0);
  }

  private alive(id: string): boolean {
    if (this.controls(id)) return id === this.me ? this.connected : this.connected && this.present.has(id);
    if (!this.present.has(id)) return false;
    if (this.status === 'playing' && id === this.mainId() && !this.held?.finishedAt) {
      const heard = Math.max(this.lastHeard.get(id) ?? 0, this.mainSeen.since);
      return this.now() - heard < MAIN_SILENT_MS;
    }
    return true;
  }

  private isGone(id: string, now = this.now()) {
    const t = this.lostSince.get(id);
    return t !== undefined && now - t >= GONE_AFTER_MS;
  }

  // -------------------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------------------

  private reset() {
    this.dispose();
    this.status = 'idle';
    this.joinError = null;
    this.ended = null;
    this.entries.clear();
    this.clock = 0;
    this.held = null;
    this.heldBy = null;
    this.present.clear();
    this.nicks.clear();
    this.lastHeard.clear();
    this.lostSince.clear();
    this.mainSeen = { id: null, since: 0 };
    this.promoted = null;
    this.pending = [];
    this.submitted = false;
    this.connected = false;
    this.lastSnap = '';
  }

  private open() {
    if (!this.code || !this.me || !this.nick) return;
    this.channel = this.deps.transport.join(groupChannel(this.code), { id: this.me, nick: this.nick }, {
      onMessage: (raw) => this.onMessage(raw),
      onPresence: (metas) => this.onPresence(metas),
      onStatus: (st) => this.onStatus(st),
    });
    this.unsubGame = this.deps.game.subscribe((run) => this.onLocalRun(run));
    this.timer = setInterval(() => this.tick(), this.deps.tickMs ?? 1000);
    this.emit();
  }

  private onStatus(st: ChannelStatus) {
    const was = this.connected;
    this.connected = st === 'connected';
    if (st === 'unavailable' && this.status === 'joining') return this.failJoin('noNetwork');
    if (this.connected && !was) {
      this.connectedSince = this.now();
      const s = this.session;
      const join = this.status === 'joining' || (!!s && s.status === 'lobby' && !s.rotation.includes(this.me!));
      this.send({ t: 'hello', join });
      if (s) this.send({ t: 'sync', es: [...this.entries.values()] });
      const fresh = this.pending.filter((p) => this.now() - p.at < 10_000);
      this.pending = [];
      for (const p of fresh) this.send(p.msg);
    }
    this.emit();
  }

  private onPresence(raw: unknown[]) {
    const metas = parsePresence(raw);
    this.present = new Set(metas.map((m) => m.id).filter((id) => id !== this.me));
    for (const m of metas) if (m.id !== this.me) this.nicks.set(m.id, m.nick);
    this.updateLiveness();
    this.emit();
  }

  private send(msg: OutMessage) {
    if (!this.me) return;
    const full = { ...msg, p: PROTOCOL, from: this.me, sid: this.session?.sid ?? null } as Message;
    if (!this.connected || !this.channel) {
      if (msg.t === 'act') this.pending = [...this.pending.slice(-19), { msg, at: this.now() }];
      return;
    }
    this.lastSent = this.now();
    this.channel.send(full);
  }

  private end(reason: EndReason) {
    this.dispose();
    this.status = 'ended';
    this.ended = reason;
    this.deps.tokens.save(null);
    this.emit();
  }

  private failJoin(err: JoinError) {
    this.dispose();
    this.status = 'idle';
    this.joinError = err;
    this.deps.tokens.save(null);
    this.emit();
  }

  private save() {
    if (!this.me || !this.code || !this.nick || this.status === 'ended' || this.status === 'idle') return;
    this.deps.tokens.save({
      v: 1,
      code: this.code,
      memberId: this.me,
      nick: this.nick,
      session: this.session,
      result: (this.entries.get('result')?.d as GroupResult | undefined) ?? null,
      savedAt: this.now(),
    });
  }

  private emit() {
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this.lastSnap) return;
    this.lastSnap = key;
    this.deps.onChange(snap);
  }

  // -------------------------------------------------------------------------------------
  // Replicated entries
  // -------------------------------------------------------------------------------------

  private putLocal(k: string, d: unknown) {
    if (!this.me) return;
    const e: Entry = { k, v: ++this.clock, by: this.me, d };
    this.entries.set(k, e);
    this.send({ t: 'put', e });
    if (k === 'session') this.save();
    this.emit();
  }

  /** Applies one received entry. Returns true if it changed anything. */
  private applyEntry(raw: Entry): boolean {
    const d = parseEntryData(raw.k, raw.d);
    if (d === undefined) return false;
    const e: Entry = { ...raw, d };
    this.clock = Math.max(this.clock, e.v);
    const cur = this.entries.get(e.k);
    const s = this.session;

    if (e.k === 'session') return this.applySession(e, d as Session, cur);
    if (!s || !s.rotation.includes(e.by)) return false;

    if (e.k === 'run') return this.applyRunEntry(e, d as GameState);

    if (!newer(e, cur)) return false;
    if (e.k.startsWith('ov:')) {
      if (e.d !== e.by) return false; // you can only claim the main phone for yourself
      this.entries.set(e.k, e);
      this.promoted = { stage: Number(e.k.slice(3)), id: e.by, at: this.now() };
      return true;
    }
    this.entries.set(e.k, e);
    if (e.k === 'result') {
      this.deps.onResult?.(d as GroupResult);
      this.save();
    }
    return true;
  }

  private applySession(e: Entry, s: Session, cur: Entry | undefined): boolean {
    if (e.by !== s.leaderId || s.code !== this.code) return false;
    const mine = this.session;
    if (mine && (mine.sid !== s.sid || mine.leaderId !== s.leaderId)) return false;
    if (mine && !newer(e, cur)) return false;
    this.entries.set('session', e);
    const me = this.me!;
    if (s.status === 'closed') {
      if (!this.isLeader) this.end(s.closedReason === 'lobbyExpired' ? 'lobbyExpired' : 'closed');
      return true;
    }
    if (s.rotation.includes(me)) {
      this.status = s.status === 'playing' ? 'playing' : 'lobby';
      this.joinError = null;
    } else if (this.status === 'joining') {
      if (s.status === 'playing' || s.rotation.length >= MAX_MEMBERS) {
        this.failJoin(s.status === 'playing' ? 'started' : 'full');
        return true;
      }
      // Lobby with room: the leader will add us; keep waiting.
    } else if (s.status === 'playing') {
      // Left out at START (we were missing): we can't join a started run.
      this.end('closed');
      return true;
    } else {
      // Dropped from the lobby while away: ask again.
      this.status = 'joining';
      this.joinDeadline = this.now() + JOIN_TIMEOUT_MS;
      this.send({ t: 'hello', join: true });
    }
    this.save();
    return true;
  }

  private applyRunEntry(e: Entry, run: GameState): boolean {
    const s = this.session!;
    if (s.status !== 'playing' || run.startedAt !== s.startedAt) return false;
    if (this.controls(e.by)) return false; // our own run echoed back
    const held = this.held;
    let ok = false;
    if (!held) ok = true;
    else {
      const main = this.mainFor(held.stage);
      if (e.by === main && !this.controls(main)) {
        ok = this.heldBy !== e.by || newer(e, this.entries.get('run'));
      } else if (!this.controls(main) && isAhead(run, held)) {
        // Catching up after being away: accept progress from anyone who led a stage up to it.
        ok = ([0, 1, 2, 3, 4, 5] as Stage[]).some((st) => st <= run.stage && this.mainFor(st) === e.by);
      }
    }
    if (!ok) return false;
    this.entries.set('run', e);
    this.held = run;
    this.heldBy = e.by;
    this.applyRun(run);
    return true;
  }

  private applyRun(run: GameState) {
    this.applying = true;
    try {
      this.deps.game.setRun(run);
    } finally {
      this.applying = false;
    }
  }

  private onLocalRun(run: GameState | null) {
    if (this.applying || !run || this.status !== 'playing') return;
    const s = this.session;
    if (!s || run.startedAt !== s.startedAt || run === this.held) return;
    // Only the main phone for the stage we were on may move the shared run on (this is
    // also how a hand-off reaches the next main phone).
    const main = this.mainFor(this.held?.stage ?? 0);
    if (!this.controls(main)) return;
    this.held = run;
    this.heldBy = this.me;
    this.putLocal('run', run);
    this.updateLiveness();
    this.maybeSubmit();
    this.emit();
  }

  // -------------------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------------------

  private onMessage(raw: unknown) {
    const m = parseMessage(raw);
    if (!m || m.from === this.me) return;
    const s = this.session;
    if (s && m.sid && m.sid !== s.sid) return; // another group that happens to share the code
    this.lastHeard.set(m.from, this.now());
    let changed = false;
    switch (m.t) {
      case 'hello': {
        if (this.isLeader && s && m.join) changed = this.admit(m.from);
        if (this.session) this.send({ t: 'sync', es: [...this.entries.values()] });
        break;
      }
      case 'put':
        changed = this.applyEntry(m.e);
        break;
      case 'sync': {
        // Session first, then takeovers, so the run is judged against the right main phone.
        const order = (k: string) => (k === 'session' ? 0 : k.startsWith('ov:') ? 1 : k === 'run' ? 2 : 3);
        for (const e of [...m.es].sort((a, b) => order(a.k) - order(b.k))) changed = this.applyEntry(e) || changed;
        break;
      }
      case 'act':
        if (this.amMain() && s?.rotation.includes(m.from) && !this.seenActions.includes(m.id)) {
          this.seenActions = [...this.seenActions.slice(-99), m.id];
          this.deliverAction({ type: m.type, payload: m.d, from: m.from });
        }
        break;
      case 'bye':
        this.present.delete(m.from);
        this.lostSince.set(m.from, this.now() - GONE_AFTER_MS - PROMOTE_AFTER_MS);
        if (this.isLeader && s?.status === 'lobby' && s.rotation.includes(m.from)) {
          this.putLocal('session', { ...s, rotation: s.rotation.filter((id) => id !== m.from) });
        }
        changed = true;
        break;
      case 'beat':
        break;
    }
    if (changed) {
      this.updateLiveness();
      this.maybeSubmit();
    }
    this.emit();
  }

  /** Leader: let a new player into the lobby (if there's room and we haven't started). */
  private admit(id: string): boolean {
    const s = this.session!;
    if (s.status !== 'lobby' || s.rotation.includes(id) || s.rotation.length >= MAX_MEMBERS) return false;
    this.putLocal('session', { ...s, rotation: [...s.rotation, id] });
    return true;
  }

  private deliverAction(a: ActionEvent) {
    for (const h of this.handlers) {
      try {
        h(a);
      } catch {
        /* a broken handler mustn't break sync */
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // Timers: liveness, takeover, expiry, heartbeat, submission
  // -------------------------------------------------------------------------------------

  private updateLiveness() {
    const now = this.now();
    const main = this.mainId();
    if (main !== this.mainSeen.id) this.mainSeen = { id: main, since: now };
    for (const id of this.session?.rotation ?? []) {
      if (id === this.me) continue;
      if (this.alive(id)) this.lostSince.delete(id);
      else if (!this.lostSince.has(id)) this.lostSince.set(id, now);
    }
  }

  tick() {
    const now = this.now();
    const s = this.session;
    if (this.status === 'joining' && now > this.joinDeadline) return this.failJoin('notFound');
    if (!s) return this.emit();

    if (s.status === 'lobby' && now - s.createdAt > LOBBY_TTL_MS) {
      if (this.isLeader) this.putLocal('session', { ...s, status: 'closed', closedReason: 'lobbyExpired' });
      return this.end('lobbyExpired');
    }
    if (s.status === 'playing' && s.startedAt && now - s.startedAt > RUN_TTL_MS && !this.held?.finishedAt) {
      return this.end('runExpired');
    }

    this.updateLiveness();

    // Lobby: the leader frees slots of players missing for 30 s+.
    if (this.isLeader && s.status === 'lobby') {
      const keep = s.rotation.filter((id) => id === this.me || !this.isGone(id, now));
      if (keep.length !== s.rotation.length) this.putLocal('session', { ...s, rotation: keep });
    }

    if (this.status === 'playing' && this.held && !this.held.finishedAt) {
      const main = this.mainId();
      if (main && this.controls(main)) {
        if (now - this.lastSent >= BEAT_MS) this.send({ t: 'beat' });
      } else if (main) {
        // Main phone missing for 20 s: the next connected member in the rotation takes over
        // and carries on from the last broadcast run (§3.5.6).
        const lost = this.lostSince.get(main);
        if (lost !== undefined && now - lost >= PROMOTE_AFTER_MS && this.connected && now - this.connectedSince >= 2_000) {
          const next = nextMainCandidate(s.rotation, main, (id) => this.alive(id));
          if (next && next === this.me) {
            this.putLocal(`ov:${this.held.stage}`, next);
            this.promoted = { stage: this.held.stage, id: next, at: now };
            this.updateLiveness();
          }
        }
      }
    }
    this.maybeSubmit();
    this.emit();
  }

  /**
   * Group submission (§3.5.3): once, automatically, when the run reaches the debrief. The
   * leader's device sends it; if the leader is gone, the finale's main phone does. submit_run
   * is idempotent per token, so a double send is harmless.
   */
  private maybeSubmit() {
    const s = this.session;
    const run = this.held;
    if (this.submitted || !s || !run?.finishedAt || !s.startedAt || !s.sizeAtStart || this.entries.has('result')) return;
    const submitter = this.alive(s.leaderId) || s.leaderId === this.me ? s.leaderId : this.mainFor(5);
    if (submitter !== this.me) return;
    this.submitted = true;
    this.deps.submit?.(runPayload(s, run));
    this.emit();
  }
}

/** The leaderboard row for a finished group run (§3.5.4). No nicknames. */
export function runPayload(s: Session, run: GameState): RunPayload {
  return {
    groupToken: s.token,
    groupName: s.name,
    groupSize: s.sizeAtStart ?? s.rotation.length,
    mode: s.mode,
    families: Math.max(0, Math.min(1200, Math.round(run.scores.finale.familiesReached))),
    durationSec: Math.max(0, Math.min(3600, Math.round(((run.finishedAt ?? Date.now()) - (s.startedAt ?? run.startedAt)) / 1000))),
  };
}

/** Lobby older than 15 min, or a run older than 60 min (unless it already finished). */
export function expired(s: Session, now: number, run: GameState | null): boolean {
  if (s.status === 'closed') return true;
  if (s.status === 'lobby') return now - s.createdAt > LOBBY_TTL_MS;
  const finished = !!run && run.startedAt === s.startedAt && !!run.finishedAt;
  return !!s.startedAt && now - s.startedAt > RUN_TTL_MS * (finished ? 2 : 1);
}
