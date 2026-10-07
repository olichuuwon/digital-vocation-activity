import type { Channel, ChannelHandlers, GroupTransport } from './transport';

// In-process transport: every client on the same hub shares channels. Used by unit tests and
// the ?fakePeers=N debug mode. Delivery is asynchronous (like a network) and in order.

interface Client {
  id: number;
  channel: string;
  meta: Record<string, unknown> | null;
  handlers: ChannelHandlers;
  online: boolean;
}

export class MemoryHub {
  private clients = new Set<Client>();
  private nextId = 1;
  /** Delay in ms before delivery (0 = next macrotask). */
  constructor(private delayMs = 0) {}

  private later(fn: () => void) {
    setTimeout(fn, this.delayMs);
  }

  private peers(channel: string) {
    return [...this.clients].filter((c) => c.channel === channel && c.online);
  }

  private publishPresence(channel: string) {
    const metas = this.peers(channel)
      .map((c) => c.meta)
      .filter((m): m is Record<string, unknown> => m !== null);
    for (const c of this.peers(channel)) this.later(() => c.online && c.handlers.onPresence(metas));
  }

  connect(channel: string, meta: Record<string, unknown> | null, handlers: ChannelHandlers) {
    const client: Client = { id: this.nextId++, channel, meta, handlers, online: true };
    this.clients.add(client);
    this.later(() => {
      if (!this.clients.has(client)) return;
      handlers.onStatus(client.online ? 'connected' : 'disconnected');
      this.publishPresence(channel);
    });
    return client;
  }

  send(from: Client, msg: unknown) {
    if (!from.online || !this.clients.has(from)) return;
    const copy = JSON.parse(JSON.stringify(msg)) as unknown; // no shared references, like a network
    for (const c of this.peers(from.channel)) if (c !== from) this.later(() => c.online && c.handlers.onMessage(copy));
  }

  track(client: Client, meta: Record<string, unknown>) {
    client.meta = meta;
    if (client.online) this.publishPresence(client.channel);
  }

  remove(client: Client) {
    this.clients.delete(client);
    this.publishPresence(client.channel);
  }

  /** Test/debug: cut or restore a client's connection (presence follows). */
  setOnline(client: Client, online: boolean) {
    if (client.online === online) return;
    client.online = online;
    client.handlers.onStatus(online ? 'connected' : 'disconnected');
    this.publishPresence(client.channel);
    if (online) this.later(() => this.publishPresence(client.channel));
  }

  /** Every client on a channel (tests). */
  clientsOn(channel: string) {
    return [...this.clients].filter((c) => c.channel === channel);
  }
}

export type MemoryClient = ReturnType<MemoryHub['connect']>;

export function memoryTransport(hub: MemoryHub): GroupTransport & { lastClient: () => MemoryClient | null } {
  let last: MemoryClient | null = null;
  return {
    kind: 'memory',
    lastClient: () => last,
    join(channel, meta, handlers): Channel {
      const client = hub.connect(channel, meta, handlers);
      last = client;
      return {
        send: (msg) => hub.send(client, msg),
        track: (m) => hub.track(client, m),
        leave: () => hub.remove(client),
      };
    },
  };
}
