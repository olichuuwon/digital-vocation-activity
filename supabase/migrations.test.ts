// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Applies supabase/migrations/0001_runs.sql to an in-process Postgres (PGlite) set up like
 * a Supabase project, then acts as the `anon` role to prove what the public key can and
 * can't do. Default privileges are set to the WORST case (everything auto-granted to anon)
 * so the migration's explicit revokes are what keep the table safe.
 */
const migration = readFileSync(fileURLToPath(new URL('./migrations/0001_runs.sql', import.meta.url)), 'utf8');
const passcodeMigration = readFileSync(fileURLToPath(new URL('./migrations/0002_facilitator_passcode.sql', import.meta.url)), 'utf8');

const SUPABASE_LIKE_SETUP = `
  create role anon nologin;
  create role authenticated nologin;
  create schema extensions;
  grant usage on schema extensions to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const PIN = 'orange kite harbour';
let db: PGlite;
let oldPinGone = false;
let tokenSeq = 0;
const token = () => `00000000-0000-4000-8000-${String(++tokenSeq).padStart(12, '0')}`;

interface SubmitArgs {
  token?: string;
  name?: string;
  size?: number;
  mode?: string;
  families?: number;
  duration?: number;
}

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

async function submit(a: SubmitArgs = {}) {
  const res = await db.query<{ r: { id: number; rank_today: number | null } }>(
    'select public.submit_run($1::uuid, $2, $3, $4, $5, $6) as r',
    [a.token ?? token(), a.name ?? 'Swift Kingfisher', a.size ?? 3, a.mode ?? 'booth', a.families ?? 800, a.duration ?? 600],
  );
  return res.rows[0]!.r;
}

const anonSubmit = (a: SubmitArgs = {}) => asAnon(() => submit(a));

async function errorOf(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; message: string };
  }
  throw new Error('expected an error');
}

/** Insert as the table owner (bypasses RLS) to set up past days or bulk rows. */
async function seed(rows: { name: string; families: number; duration?: number; finishedAt?: string; hidden?: boolean }[]) {
  for (const r of rows) {
    await db.query(
      `insert into public.runs (group_token, group_name, group_size, mode, families, duration_sec, finished_at, hidden)
       values ($1::uuid, $2, 3, 'booth', $3, $4, coalesce($5::timestamptz, now()), $6)`,
      [token(), r.name, r.families, r.duration ?? 600, r.finishedAt ?? null, r.hidden ?? false],
    );
  }
}

type BoardRow = { rank: number; id: number; group_name: string; families: number; board_date: string };
const today = () => asAnon(async () => (await db.query<BoardRow>('select *, board_date::text as board_date from public.leaderboard_today()')).rows);
const allTime = (date?: string) =>
  asAnon(async () =>
    (await db.query<BoardRow>('select *, board_date::text as board_date from public.leaderboard_all($1::date)', [date ?? null])).rows,
  );

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_LIKE_SETUP);
  await db.exec(migration);
  await db.exec(migration); // idempotent: a second paste must not fail
  // A PIN set under 0001's rules is removed by 0002 (the owner must set a passcode).
  await db.query(`insert into private.settings values ('facilitator_pin_hash', extensions.crypt('482913', extensions.gen_salt('bf', 8)))`);
  await db.exec(passcodeMigration);
  await db.exec(passcodeMigration);
  oldPinGone = (await db.query(`select 1 from private.settings where key = 'facilitator_pin_hash'`)).rows.length === 0;
  await db.query('select private.set_facilitator_pin($1)', [PIN]);
}, 60_000);

beforeEach(async () => {
  await db.exec('reset role; truncate public.runs; truncate private.pin_failures;');
});

afterAll(async () => {
  await db?.close();
});

describe('submit_run', () => {
  it('inserts a run and returns its id and rank today', async () => {
    const r = await anonSubmit({ families: 900 });
    expect(r.id).toBeGreaterThan(0);
    expect(r.rank_today).toBe(1);
    const rows = await today();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rank: 1, group_name: 'Swift Kingfisher', families: 900 });
  });

  it('is idempotent per group token (retries return the same row)', async () => {
    const t = token();
    const a = await anonSubmit({ token: t, families: 700 });
    const b = await anonSubmit({ token: t, families: 1200, name: 'Changed' });
    expect(b.id).toBe(a.id);
    const rows = await today();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ families: 700, group_name: 'Swift Kingfisher' });
  });

  it('trims and collapses whitespace in the group name', async () => {
    await anonSubmit({ name: '  Bold   Merlion ' });
    expect((await today())[0]!.group_name).toBe('Bold Merlion');
  });

  it.each([
    ['families 1201', { families: 1201 }, 'invalid_families'],
    ['negative families', { families: -1 }, 'invalid_families'],
    ['group size 5', { size: 5 }, 'invalid_group_size'],
    ['group size 1', { size: 1 }, 'invalid_group_size'],
    ['booth under 8 min', { mode: 'booth', duration: 479 }, 'invalid_duration'],
    ['full under 15 min', { mode: 'full', duration: 899 }, 'invalid_duration'],
    ['over 60 min', { duration: 3601 }, 'invalid_duration'],
    ['21-char name', { name: 'A'.repeat(21) }, 'invalid_group_name'],
    ['blank name', { name: '   ' }, 'invalid_group_name'],
    ['control chars', { name: 'Bad\u0007Name' }, 'invalid_group_name'],
    ['zero-width chars', { name: 'Ru\u200Bde' }, 'invalid_group_name'],
    ['bidi override', { name: '\u202Eemaneman' }, 'invalid_group_name'],
    ['unknown mode', { mode: 'quick' }, 'invalid_mode'],
  ])('rejects %s', async (_label, args, message) => {
    const e = await errorOf(anonSubmit(args));
    expect(e.code).toBe('22023');
    expect(e.message).toBe(message);
    expect(await today()).toHaveLength(0);
  });

  it('accepts the exact bounds', async () => {
    await anonSubmit({ families: 1200, size: 4, mode: 'booth', duration: 480, name: 'B'.repeat(20) });
    await anonSubmit({ families: 0, size: 2, mode: 'full', duration: 900 });
    expect(await today()).toHaveLength(2);
  });

  it('rate-limits after 30 new runs in 60 s, but still answers retries of accepted runs', async () => {
    const t = token();
    await anonSubmit({ token: t });
    await seed(Array.from({ length: 29 }, (_, i) => ({ name: `Bulk ${i}`, families: 100 })));
    const e = await errorOf(anonSubmit());
    expect(e.code).toBe('PT429');
    expect(e.message).toBe('rate_limited');
    await expect(anonSubmit({ token: t })).resolves.toHaveProperty('id');
  });

  it('allows submissions again once the window has passed', async () => {
    const old = new Date(Date.now() - 61_000).toISOString();
    await seed(Array.from({ length: 30 }, (_, i) => ({ name: `Old ${i}`, families: 100, finishedAt: old })));
    await expect(anonSubmit()).resolves.toHaveProperty('id');
  });
});

describe('RLS and grants block tampering', () => {
  it('refuses direct INSERT, UPDATE and DELETE on runs', async () => {
    const { id } = await anonSubmit();
    await asAnon(async () => {
      const ins = await errorOf(
        db.query(`insert into public.runs (group_token, group_name, group_size, mode, families, duration_sec)
                  values (gen_random_uuid(), 'Cheaters', 2, 'booth', 1200, 600)`),
      );
      expect(ins.code).toBe('42501');
      expect((await errorOf(db.query('update public.runs set families = 1200'))).code).toBe('42501');
      expect((await errorOf(db.query('update public.runs set hidden = true where id = $1', [id]))).code).toBe('42501');
      expect((await errorOf(db.query('delete from public.runs'))).code).toBe('42501');
      expect((await errorOf(db.query('truncate public.runs'))).code).toBe('42501');
    });
    expect(await today()).toHaveLength(1);
  });

  it('refuses selecting group_token, duration_sec, hidden and select *', async () => {
    await anonSubmit();
    await asAnon(async () => {
      for (const col of ['group_token', 'duration_sec', 'hidden', '*']) {
        expect((await errorOf(db.query(`select ${col} from public.runs`))).code).toBe('42501');
      }
      const ok = await db.query('select id, group_name, group_size, mode, families, finished_at, board_date from public.runs');
      expect(ok.rows).toHaveLength(1);
    });
  });

  it('hides hidden rows from direct selects and every board', async () => {
    await seed([
      { name: 'Visible', families: 500 },
      { name: 'Rude Name', families: 1000, hidden: true },
    ]);
    const hiddenId = (await db.query<{ id: number }>(`select id from public.runs where group_name = 'Rude Name'`)).rows[0]!.id;
    const direct = await asAnon(async () => (await db.query<{ group_name: string }>('select group_name from public.runs')).rows);
    expect(direct.map((r) => r.group_name)).toEqual(['Visible']);
    expect((await today()).map((r) => r.group_name)).toEqual(['Visible']);
    expect((await allTime()).map((r) => r.group_name)).toEqual(['Visible']);
    expect((await today())[0]!.rank).toBe(1);
    const rank = await asAnon(async () => (await db.query('select * from public.run_rank($1)', [hiddenId])).rows);
    expect(rank).toHaveLength(0);
  });

  it('keeps the private schema and its helpers out of reach', async () => {
    await asAnon(async () => {
      expect((await errorOf(db.query('select * from private.settings'))).code).toBe('42501');
      expect((await errorOf(db.query('select * from private.pin_failures'))).code).toBe('42501');
      expect((await errorOf(db.query(`select private.set_facilitator_pin('0000')`))).code).toBe('42501');
      expect((await errorOf(db.query(`select private.check_pin('0000')`))).code).toBe('42501');
    });
  });

  it('keeps private functions refused even if anon somehow gets USAGE on the schema', async () => {
    await db.exec('grant usage on schema private to anon');
    try {
      await asAnon(async () => {
        expect((await errorOf(db.query(`select private.set_facilitator_pin('000000')`))).code).toBe('42501');
        expect((await errorOf(db.query(`select private.check_pin('000000')`))).code).toBe('42501');
        expect((await errorOf(db.query('select * from private.settings'))).code).toBe('42501');
      });
    } finally {
      await db.exec('revoke usage on schema private from anon');
    }
  });

  it('does not let anon call nextval on the id sequence', async () => {
    await asAnon(async () => {
      expect((await errorOf(db.query(`select nextval('public.runs_id_seq')`))).code).toBe('42501');
    });
  });
});

describe('facilitator PIN', () => {
  const setHidden = (id: number, hidden: boolean, pin: string) =>
    asAnon(async () =>
      (await db.query<{ r: { status: string } }>('select public.set_run_hidden($1, $2, $3) as r', [id, hidden, pin])).rows[0]!.r.status,
    );
  const hostList = (pin: string) =>
    asAnon(async () =>
      (await db.query<{ r: { status: string; rows: { id: number; hidden: boolean }[] } }>('select public.host_list_recent($1) as r', [pin]))
        .rows[0]!.r,
    );

  it('rejects a wrong PIN and changes nothing', async () => {
    const { id } = await anonSubmit();
    expect(await setHidden(id, true, '000000')).toBe('wrong_pin');
    expect(await today()).toHaveLength(1);
    expect((await hostList('111111')).status).toBe('wrong_pin');
    expect((await hostList('111111')).rows).toEqual([]);
  });

  it('hides and unhides with the correct PIN; host list shows hidden rows', async () => {
    const { id } = await anonSubmit({ name: 'Bold Merlion' });
    expect(await setHidden(id, true, PIN)).toBe('ok');
    expect(await today()).toHaveLength(0);
    const list = await hostList(PIN);
    expect(list.status).toBe('ok');
    expect(list.rows).toEqual([expect.objectContaining({ id, hidden: true, group_name: 'Bold Merlion' })]);
    expect(list.rows[0]).not.toHaveProperty('group_token');
    expect(list.rows[0]).not.toHaveProperty('duration_sec');
    expect(await setHidden(id, false, PIN)).toBe('ok');
    expect(await today()).toHaveLength(1);
    expect(await setHidden(999_999, true, PIN)).toBe('not_found');
  });

  it('locks out after 10 wrong passcodes in 15 minutes, even for the right one, then recovers', async () => {
    const { id } = await anonSubmit();
    for (let i = 0; i < 10; i++) expect(await setHidden(id, true, i % 2 ? '999999' : 'wrong passcode here')).toBe('wrong_pin');
    expect(await setHidden(id, true, PIN)).toBe('locked');
    expect((await hostList(PIN)).status).toBe('locked');
    expect(await today()).toHaveLength(1);
    // Simulate the window passing (only timestamps are stored).
    await db.exec(`update private.pin_failures set failed_at = now() - interval '14 minutes'`);
    expect(await setHidden(id, true, PIN)).toBe('locked');
    await db.exec(`update private.pin_failures set failed_at = now() - interval '16 minutes'`);
    expect(await setHidden(id, true, PIN)).toBe('ok');
  });

  it('only stores failure timestamps', async () => {
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'private' and table_name = 'pin_failures'`,
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual(['failed_at']);
  });

  it('owner passcode setter needs 12–72 characters, no control characters or edge spaces', async () => {
    for (const bad of ['482913', '12345678', 'short pass', 'x'.repeat(73), ' leading space!', 'tab\there long enough']) {
      expect((await errorOf(db.query('select private.set_facilitator_pin($1)', [bad]))).code).toBe('22023');
    }
    // Strong hash: bcrypt cost 12.
    const hash = (await db.query<{ value: string }>(`select value from private.settings where key = 'facilitator_pin_hash'`)).rows[0]!.value;
    expect(hash).toMatch(/^\$2.\$12\$/);
  });

  it('0002 removed the old 6–8 digit PIN, so it no longer unlocks anything', async () => {
    expect(oldPinGone).toBe(true);
    const { id } = await anonSubmit();
    expect(await setHidden(id, true, '482913')).toBe('wrong_pin');
  });
});

describe('boards', () => {
  it('orders by families desc, then duration asc, then id', async () => {
    await anonSubmit({ name: 'Slow 900', families: 900, duration: 900 });
    await anonSubmit({ name: 'Fast 900', families: 900, duration: 600 });
    await anonSubmit({ name: 'Top', families: 1100, duration: 1200 });
    await anonSubmit({ name: 'Low', families: 100, duration: 480 });
    await anonSubmit({ name: 'Fast 900 twin', families: 900, duration: 600 });
    const rows = await today();
    expect(rows.map((r) => r.group_name)).toEqual(['Top', 'Fast 900', 'Fast 900 twin', 'Slow 900', 'Low']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    const lowId = rows[4]!.id;
    const rank = await asAnon(async () => (await db.query<{ rank: number }>('select * from public.run_rank($1)', [lowId])).rows);
    expect(rank[0]!.rank).toBe(5);
  });

  it('today shows only the current SGT day; all-time and date filter span days', async () => {
    await seed([{ name: 'Yesterday', families: 1200, finishedAt: new Date(Date.now() - 86_400_000).toISOString() }]);
    await anonSubmit({ name: 'Today', families: 300 });
    expect((await today()).map((r) => r.group_name)).toEqual(['Today']);
    expect((await allTime()).map((r) => r.group_name)).toEqual(['Yesterday', 'Today']);
    const yDate = (await allTime())[0]!.board_date;
    expect((await allTime(yDate)).map((r) => r.group_name)).toEqual(['Yesterday']);
  });

  it('caps today at 20 and all-time at 50', async () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await seed(Array.from({ length: 25 }, (_, i) => ({ name: `T${i}`, families: i })));
    await seed(Array.from({ length: 40 }, (_, i) => ({ name: `O${i}`, families: i, finishedAt: old })));
    expect(await today()).toHaveLength(20);
    expect(await allTime()).toHaveLength(50);
  });

  it('pins a run outside the top 20 with its real rank', async () => {
    await seed(Array.from({ length: 22 }, (_, i) => ({ name: `T${i}`, families: 500 + i })));
    const { id, rank_today } = await anonSubmit({ name: 'Us', families: 10 });
    expect(rank_today).toBe(23);
    const row = await asAnon(async () => (await db.query<{ rank: number; group_name: string }>('select * from public.run_rank($1)', [id])).rows[0]);
    expect(row).toMatchObject({ rank: 23, group_name: 'Us' });
  });

  it('assigns board_date by the Singapore calendar day (23:30 UTC is the next SGT day)', async () => {
    await seed([
      { name: 'Late UTC', families: 1, finishedAt: '2026-03-14T23:30:00Z' },
      { name: 'Before midnight SGT', families: 1, finishedAt: '2026-03-14T15:59:00Z' },
      { name: 'After midnight SGT', families: 1, finishedAt: '2026-03-14T16:00:00Z' },
    ]);
    const rows = await db.query<{ group_name: string; d: string }>('select group_name, board_date::text as d from public.runs order by id');
    expect(rows.rows).toEqual([
      { group_name: 'Late UTC', d: '2026-03-15' },
      { group_name: 'Before midnight SGT', d: '2026-03-14' },
      { group_name: 'After midnight SGT', d: '2026-03-15' },
    ]);
    expect((await allTime('2026-03-15')).map((r) => r.group_name)).toEqual(['Late UTC', 'After midnight SGT']);
  });

  it('server sets finished_at; the client cannot choose the board day', async () => {
    const before = Date.now();
    await anonSubmit();
    const row = (await db.query<{ finished_at: Date }>('select finished_at from public.runs')).rows[0]!;
    expect(row.finished_at.getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(row.finished_at.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});
