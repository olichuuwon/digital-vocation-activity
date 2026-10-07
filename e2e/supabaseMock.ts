import type { Page, Route } from '@playwright/test';

/** Fake Supabase origin baked into e2e builds (see playwright.config.ts). */
export const E2E_SUPABASE_URL = 'https://e2e-test.supabase.co';
/** Port of the group-play WebSocket relay (e2e/groupRelay.ts) e2e builds use instead of Realtime. */
export const E2E_RELAY_PORT = 4174;

export type RpcHandler = (args: Record<string, unknown>) =>
  | { status?: number; body: unknown }
  | 'abort'
  | Promise<{ status?: number; body: unknown } | 'abort'>;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/**
 * Mocks Supabase RPCs. Returns a log of calls (name + JSON args). Unmocked RPCs get a 404
 * like PostgREST's "function not found"; any other request to the host is refused.
 */
export async function mockSupabase(page: Page, handlers: Record<string, RpcHandler>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  await page.route(`${E2E_SUPABASE_URL}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const m = /\/rest\/v1\/rpc\/(\w+)/.exec(new URL(req.url()).pathname);
    if (!m) return route.fulfill({ status: 404, headers: cors, body: '' });
    const name = m[1]!;
    const args = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ name, args });
    const handler = handlers[name];
    if (!handler) {
      return route.fulfill({
        status: 404,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST202', message: 'not found' }),
      });
    }
    const res = await handler(args);
    if (res === 'abort') return route.abort('internetdisconnected');
    return route.fulfill({
      status: res.status ?? 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(res.body),
    });
  });
  return calls;
}

/** A board row as PostgREST returns it. `minutesAgo` sets finished_at relative to now. */
export function boardRow(rank: number, id: number, name: string, families: number, extra: Record<string, unknown> = {}) {
  return {
    rank,
    id,
    group_name: name,
    group_size: 3,
    mode: 'booth',
    families,
    finished_at: '2026-10-07T06:05:00.123456+00:00', // 14:05 SGT
    board_date: sgtToday(),
    ...extra,
  };
}

export function sgtToday() {
  const d = new Date(Date.now() + 8 * 3600_000);
  return d.toISOString().slice(0, 10);
}
