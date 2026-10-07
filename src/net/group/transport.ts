// Transport abstraction for group play. A transport joins named channels; each channel has
// broadcast (fire-and-forget to everyone else) and presence (who is connected, with a small
// meta object). Three implementations:
//   - supabaseTransport: Supabase Realtime broadcast + presence (production)
//   - relayTransport:    a tiny WebSocket relay (e2e/groupRelay.ts) for Playwright and local dev
//   - memoryTransport:   in-process hub for unit tests and the ?fakePeers=N debug mode
// Nothing here is stored anywhere: channels are ephemeral.

export type ChannelStatus = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

export interface ChannelHandlers {
  onMessage: (msg: unknown) => void;
  /** Full presence list (one meta per connected client; may contain junk: validate). */
  onPresence: (metas: unknown[]) => void;
  onStatus: (status: ChannelStatus) => void;
}

export interface Channel {
  send(msg: unknown): void;
  /** Replace this client's presence meta. */
  track(meta: Record<string, unknown>): void;
  leave(): void;
}

export interface GroupTransport {
  readonly kind: 'supabase' | 'relay' | 'memory';
  /** `meta` = this client's presence; `null` = listen only (e.g. /host). */
  join(channel: string, meta: Record<string, unknown> | null, handlers: ChannelHandlers): Channel;
}
