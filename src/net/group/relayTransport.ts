import type { Channel, GroupTransport } from './transport';

// WebSocket relay transport: talks to e2e/groupRelay.ts (Playwright and local dev only).
// Protocol: client → {type:'track', meta} | {type:'msg', data}; relay → {type:'presence', metas} | {type:'msg', data}.
// Reconnects with backoff; presence is re-sent on every reconnect.

export function relayTransport(baseUrl: string): GroupTransport {
  return {
    kind: 'relay',
    join(channel, meta, handlers): Channel {
      let ws: WebSocket | null = null;
      let current = meta;
      let closed = false;
      let attempt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const open = () => {
        if (closed) return;
        handlers.onStatus('connecting');
        const url = new URL(baseUrl);
        url.searchParams.set('room', channel);
        let sock: WebSocket;
        try {
          sock = new WebSocket(url.toString());
        } catch {
          return retry();
        }
        ws = sock;
        sock.onopen = () => {
          attempt = 0;
          if (current) sock.send(JSON.stringify({ type: 'track', meta: current }));
          handlers.onStatus('connected');
        };
        sock.onmessage = (ev) => {
          let m: unknown;
          try {
            m = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (typeof m !== 'object' || m === null) return;
          const msg = m as { type?: unknown; metas?: unknown; data?: unknown };
          if (msg.type === 'presence' && Array.isArray(msg.metas)) handlers.onPresence(msg.metas);
          else if (msg.type === 'msg') handlers.onMessage(msg.data);
        };
        sock.onclose = () => {
          if (ws === sock) ws = null;
          if (closed) return;
          handlers.onStatus('disconnected');
          retry();
        };
        sock.onerror = () => sock.close();
      };

      const retry = () => {
        clearTimeout(timer);
        attempt++;
        timer = setTimeout(open, Math.min(5_000, 500 * attempt));
      };

      open();
      return {
        send(msg) {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'msg', data: msg }));
        },
        track(m) {
          current = m;
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'track', meta: m }));
        },
        leave() {
          closed = true;
          clearTimeout(timer);
          ws?.close();
          ws = null;
        },
      };
    },
  };
}
