import type { SupabaseClient } from '@supabase/supabase-js';

// The Supabase client is loaded on demand (leaderboard, /host, group play) so the game's
// first load stays small. Without env vars the leaderboard shows "unavailable" and the
// game still works.

export interface SupabaseConfig {
  url: string;
  key: string;
}

/** Reads and sanity-checks the public Supabase settings. Pure, for tests. */
export function readConfig(env: Record<string, unknown>): SupabaseConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const key = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url || !key) return null;
  try {
    const u = new URL(url);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return { url: u.origin, key };
  } catch {
    return null;
  }
}

export const supabaseConfig = readConfig(import.meta.env);

let client: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfig) return Promise.resolve(null);
  const { url, key } = supabaseConfig;
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(url, key, {
        // Anonymous only: no sessions, nothing written to storage, no URL token parsing.
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    )
    .catch((e: unknown) => {
      client = null; // chunk failed to load (offline): try again next time
      throw e;
    });
  return client;
}
