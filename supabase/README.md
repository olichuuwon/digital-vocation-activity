# Supabase (leaderboard backend)

The only server-side data is the team leaderboard (see `docs/GAME_SPEC.md` §3.5.4). Team play
uses Supabase Realtime channels, which store nothing.

## Set up or update a project

Run each migration **in order**, once, in the Supabase dashboard → **SQL Editor** → **New query**
(paste the file, then **Run**). Every file is safe to run again; if you ever re-run `0001`, re-run
the later files after it too (they replace some of its functions).

| File | What it does |
|---|---|
| `migrations/0001_runs.sql` | The `runs` table, row-level security, `submit_run`, the boards, the facilitator PIN functions |
| `migrations/0002_min_duration.sql` | Minimum run time 3 minutes (was 8), so quick but genuine team runs count |
| `migrations/0004_passphrase.sql` | The facilitator secret becomes a passphrase: 12–64 characters, anything allowed (lockout after 20 wrong tries in 10 min) |
| `migrations/0005_name_filter.sql` | `submit_run` also refuses team names with digits or blocked words, so a direct API call can't skip the game's filter |

Then set the facilitator passphrase (also clears a lockout):

```sql
select private.set_facilitator_pin('kingfisher booth 2026');   -- use your own
```

Until you do, an older numeric PIN keeps working. Check which one is active:

```sql
select left(value, 7) from private.settings where key = 'facilitator_pin_hash';
-- $2a$10$ = passphrase (good)   $2a$08$ = old numeric PIN: set a passphrase now
```

**Locked out on /host?** 20 wrong tries in 10 minutes (from anyone) locks hiding for everyone.
Wait 10 minutes, or run `set_facilitator_pin` again with your passphrase: that clears it at once.

Copy a migration on macOS: `pbcopy < supabase/migrations/0002_min_duration.sql`.

`supabase/migrations.test.ts` runs all migrations in an in-memory Postgres (PGlite) and checks
what the public key can and can't do (`npm run test`).
