-- Let's Ship It · shorter minimum run duration
--
-- The game now has one run length (≈ 15 min). The old floor (8 min for 'booth', 15 for 'full')
-- rejected quick but genuine team runs ("This run couldn't go on the board"). The floor is now
-- 3 minutes for every run: still stops instant fake scores, never a real team.
--
-- Apply in the Supabase SQL editor (or `supabase db push`). Safe to re-run. CREATE OR REPLACE
-- keeps the function's owner and grants.

alter table public.runs drop constraint if exists runs_duration_range;
alter table public.runs add constraint runs_duration_range check (duration_sec between 180 and 3600);

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
  v_min_duration integer := 180;  -- anti-cheat: 3 minutes, whatever the (legacy) mode
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
