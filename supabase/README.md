# Supabase (leaderboard backend)

The only server-side data is the team leaderboard (see `docs/GAME_SPEC.md` §3.5.4). Team play
uses Supabase Realtime channels, which store nothing.

## Set up or update a project

Run each migration **in order**, once, in the Supabase dashboard → **SQL Editor** → **New query**
(paste the file, then **Run**). Every file is safe to run again.

| File | What it does |
|---|---|
| `migrations/0001_runs.sql` | The `runs` table, row-level security, `submit_run`, the boards, the facilitator PIN functions |
| `migrations/0002_min_duration.sql` | Minimum run time 3 minutes (was 8), so quick but genuine team runs count |
| `migrations/0003_pin_hardening.sql` | Re-applies the hardened PIN rules (6–8 digits; lockout after 20 wrong tries in 10 min) |

Then set the facilitator PIN (also clears a lockout):

```sql
select private.set_facilitator_pin('<6 to 8 digits>');
```

Copy a migration on macOS: `pbcopy < supabase/migrations/0002_min_duration.sql`.

`supabase/migrations.test.ts` runs all migrations in an in-memory Postgres (PGlite) and checks
what the public key can and can't do (`npm run test`).
