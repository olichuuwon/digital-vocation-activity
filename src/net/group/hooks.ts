import { useEffect, useMemo, useRef } from 'react';
import type { z } from 'zod';
import { fill } from '../../content';
import { groupCopy } from '../../content/groupSchema';
import type { Stage } from '../../state/types';
import type { ActionEvent, GroupSnapshot } from './engine';
import { PROMOTE_AFTER_MS } from './protocol';
import { dealCards, mainFor, nextMainCandidate, supportsFor } from './rotation';
import { onAction, publish, useGroupStore } from './store';

export interface Member {
  id: string;
  /** Nickname from live presence, or "Player n" if not seen since a reload. */
  nick: string;
  present: boolean;
  /** Missing for 30 s+: left out of support dealing. */
  gone: boolean;
  isLeader: boolean;
  isMe: boolean;
  /** 0-based place in the main-phone rotation. */
  index: number;
}

export interface GroupView {
  /** In a started group run (stage play, finale or debrief). */
  active: boolean;
  /** In a lobby or a run. */
  inGroup: boolean;
  status: GroupSnapshot['status'];
  role: 'leader' | 'member' | null;
  me: Member | null;
  /** Rotation order. */
  members: Member[];
  rotation: string[];
  mainId: string | null;
  main: Member | null;
  /** This phone runs the game for the current stage. */
  amMain: boolean;
  /** Support phones in rotation order after the main phone (missing 30 s+ left out). */
  supports: Member[];
  mySupportIndex: number | null;
  supportCount: number;
  connected: boolean;
  /** The main phone went missing (pause up to 20 s, then the next player takes over). */
  paused: { name: string; since: number } | null;
  stage: Stage | null;
  snap: GroupSnapshot;
}

const nameFor = (snap: GroupSnapshot, id: string, index: number) =>
  snap.people[id]?.nick ?? fill(groupCopy.lobby.playerN, { n: index + 1 });

/** Pure: the React-friendly view of a snapshot. Exported for tests. */
export function deriveView(snap: GroupSnapshot, puppets: readonly string[] = [], viewAs: number | null = null): GroupView {
  const s = snap.session;
  const rotation = s?.rotation ?? [];
  const gone = new Set(snap.gone);
  const member = (id: string, index: number): Member => ({
    id,
    nick: nameFor(snap, id, index),
    present: id === snap.meId ? snap.connected : (snap.people[id]?.present ?? false),
    gone: gone.has(id),
    isLeader: s?.leaderId === id,
    isMe: id === snap.meId,
    index,
  });
  const members = rotation.map(member);
  const byId = new Map(members.map((m) => [m.id, m]));
  const active = snap.status === 'playing';
  const controls = (id: string | null) => !!id && (id === snap.meId || puppets.includes(id));
  let amMain = active && controls(snap.mainId);
  const supportIds = active ? supportsFor(rotation, snap.mainId, (id) => gone.has(id)) : [];
  const supports = supportIds.map((id) => byId.get(id)!).filter(Boolean);
  let mySupportIndex = snap.meId && supportIds.includes(snap.meId) ? supportIds.indexOf(snap.meId) : null;
  // Debug preview (?fakePeers): show this phone the support screen as support #viewAs.
  if (active && viewAs !== null && supports.length > 0) {
    amMain = false;
    mySupportIndex = Math.min(viewAs, supports.length - 1);
  }
  const main = snap.mainId ? (byId.get(snap.mainId) ?? null) : null;
  return {
    active,
    inGroup: snap.status === 'lobby' || snap.status === 'playing' || snap.status === 'joining',
    status: snap.status,
    role: s && snap.meId ? (s.leaderId === snap.meId ? 'leader' : 'member') : null,
    me: snap.meId ? (byId.get(snap.meId) ?? null) : null,
    members,
    rotation,
    mainId: snap.mainId,
    main,
    amMain,
    supports,
    mySupportIndex,
    supportCount: supports.length,
    connected: snap.connected,
    paused: active && !amMain && snap.mainLostSince !== null && main ? { name: main.nick, since: snap.mainLostSince } : null,
    stage: snap.stage,
    snap,
  };
}

/** Group state for components. Outside a group: `active` and `inGroup` are false. */
export function useGroup(): GroupView {
  const snap = useGroupStore((s) => s.snap);
  const puppets = useGroupStore((s) => s.puppets);
  const viewAs = useGroupStore((s) => s.viewAs);
  return useMemo(() => deriveView(snap, puppets, viewAs), [snap, puppets, viewAs]);
}

/**
 * Latest value the main phone published on `topic` (undefined if none). Pass a zod schema to
 * validate it: received data is untrusted, and anything that doesn't match gives undefined.
 */
export function useTopic<T = unknown>(topic: string, schema?: z.ZodType<T>): T | undefined {
  const raw = useGroupStore((s) => s.snap.topics[topic]);
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (!schema) return raw as T;
    const r = schema.safeParse(raw);
    return r.success ? r.data : undefined;
  }, [raw, schema]);
}

/** Main phone: handle support actions while mounted. The latest handler is always used. */
export function useActions(handler: (a: ActionEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => onAction((a) => ref.current(a)), []);
}

/** Support cards for this phone (§3.5.2 dealing rule). Empty on the main phone and in solo. */
export function useDealtCards<T>(cardIds: readonly T[]): T[] {
  const g = useGroup();
  return useMemo(() => dealCards(cardIds, g.supportCount, g.mySupportIndex), [cardIds, g.supportCount, g.mySupportIndex]);
}

export interface HandOffInfo {
  /** Nickname for HandOff `nextName` (undefined in solo). */
  nextName?: string;
  nextId: string | null;
  nextIsMe: boolean;
}

/** Pure: who holds the main phone after `fromStage` (skipping someone missing 20 s+). */
export function nextMain(view: GroupView, fromStage: Stage, now = Date.now()): HandOffInfo {
  if (!view.active || fromStage >= 5) return { nextId: null, nextIsMe: false };
  const next = (fromStage + 1) as Stage;
  let id = mainFor(next, view.rotation, view.snap.overrides);
  const lost = id ? view.snap.people[id]?.lostSince : null;
  if (id && id !== view.snap.meId && lost != null && now - lost >= PROMOTE_AFTER_MS) {
    const gone = new Set(view.members.filter((m) => !m.present).map((m) => m.id));
    id = nextMainCandidate(view.rotation, id, (x) => !gone.has(x)) ?? id;
  }
  const m = view.members.find((x) => x.id === id);
  return { nextName: m?.nick, nextId: id, nextIsMe: !!m?.isMe };
}

/** Next main player for the hand-off card after `fromStage` (default: the current stage). */
export function useHandOff(fromStage?: Stage): HandOffInfo {
  const view = useGroup();
  const stage = fromStage ?? view.stage ?? 0;
  return useMemo(() => nextMain(view, stage), [view, stage]);
}

/** Topic the main phone publishes while its hand-off card shows: {stage, nextId}. */
export const HANDOFF_TOPIC = 'handoff';
export const HANDOFF_READY = 'handoff:ready';

/**
 * Main phone, while the hand-off card is on screen (`active`): tells the next main player's
 * phone to show a "Ready" button, and calls `onReady` when they tap it. The main phone can
 * still tap its own Ready (e.g. if the next player's phone is offline).
 */
export function useHandOffSync(active: boolean, onReady: () => void, fromStage?: Stage) {
  const view = useGroup();
  const { nextId } = useHandOff(fromStage);
  const stage = fromStage ?? view.stage ?? 0;
  const on = active && view.active && view.amMain;
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });
  useEffect(() => {
    if (!on) return;
    publish(HANDOFF_TOPIC, { stage, nextId });
    return () => publish(HANDOFF_TOPIC, null);
  }, [on, stage, nextId]);
  useActions((a) => {
    if (on && a.type === HANDOFF_READY && (a.from === nextId || !nextId)) ready.current();
  });
}

export { dealCards };
