-- ============================================================================
-- 0021 — user_locations: inert foundation table (ADR 0008)
-- ============================================================================
-- A plain many-to-many between a member (profiles) and a location. Built now as
-- DELIBERATELY UNUSED foundation for future systems (notifications, assignments)
-- to consume rather than reinvent — see ADR 0008. NO UI reads or writes it, and it
-- carries nothing beyond the bare relationship (no "primary" flag, nothing
-- speculative). Do not wire it into the app until a real need is validated.
--
-- Tenancy: no practice_id column — scoped via the parent LOCATION, exactly like
-- item_cabinets / shipment_locations / location_cabinets. A row is reachable only
-- if its location belongs to the caller's practice. Writes are gated to
-- owner/admin (an assignment is an administrative act); reads are practice-scoped.
-- Insert also verifies the assigned profile is in the caller's practice, so a row
-- can never link a location to a member from another tenant.
-- ============================================================================

create table if not exists user_locations (
  profile_id  uuid references profiles(id)  on delete cascade not null,
  location_id uuid references locations(id) on delete cascade not null,
  created_at  timestamptz not null default now(),
  primary key (profile_id, location_id)   -- unique on the pair
);

alter table user_locations enable row level security;

-- Read: any member of the practice the location belongs to.
drop policy if exists "select via parent location" on user_locations;
create policy "select via parent location" on user_locations for select
  using (location_id in (select id from locations where practice_id = current_practice_id()));

-- Write (insert): owner/admin only, and BOTH the location and the assigned member
-- must belong to the caller's practice.
drop policy if exists "insert via parent location (owner/admin)" on user_locations;
create policy "insert via parent location (owner/admin)" on user_locations for insert
  with check (
    current_user_role() in ('owner', 'admin')
    and location_id in (select id from locations where practice_id = current_practice_id())
    and profile_id  in (select id from profiles  where practice_id = current_practice_id())
  );

-- Write (delete): owner/admin only, scoped via the parent location.
drop policy if exists "delete via parent location (owner/admin)" on user_locations;
create policy "delete via parent location (owner/admin)" on user_locations for delete
  using (
    current_user_role() in ('owner', 'admin')
    and location_id in (select id from locations where practice_id = current_practice_id())
  );

-- No UPDATE policy on purpose: the table is (profile_id, location_id) + created_at,
-- so there is nothing updatable — a change is a delete + insert. RLS default-denies
-- UPDATE, which is correct here.
