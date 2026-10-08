-- Let's Ship It: stronger facilitator passcode (owner request, 2026-10-08).
-- Paste into the Supabase SQL Editor AFTER 0001_runs.sql, then set a new passcode:
--     select private.set_facilitator_pin('a long passphrase you can type');
-- The old 6–8 digit PIN stops working when this runs (its hash is removed), so the /host
-- hide controls say "No passcode has been set up yet" until a new one is set.
--
-- What changes:
--   * Passcode: 12–72 characters, letters, spaces and symbols allowed (a short passphrase such
--     as "orange kite harbour 42" is far stronger than 6 digits). 72 is bcrypt's limit.
--   * Hash: bcrypt cost 12 (was 8): each guess costs the server ~16× more work.
--   * Lockout: 10 wrong passcodes within 15 minutes (was 20 in 10) locks every attempt,
--     even a correct one, until the window clears. Still global: no IPs or device data.
-- Safe to run more than once.

create or replace function private.set_facilitator_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null
     or char_length(p_pin) < 12
     or octet_length(p_pin) > 72
     or p_pin ~ '[[:cntrl:]]'
     or p_pin <> btrim(p_pin) then
    raise exception 'Passcode must be 12 to 72 characters, with no leading/trailing spaces' using errcode = '22023';
  end if;
  insert into private.settings (key, value)
  values ('facilitator_pin_hash', extensions.crypt(p_pin, extensions.gen_salt('bf', 12)))
  on conflict (key) do update set value = excluded.value;
  delete from private.pin_failures;
end;
$$;

-- Returns 'ok' | 'wrong_pin' | 'locked' | 'not_configured'. Never raises, so a wrong
-- attempt is committed to the failure log (raising would roll it back).
create or replace function private.check_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  -- Serialise checks so parallel guesses can't slip past the counter.
  perform pg_advisory_xact_lock(hashtext('ship_it_pin_check'));
  delete from private.pin_failures where failed_at < now() - interval '1 day';

  if (select count(*) from private.pin_failures where failed_at > now() - interval '15 minutes') >= 10 then
    return 'locked';
  end if;

  select value into v_hash from private.settings where key = 'facilitator_pin_hash';
  if v_hash is null then
    return 'not_configured';
  end if;

  -- Cheap reject before bcrypt: anything outside the allowed length can't match.
  if p_pin is not null and char_length(p_pin) between 12 and 72 and extensions.crypt(p_pin, v_hash) = v_hash then
    return 'ok';
  end if;

  insert into private.pin_failures default values;
  return 'wrong_pin';
end;
$$;

-- Remove a PIN set under the old rules (bcrypt cost 8 = a 6–8 digit PIN).
delete from private.settings where key = 'facilitator_pin_hash' and value like '$2_$08$%';

revoke all on all functions in schema private from public, anon, authenticated;
