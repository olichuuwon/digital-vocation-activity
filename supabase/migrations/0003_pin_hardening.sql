-- Let's Ship It · facilitator PIN hardening
--
-- Re-applies the hardened PIN rules, in case the live project was set up from an earlier draft
-- of 0001 (which allowed 4-digit PINs and locked out sooner):
--   * a PIN must be 6 to 8 digits;
--   * 20 wrong PINs within 10 minutes lock every attempt until the window clears.
-- Safe to re-run; CREATE OR REPLACE keeps each function's owner and grants (both stay
-- private, never callable by the public key).
--
-- AFTER applying, set a new PIN so the old one (maybe 4 digits) stops working:
--     select private.set_facilitator_pin('<6 to 8 digits>');

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
