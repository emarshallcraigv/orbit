-- ============================================================================
-- 0005 — Dynamic locations: default location + name uniqueness
-- ============================================================================
-- Step 2 of the frontend rebuild makes locations dynamic (a practice can have
-- any number, read from the locations table instead of a hardcoded array of 4).
-- Two invariants have to hold for that to be safe:
--
--   1. No practice can have ZERO locations — most screens iterate over the
--      practice's locations, so an empty list breaks them.
--   2. No two locations in the same practice can share a name. The app's
--      check-in / shipment data is keyed by location NAME (deliberately, to
--      keep step 2 scoped — step 3 normalizes to IDs), so two locations with
--      the same name would silently collide on one data key. This is a direct
--      consequence of the name-keying decision, so it's enforced here, not left
--      to chance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Case-insensitive uniqueness of location name within a practice.
--    lower(name) so "Main Office" and "main office" can't coexist.
-- ---------------------------------------------------------------------------
create unique index if not exists locations_practice_name_lower_idx
  on locations (practice_id, lower(name));

-- ---------------------------------------------------------------------------
-- 2. New practices get a default location, atomic with practice creation, so
--    a practice can never start empty regardless of entry path. This replaces
--    the 0003 version of the function, adding only the locations insert
--    (search_path pin + auth guard are carried over unchanged).
-- ---------------------------------------------------------------------------
create or replace function create_practice_for_new_user(practice_name text, join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_practice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into practices (name, join_code) values (practice_name, join_code)
    returning id into new_practice_id;

  update profiles set practice_id = new_practice_id, role = 'owner' where id = auth.uid();

  insert into locations (practice_id, name, sort_order)
    values (new_practice_id, 'Main Office', 0);

  return new_practice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: give a default location to any existing practice that has none
--    (e.g. practices created during testing, before this migration). Runs once;
--    practices that already have locations are left untouched.
-- ---------------------------------------------------------------------------
insert into locations (practice_id, name, sort_order)
select p.id, 'Main Office', 0
from practices p
where not exists (select 1 from locations l where l.practice_id = p.id);
