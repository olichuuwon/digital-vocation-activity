import { addOwnRunId, loadOwnRunIds, rememberOwnRun } from './ownRuns';
import { readConfig } from './supabase';
import { newUuid } from './uuid';

describe('readConfig', () => {
  it('needs both a URL and a key', () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
  });

  it('accepts https (and http on localhost only)', () => {
    expect(readConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co/', VITE_SUPABASE_ANON_KEY: ' sb_publishable_x ' })).toEqual({
      url: 'https://x.supabase.co',
      key: 'sb_publishable_x',
    });
    expect(readConfig({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'k' })?.url).toBe(
      'http://localhost:54321',
    );
    expect(readConfig({ VITE_SUPABASE_URL: 'http://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
    expect(readConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull();
  });
});

describe('own runs', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the newest first, de-duplicated, max 10', () => {
    let ids: number[] = [];
    for (let i = 1; i <= 12; i++) ids = addOwnRunId(ids, i);
    ids = addOwnRunId(ids, 5);
    expect(ids).toEqual([5, 12, 11, 10, 9, 8, 7, 6, 4, 3]);
  });

  it('persists ids only and survives junk in storage', () => {
    rememberOwnRun(3);
    rememberOwnRun(8);
    expect(loadOwnRunIds()).toEqual([8, 3]);
    expect(localStorage.getItem('ship-it-own-runs')).toBe('[8,3]');
    localStorage.setItem('ship-it-own-runs', '{oops');
    expect(loadOwnRunIds()).toEqual([]);
    localStorage.setItem('ship-it-own-runs', '["a"]');
    expect(loadOwnRunIds()).toEqual([]);
  });
});

describe('newUuid', () => {
  it('returns RFC 4122 v4 ids', () => {
    expect(newUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
