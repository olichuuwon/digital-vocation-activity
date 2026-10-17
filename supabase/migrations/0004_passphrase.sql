-- Let's Ship It · facilitator passphrase
--
-- The facilitator secret (used on /host to hide team names) is now a passphrase instead of a
-- 6–8 digit PIN: 12 to 64 characters, anything allowed (letters, numbers, spaces, symbols),
-- e.g. "kingfisher booth 2026". At 20 guesses per 10 minutes (the global lockout) that is
-- effectively unguessable, and it no longer needs the lockout to hold the line.
--
-- Safe to re-run; CREATE OR REPLACE keeps each function's owner and grants (both stay
-- private, never callable by the public key). The current PIN keeps working until you set
-- a passphrase:
--     select private.set_facilitator_pin('<your passphrase, 12 to 64 characters>');
-- (The function keeps its old name, so nothing else changes.)

-- Owner-only: run in the SQL Editor to set or change the passphrase. Also clears any lockout.
create or replace function private.set_facilitator_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin is null
     or char_length(p_pin) not between 12 and 64
     or octet_length(p_pin) > 72               -- bcrypt only reads the first 72 bytes
     or p_pin ~ '[[:cntrl:]]'
     or p_pin <> btrim(p_pin) then             -- no stray spaces at either end (copy-paste)
    raise exception 'Passphrase must be 12 to 64 characters, with no spaces at either end'
      using errcode = '22023';
  end if;
  insert into private.settings (key, value)
  values ('facilitator_pin_hash', extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (key) do update set value = excluded.value;
  delete from private.pin_failures;
end;
$$;

-- Returns 'ok' | 'wrong_pin' | 'locked' | 'not_configured'. Never raises, so a wrong
-- attempt is committed to the failure log (raising would roll it back).
-- Lockout: 20 wrong tries within 10 minutes blocks every attempt (even a correct one) until
-- fewer than 20 remain inside the window. Oversized input is a wrong try (no bcrypt on it).
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

  if (select count(*) from private.pin_failures where failed_at > now() - interval '10 minutes') >= 20 then
    return 'locked';
  end if;

  select value into v_hash from private.settings where key = 'facilitator_pin_hash';
  if v_hash is null then
    return 'not_configured';
  end if;

  if p_pin is not null and char_length(p_pin) <= 64 and extensions.crypt(p_pin, v_hash) = v_hash then
    return 'ok';
  end if;

  insert into private.pin_failures default values;
  return 'wrong_pin';
end;
$$;
