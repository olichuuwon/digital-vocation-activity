-- Let's Ship It · server-side team-name filter
--
-- The game checks team names on the phone (src/net/group/moderation.ts), but submit_run can be
-- called directly with the public key, skipping that check. This repeats the core of it in the
-- database, so a direct call can't put a blocked or numbered name on the booth board:
--   * no digits at all (the game blocks them too);
--   * the blocklist from src/content/blocklist.json (a test keeps the two in sync), matched
--     ignoring case, accents, spaces/punctuation, repeated letters and @ $ ! + leetspeak.
-- The phone's filter stays the main one; this is the backstop. The facilitator can still hide a
-- row from /host.
--
-- Apply after 0004 in the Supabase SQL Editor. Safe to re-run.

create table if not exists private.blocked_terms (
  kind text not null check (kind in ('anywhere', 'words')),
  term text not null,
  primary key (kind, term)
);
revoke all on table private.blocked_terms from public, anon, authenticated;

-- Refreshed on every run, so re-applying after a blocklist change picks it up.
delete from private.blocked_terms;
insert into private.blocked_terms (kind, term) values
  ('anywhere', 'fuck'),
  ('anywhere', 'fck'),
  ('anywhere', 'phuck'),
  ('anywhere', 'shit'),
  ('anywhere', 'bitch'),
  ('anywhere', 'cunt'),
  ('anywhere', 'bastard'),
  ('anywhere', 'asshole'),
  ('anywhere', 'arsehole'),
  ('anywhere', 'wanker'),
  ('anywhere', 'slut'),
  ('anywhere', 'whore'),
  ('anywhere', 'nigger'),
  ('anywhere', 'nigga'),
  ('anywhere', 'faggot'),
  ('anywhere', 'retard'),
  ('anywhere', 'porn'),
  ('anywhere', 'penis'),
  ('anywhere', 'vagina'),
  ('anywhere', 'dildo'),
  ('anywhere', 'boner'),
  ('anywhere', 'blowjob'),
  ('anywhere', 'nazi'),
  ('anywhere', 'hitler'),
  ('anywhere', 'terrorist'),
  ('anywhere', 'kanina'),
  ('anywhere', 'kaninabu'),
  ('anywhere', 'kannina'),
  ('anywhere', 'chibai'),
  ('anywhere', 'cheebye'),
  ('anywhere', 'cheebai'),
  ('anywhere', 'jibai'),
  ('anywhere', 'cibai'),
  ('anywhere', 'chebye'),
  ('anywhere', 'nabeh'),
  ('anywhere', 'nabei'),
  ('anywhere', 'lanjiao'),
  ('anywhere', 'lanjiu'),
  ('anywhere', 'lanciao'),
  ('anywhere', 'lancau'),
  ('anywhere', 'kaniasai'),
  ('anywhere', 'kanasai'),
  ('anywhere', 'sohai'),
  ('anywhere', 'diulei'),
  ('anywhere', 'pukimak'),
  ('anywhere', 'kimak'),
  ('anywhere', 'pundek'),
  ('anywhere', 'butoh'),
  ('anywhere', 'pantat'),
  ('anywhere', 'bangsat'),
  ('anywhere', 'babikau'),
  ('words', 'ass'),
  ('words', 'arse'),
  ('words', 'cock'),
  ('words', 'dick'),
  ('words', 'dicks'),
  ('words', 'tit'),
  ('words', 'tits'),
  ('words', 'boob'),
  ('words', 'boobs'),
  ('words', 'cum'),
  ('words', 'anal'),
  ('words', 'anus'),
  ('words', 'sex'),
  ('words', 'sexy'),
  ('words', 'rape'),
  ('words', 'fag'),
  ('words', 'fags'),
  ('words', 'piss'),
  ('words', 'thot'),
  ('words', 'milf'),
  ('words', 'kkk'),
  ('words', 'wtf'),
  ('words', 'stfu'),
  ('words', 'nsfw'),
  ('words', 'chink'),
  ('words', 'chinks'),
  ('words', 'paki'),
  ('words', 'jap'),
  ('words', 'japs'),
  ('words', 'knn'),
  ('words', 'kns'),
  ('words', 'cb'),
  ('words', 'ccb'),
  ('words', 'lj'),
  ('words', 'kanni'),
  ('words', 'puki'),
  ('words', 'babi'),
  ('words', 'bodoh'),
  ('words', 'sial'),
  ('words', 'kuku'),
  ('words', 'diu'),
  ('words', 'pukima'),
  ('words', 'lancao'),
  ('words', 'isis'),
  ('words', 'keling'),
  ('words', 'lampa'),
  ('words', 'fuk'),
  ('words', 'horny');
-- Repeated letters are matched collapsed too ("fuuuck" → "fuck"), as on the phone.
insert into private.blocked_terms (kind, term)
select kind, regexp_replace(term, '(.)\1+', '\1', 'g') from private.blocked_terms
on conflict do nothing;

-- True if the name contains a digit or a blocked term. Mirrors isBlocked() in moderation.ts.
create or replace function private.name_blocked(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text    text;
  v_tokens  text[];
  v_compact text;
  v_cands   text[];
begin
  -- Accents off (é → e), full-width forms folded (ＡＢ → AB, ４ → 4).
  v_text := regexp_replace(normalize(coalesce(p_name, ''), NFKD), '[\u0300-\u036f]', '', 'g');
  if v_text ~ '[0-9]' then
    return true;
  end if;
  v_text := translate(lower(v_text), '@$!+', 'asit');
  v_tokens := array_remove(regexp_split_to_array(v_text, '[^a-z]+'), '');
  v_compact := array_to_string(v_tokens, '');

  -- "anywhere" terms match inside longer words.
  if exists (
    select 1 from private.blocked_terms t
    where t.kind = 'anywhere'
      and (strpos(v_compact, t.term) > 0 or strpos(regexp_replace(v_compact, '(.)\1+', '\1', 'g'), t.term) > 0)
  ) then
    return true;
  end if;

  -- "words" terms match a whole word, the whole name squashed ("c b" → "cb"), or a plural.
  select array_agg(c) into v_cands from (
    select unnest(v_tokens) as c
    union select regexp_replace(unnest(v_tokens), '(.)\1+', '\1', 'g')
    union select v_compact
    union select regexp_replace(v_compact, '(.)\1+', '\1', 'g')
  ) x where c <> '';
  return exists (
    select 1 from private.blocked_terms t, unnest(coalesce(v_cands, '{}'::text[])) c
    where t.kind = 'words' and (t.term = c or (c like '%s' and t.term = left(c, -1)))
  );
end;
$$;

revoke all on function private.name_blocked(text) from public, anon, authenticated;

-- submit_run as in 0002, plus the name filter. CREATE OR REPLACE keeps its owner and grants.
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
  v_min_duration integer := 180;  -- anti-cheat: 3 minutes, whatever the (legacy) mode (0002)
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
     or v_name ~ '[​-‏‪-‮⁠-⁩﻿]' or private.name_blocked(v_name) then
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

