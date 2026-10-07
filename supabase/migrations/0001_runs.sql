-- =====================================================================================
-- Let's Ship It · M0.5 · group leaderboard (spec §3.5.3–3.5.5, §3.6, §11.2)
--
-- Paste this whole file into the Supabase SQL Editor and run it. It is safe to re-run.
-- Then set the facilitator PIN (4–8 digits) in the SQL Editor:
--     select private.set_facilitator_pin('123456');   -- 6 to 8 digits
-- Re-running set_facilitator_pin also clears a PIN lockout.
--
-- Privacy (spec §3.5.4): the ONLY player-entered text stored is the group name. No
-- nicknames, IPs, user agents or device info. The rate limit and PIN lockout store
-- timestamps only.
--
-- Access model for the anon key (the key shipped in the web app):
--   * runs: no direct INSERT / UPDATE / DELETE. SELECT only on non-secret columns, and
--     RLS hides rows where hidden = true.
--   * Writes go through SECURITY DEFINER functions that validate everything:
--       submit_run, set_run_hidden (PIN), host_list_recent (PIN).
--   * Reads: leaderboard_today, leaderboard_all, run_rank.
--   * Schema `private` (PIN hash, failed-PIN log, owner-only helpers) is never granted
--     to anon and is not exposed through the Data API.
--
-- All SECURITY DEFINER functions use `set search_path = ''` and fully qualified names.
-- pgcrypto lives in schema `extensions` on Supabase, hence `extensions.crypt`.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------------------
-- Table
-- -------------------------------------------------------------------------------------
create table if not exists public.runs (
  -- Public row id (the spec's group_id as seen by clients).
  id            bigint generated always as identity primary key,
  -- Client-generated per group run. Makes submission retry-safe (one row per token).
  -- Never selectable by anon, so nobody can replay someone else's token.
  group_token   uuid        not null unique,
  group_name    text        not null,
  group_size    smallint    not null,
  mode          text        not null,
  families      integer     not null,
  -- Tie-break only (§3.5.3). Stored, never selectable by anon.
  duration_sec  integer     not null,
  finished_at   timestamptz not null default now(),
  -- Singapore calendar day of finished_at. Generated, so it can never disagree with
  -- finished_at. Singapore has no DST, so the zone conversion is stable.
  board_date    date generated always as ((finished_at at time zone 'Asia/Singapore')::date) stored,
  hidden        boolean     not null default false,

  constraint runs_group_name_trimmed  check (group_name = btrim(group_name)),
  constraint runs_group_name_length   check (char_length(group_name) between 1 and 20),
  constraint runs_group_name_no_ctrl  check (group_name !~ '[[:cntrl:]]'),
  -- Zero-width and bidi-override characters can disguise names on the board.
  constraint runs_group_name_visible  check (group_name !~ '[​-‏‪-‮⁠-⁩﻿]'),
  constraint runs_group_size_range    check (group_size between 2 and 4),
  constraint runs_mode_valid          check (mode in ('booth', 'full')),
  constraint runs_families_range      check (families between 0 and 1200),
  -- Anti-cheat floor (§11.2): booth ≥ 8 min, full ≥ 15 min. Ceiling = run expiry (60 min, §3.5.1).
  constraint runs_duration_range      check (
    duration_sec <= 3600
    and ((mode = 'booth' and duration_sec >= 480) or (mode = 'full' and duration_sec >= 900))
  )
);

comment on table public.runs is
  'One row per finished group run. No personal data: group name is the only player text.';

-- Board queries: per-day ordering, and the rate-limit window.
create index if not exists runs_board_idx on public.runs (board_date, families desc, duration_sec, id);
create index if not exists runs_finished_at_idx on public.runs (finished_at);

-- -------------------------------------------------------------------------------------
-- Privileges + RLS on runs
-- -------------------------------------------------------------------------------------
alter table public.runs enable row level security;

revoke all on table public.runs from public, anon, authenticated;
revoke all on sequence public.runs_id_seq from public, anon, authenticated;

-- Column-level SELECT: group_token, duration_sec and hidden are deliberately left out.
grant select (id, group_name, group_size, mode, families, finished_at, board_date)
  on public.runs to anon, authenticated;

drop policy if exists runs_select_visible on public.runs;
create policy runs_select_visible on public.runs
  for select to anon, authenticated
  using (hidden = false);
-- No INSERT / UPDATE / DELETE policies and no such grants: direct writes are refused.

-- -------------------------------------------------------------------------------------
-- Private schema: facilitator PIN + failed-attempt log
-- -------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);

-- Timestamps of wrong PIN attempts only (no IPs, no device info).
create table if not exists private.pin_failures (
  failed_at timestamptz not null default now()
);
create index if not exists pin_failures_failed_at_idx on private.pin_failures (failed_at);

revoke all on all tables in schema private from public, anon, authenticated;

-- Owner-only: run in the SQL Editor to set or change the PIN. Also clears any lockout.
create or replace function private.set_facilitator_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6,8}$' then
    raise exception 'PIN must be 6 to 8 digits' using errcode = '22023';
  end if;
  insert into private.settings (key, value)
  values ('facilitator_pin_hash', extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (key) do update set value = excluded.value;
  delete from private.pin_failures;
end;
$$;

-- Returns 'ok' | 'wrong_pin' | 'locked' | 'not_configured'. Never raises, so a wrong
-- attempt is committed to the failure log (raising would roll it back).
-- Lockout: 20 wrong PINs within 10 minutes blocks every attempt (even a correct one)
-- until fewer than 20 remain inside the window. The count is global (no per-device data),
-- so it is set high enough that a griefer can't easily lock out the facilitator, while a
-- 6+ digit PIN still needs years of guessing at 20 per 10 minutes.
create or replace function private.check_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  -- Serialise PIN checks so parallel guesses can't slip past the counter.
  perform pg_advisory_xact_lock(hashtext('ship_it_pin_check'));
  delete from private.pin_failures where failed_at < now() - interval '1 day';

  if (select count(*) from private.pin_failures where failed_at > now() - interval '10 minutes') >= 20 then
    return 'locked';
  end if;

  select value into v_hash from private.settings where key = 'facilitator_pin_hash';
  if v_hash is null then
    return 'not_configured';
  end if;

  if p_pin is not null and extensions.crypt(p_pin, v_hash) = v_hash then
    return 'ok';
  end if;

  insert into private.pin_failures default values;
  return 'wrong_pin';
end;
$$;

-- Rank of a visible row within its own SGT day. Null if hidden or missing.
create or replace function private.rank_in_day(p_id bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select 1 + count(*)::integer
    from public.runs o
    where o.board_date = r.board_date
      and not o.hidden
      and (-o.families, o.duration_sec, o.id) < (-r.families, r.duration_sec, r.id)
  )
  from public.runs r
  where r.id = p_id and not r.hidden;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- Public RPCs
-- -------------------------------------------------------------------------------------

-- Submit a finished group run. Retry-safe: a token that already has a row returns that
-- row (the new payload is ignored), so the client can resend as often as it likes.
-- Errors: SQLSTATE 22023 = invalid input (permanent), PT429 = rate limited (retry later).
create or replace function public.submit_run(
  p_group_token  uuid,
  p_group_name   text,
  p_group_size   integer,
  p_mode         text,
  p_families     integer,
  p_duration_sec integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_group_name, '')), '\s+', ' ', 'g');
  v_id   bigint;
  v_min_duration integer := case p_mode when 'full' then 900 else 480 end;  -- §11.2 anti-cheat
begin
  if p_group_token is null then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  -- Idempotency first, so retries of an accepted run never hit the rate limit.
  select id into v_id from public.runs where group_token = p_group_token;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'rank_today', private.rank_in_day(v_id));
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 20 or v_name ~ '[[:cntrl:]]'
     or v_name ~ '[​-‏‪-‮⁠-⁩﻿]' then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if p_group_size is null or p_group_size not between 2 and 4 then
    raise exception 'invalid_group_size' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('booth', 'full') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if p_families is null or p_families not between 0 and 1200 then
    raise exception 'invalid_families' using errcode = '22023';
  end if;
  if p_duration_sec is null
     or p_duration_sec > 3600
     or p_duration_sec < v_min_duration then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;

  -- Global rate limit (no per-client data): max 30 new runs per 60 s.
  perform pg_advisory_xact_lock(hashtext('ship_it_submit_run'));
  if (select count(*) from public.runs where finished_at > now() - interval '60 seconds') >= 30 then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;

  insert into public.runs (group_token, group_name, group_size, mode, families, duration_sec)
  values (p_group_token, v_name, p_group_size, p_mode, p_families, p_duration_sec)
  on conflict (group_token) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost a race with a concurrent retry of the same token.
    select id into v_id from public.runs where group_token = p_group_token;
  end if;

  return jsonb_build_object('id', v_id, 'rank_today', private.rank_in_day(v_id));
end;
$$;

-- Today's board (SGT day), top 20.
create or replace function public.leaderboard_today()
returns table (
  rank        integer,
  id          bigint,
  group_name  text,
  group_size  integer,
  mode        text,
  families    integer,
  finished_at timestamptz,
  board_date  date
)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over w)::integer, r.id, r.group_name, r.group_size::integer, r.mode,
         r.families, r.finished_at, r.board_date
  from public.runs r
  where r.board_date = (now() at time zone 'Asia/Singapore')::date
    and not r.hidden
  window w as (order by r.families desc, r.duration_sec asc, r.id asc)
  order by r.families desc, r.duration_sec asc, r.id asc
  limit 20;
$$;

-- All-time top 50, or top 50 for one SGT day when p_date is given.
create or replace function public.leaderboard_all(p_date date default null)
returns table (
  rank        integer,
  id          bigint,
  group_name  text,
  group_size  integer,
  mode        text,
  families    integer,
  finished_at timestamptz,
  board_date  date
)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over w)::integer, r.id, r.group_name, r.group_size::integer, r.mode,
         r.families, r.finished_at, r.board_date
  from public.runs r
  where (p_date is null or r.board_date = p_date)
    and not r.hidden
  window w as (order by r.families desc, r.duration_sec asc, r.id asc)
  order by r.families desc, r.duration_sec asc, r.id asc
  limit 50;
$$;

-- One visible row plus its rank on its own day's board (to pin the player's group when
-- it's outside the top 20). Empty if hidden or unknown.
create or replace function public.run_rank(p_id bigint)
returns table (
  rank        integer,
  id          bigint,
  group_name  text,
  group_size  integer,
  mode        text,
  families    integer,
  finished_at timestamptz,
  board_date  date
)
language sql
stable
security definer
set search_path = ''
as $$
  select private.rank_in_day(r.id), r.id, r.group_name, r.group_size::integer, r.mode,
         r.families, r.finished_at, r.board_date
  from public.runs r
  where r.id = p_id and not r.hidden;
$$;

-- Facilitator: hide or unhide a row. Returns {"status": ok|wrong_pin|locked|not_configured|not_found}.
create or replace function public.set_run_hidden(p_id bigint, p_hidden boolean, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_pin(p_pin);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  update public.runs set hidden = coalesce(p_hidden, true) where id = p_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Facilitator: today's rows INCLUDING hidden ones, so a name can be unhidden.
-- Returns {"status": ..., "rows": [...]}; rows is empty unless status = ok.
create or replace function public.host_list_recent(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := private.check_pin(p_pin);
begin
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status, 'rows', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'group_name', r.group_name, 'group_size', r.group_size,
               'mode', r.mode, 'families', r.families, 'finished_at', r.finished_at,
               'hidden', r.hidden)
             order by r.families desc, r.duration_sec asc, r.id asc)
      from (
        select * from public.runs
        where board_date = (now() at time zone 'Asia/Singapore')::date
        order by families desc, duration_sec asc, id asc
        limit 200
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default and Supabase adds anon/authenticated:
-- revoke everything, then grant only the public RPCs.
revoke all on function public.submit_run(uuid, text, integer, text, integer, integer) from public, anon, authenticated;
revoke all on function public.leaderboard_today() from public, anon, authenticated;
revoke all on function public.leaderboard_all(date) from public, anon, authenticated;
revoke all on function public.run_rank(bigint) from public, anon, authenticated;
revoke all on function public.set_run_hidden(bigint, boolean, text) from public, anon, authenticated;
revoke all on function public.host_list_recent(text) from public, anon, authenticated;

grant execute on function public.submit_run(uuid, text, integer, text, integer, integer) to anon, authenticated;
grant execute on function public.leaderboard_today() to anon, authenticated;
grant execute on function public.leaderboard_all(date) to anon, authenticated;
grant execute on function public.run_rank(bigint) to anon, authenticated;
grant execute on function public.set_run_hidden(bigint, boolean, text) to anon, authenticated;
grant execute on function public.host_list_recent(text) to anon, authenticated;
