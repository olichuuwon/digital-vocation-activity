/**
 * Group play (spec §3.5, §11.2): one main phone + support phones. Public API.
 *
 * SYNC MODEL (the contract stage code builds on)
 * ---------------------------------------------
 * - Transport: a realtime channel `group:<CODE>` with broadcast + presence (Supabase Realtime in
 *   production; a WebSocket relay in e2e; an in-memory hub for unit tests and ?fakePeers=N).
 *   Nothing is stored server-side. Nicknames live only in channel presence and on the device
 *   that typed them (§3.5.4). The one stored row is the leaderboard submission.
 * - Replicated state: a few keys, last-writer-wins on a Lamport version, every value zod-checked:
 *     session  (leader)     name, code, mode (the leader's length applies to all), rotation,
 *                           status lobby → playing → closed, startedAt, sizeAtStart, run token
 *     run      (main phone) the shared GameState (src/state/types.ts), i.e. the one run
 *     ov:<n>   (claimant)   takeover of stage n's main phone after a drop
 *     result   (submitter)  leaderboard row id + today's rank
 *     t:<name> (main phone) topics for support phones (`publish` / `useTopic`)
 *   A device that connects (or reconnects) says hello and everyone answers with what they hold,
 *   so late joiners and rejoiners catch up from the last broadcast state.
 * - ONE run per group. The main phone for the current stage is the source of truth: whenever
 *   its GameState changes (level done, stage scores, hand-off, finish) it broadcasts it; other
 *   phones mirror it into their game store (src/state/store.ts) and don't change it. Level-
 *   internal state (cards, timers, sims) stays on the main phone unless stage code publishes it
 *   as a topic. Stage-local progress stores (e.g. stage1For) are per device.
 * - Rotation (§3.5.2): main for stage 0 (prologue) = rotation[0]; stage k (1–4) =
 *   rotation[(k-1) % n]; finale (5) = rotation[4 % n] (the cycle continues). The leader orders
 *   the rotation in the lobby. A run update is accepted only from the main phone of the stage
 *   the receiver is on, so the old main's final update (the hand-off: stage k → k+1) is what
 *   hands the game to the next main phone, which then takes over from the mirrored run.
 * - Drops (§3.5.6): the main phone sends a heartbeat when quiet. If it is missing (presence
 *   gone or 15 s silent) everyone shows a pause; after 20 s the next connected member in the
 *   rotation claims `ov:<stage>` and carries on from the last broadcast run (from the start
 *   of the level it was on). A teammate missing 30 s+ is left out of support dealing; rejoin
 *   uses the token in localStorage and lands on the current stage.
 * - Actions: support phones `sendAction(type, payload)`; only the main phone's `useActions`
 *   handlers receive them (de-duplicated; queued up to 10 s while offline).
 * - Submission (§3.5.3): when the run reaches the debrief, the leader's phone (or, if the leader
 *   is gone, the finale's main phone) queues one submit_run (retrying, idempotent per token).
 *   The result (rank today) is broadcast so every phone shows "You're #3 today!".
 */
export { useGroup, useTopic, useActions, useDealtCards, useHandOff, useHandOffSync, deriveView, nextMain, HANDOFF_TOPIC, HANDOFF_READY } from './hooks';
export type { GroupView, Member, HandOffInfo } from './hooks';
export { publish, sendAction, onAction, groupActions, groupAvailable, useGroupStore } from './store';
export { dealCards, mainFor, nominalMainIndex, stagesLedBy } from './rotation';
export { registerBotBehaviour, type BotApi, type BotBehaviour } from './bots';
export type { ActionEvent, GroupSnapshot } from './engine';
