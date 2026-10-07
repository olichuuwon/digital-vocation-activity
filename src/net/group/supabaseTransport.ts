import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import type { Channel, GroupTransport } from './transport';

// Supabase Realtime transport: broadcast + presence on a public channel (no tables, nothing
// stored). The client library loads on demand. realtime-js rejoins channels by itself after
// a dropped socket; on every (re)join we re-track presence so teammates see us again.

const EVENT = 'm';

export function supabaseTransport(): GroupTransport {
  return {
    kind: 'supabase',
    join(name, meta, handlers): Channel {
      let ch: RealtimeChannel | null = null;
      let current = meta;
      let left = false;
      let joined = false;
      const onOffline = () => handlers.onStatus('disconnected');
      const onOnline = () => joined && handlers.onStatus('connected');
      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);

      const presenceList = () => {
        if (!ch) return [];
        const state = ch.presenceState<Record<string, unknown>>();
        return Object.values(state).flatMap((metas) => metas.map(({ presence_ref: _ref, ...m }) => (void _ref, m)));
      };

      handlers.onStatus('connecting');
      getSupabase()
        .then((sb) => {
          if (left) return;
          if (!sb) return handlers.onStatus('unavailable');
          ch = sb.channel(name, {
            config: {
              broadcast: { self: false, ack: false },
              presence: current ? { key: String(current.id ?? ''), enabled: true } : { enabled: true },
            },
          });
          ch.on('broadcast', { event: EVENT }, ({ payload }) => handlers.onMessage(payload));
          ch.on('presence', { event: 'sync' }, () => handlers.onPresence(presenceList()));
          ch.subscribe((status) => {
            if (left) return;
            if (status === 'SUBSCRIBED') {
              joined = true;
              if (current) void ch?.track(current);
              handlers.onStatus(navigator.onLine === false ? 'disconnected' : 'connected');
            } else {
              joined = false;
              handlers.onStatus('disconnected');
            }
          });
        })
        .catch(() => !left && handlers.onStatus('disconnected'));

      return {
        send(msg) {
          if (ch && joined) void ch.send({ type: 'broadcast', event: EVENT, payload: msg });
        },
        track(m) {
          current = m;
          if (ch && joined) void ch.track(m);
        },
        leave() {
          left = true;
          window.removeEventListener('offline', onOffline);
          window.removeEventListener('online', onOnline);
          const c = ch;
          ch = null;
          if (c) {
            void c.untrack().catch(() => {});
            void getSupabase().then((sb) => sb?.removeChannel(c)).catch(() => {});
          }
        },
      };
    },
  };
}
