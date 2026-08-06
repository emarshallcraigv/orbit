-- ============================================================================
-- setup_production_from_scratch.sql — consolidated schema for a NEW environment
-- ============================================================================
-- Stands up a brand-new Baybridge Supabase project (e.g. production) in ONE
-- paste: every migration, 0001 onward, concatenated in numeric order. Run it
-- once, top to bottom, in the new project's SQL editor.
--
-- MAINTENANCE (important): this file must stay in lockstep with
-- supabase/migrations/. Every time a NEW numbered migration is added, append its
-- full contents to the end of this file, in order — so standing up a fresh
-- environment is always a single paste, never a manually re-collected sequence.
--   Last migration included below: 0015_location_cabinets.sql
--
-- See STAGING.md for when and how this is used (the staging/production split).
-- This file is ONLY for a from-scratch environment; to update an EXISTING
-- database, apply the individual numbered migrations instead.
-- ============================================================================


-- ####################################################################
-- ### 0001_init.sql
-- ####################################################################

-- ============================================================================
-- Mann Supply SaaS — initial multi-tenant schema
-- ============================================================================
-- Run this in the Supabase SQL editor, or via `supabase db push` once this file
-- lives under supabase/migrations/. Every tenant-owned table carries a practice_id
-- and has Row-Level Security enabled, so isolation is enforced by Postgres itself —
-- not by application code remembering to filter correctly.
-- ============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Practices (tenants)
-- ---------------------------------------------------------------------------
create table practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  logo_url text,
  primary_color text default '#15409E',
  accent_color text default '#6FA030',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Profiles — one row per auth.users entry, the single source of truth for
-- "which practice does this person belong to". Everything else hinges on this.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  practice_id uuid references practices(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Locations — configurable per practice. Replaces the old hardcoded
-- Tampa/Palmetto/St. Pete/Largo constants; a practice can have 1 or 20.
-- ---------------------------------------------------------------------------
create table locations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Items — the master catalog
-- ---------------------------------------------------------------------------
create table items (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  name text not null,
  description text,
  tracking_type text not null default 'good_low' check (tracking_type in ('good_low', 'quantity')),
  unit text,
  threshold numeric,
  threshold_desc text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Per-location cabinet assignment (an item can sit in a different cabinet at
-- each location — this is what solved Marshall's "different cabinet per office" ask)
create table item_cabinets (
  item_id uuid references items(id) on delete cascade not null,
  location_id uuid references locations(id) on delete cascade not null,
  cabinet text,
  primary key (item_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Checks — one persistent row per item+location (not a new row every month)
-- ---------------------------------------------------------------------------
create table checks (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  item_id uuid references items(id) on delete cascade not null,
  location_id uuid references locations(id) on delete cascade not null,
  counted_qty numeric,
  status text, -- 'Good' / 'Low' / 'Need to Order' for good_low items
  staff_name text,
  notes text,
  checked_at timestamptz default now(),
  unique (item_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Shipments
-- ---------------------------------------------------------------------------
create table shipments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  item_id uuid references items(id) on delete cascade not null,
  distributor text,
  po_ref text,
  ship_to_location_id uuid references locations(id),
  total_qty numeric not null,
  date_ordered date,
  status text not null default 'Ordered' check (status in ('Ordered', 'Partially Received', 'Received')),
  date_received date,
  received_by text,
  transfers_created boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- Per-location split for a shipment. A table instead of fixed columns so this
-- scales to however many locations a practice has, not a hardcoded 4.
create table shipment_locations (
  shipment_id uuid references shipments(id) on delete cascade not null,
  location_id uuid references locations(id) on delete cascade not null,
  qty numeric not null default 0,
  primary key (shipment_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Transfers — tracks supplies moving between locations after a shipment lands
-- ---------------------------------------------------------------------------
create table transfers (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  shipment_id uuid references shipments(id) on delete set null,
  item_id uuid references items(id) on delete cascade not null,
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id) not null,
  qty numeric not null,
  status text not null default 'Pending' check (status in ('Pending', 'Received')),
  date_created date default current_date,
  date_received date,
  received_by text
);

-- ---------------------------------------------------------------------------
-- Ordering queue
-- ---------------------------------------------------------------------------
create table queue_entries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  item_id uuid references items(id) on delete cascade not null,
  date_flagged date default current_date,
  distributor text,
  status text not null default 'Pending' check (status in ('Pending', 'Ordered', 'Received', 'Not Needed')),
  date_ordered date,
  staff_name text,
  notes text,
  qty_to_order numeric,
  shipment_created boolean default false,
  created_shipment_id uuid references shipments(id)
);

-- Which locations a queue entry covers (solves "merge Tampa + Palmetto into one entry")
create table queue_locations (
  queue_entry_id uuid references queue_entries(id) on delete cascade not null,
  location_id uuid references locations(id) on delete cascade not null,
  qty numeric,
  reason text,
  primary key (queue_entry_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Staff & distributor pick-lists
-- ---------------------------------------------------------------------------
create table staff_members (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  name text not null
);

create table distributors (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  name text not null
);

-- ============================================================================
-- Row-Level Security
-- ============================================================================

create or replace function current_practice_id()
returns uuid language sql stable security definer as $$
  select practice_id from profiles where id = auth.uid()
$$;

-- Named current_user_role (not current_role): current_role is a reserved word
-- in Postgres, so a plain current_role() helper is fragile to reference. This
-- matches what is live in the database.
create or replace function current_user_role()
returns text language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

alter table practices enable row level security;
alter table profiles enable row level security;
alter table locations enable row level security;
alter table items enable row level security;
alter table item_cabinets enable row level security;
alter table checks enable row level security;
alter table shipments enable row level security;
alter table shipment_locations enable row level security;
alter table transfers enable row level security;
alter table queue_entries enable row level security;
alter table queue_locations enable row level security;
alter table staff_members enable row level security;
alter table distributors enable row level security;

-- practices: members can read their own practice; owner/admin can update it.
-- Row creation happens via the signup flow (service role or a security-definer
-- function), not a direct client insert, so there's no public insert policy here.
create policy "select own practice" on practices
  for select using (id = current_practice_id());
create policy "owner/admin update own practice" on practices
  for update using (id = current_practice_id() and current_user_role() in ('owner', 'admin'));

-- profiles: a user can see other profiles in their own practice, and update
-- only their own row (role changes should go through an admin-only path, not
-- a raw client update — enforce that in the app / a function, not here).
create policy "select profiles in own practice" on profiles
  for select using (practice_id = current_practice_id());
create policy "update own profile" on profiles
  for update using (id = auth.uid());

-- Generic tenant-table policy pattern, applied to every practice-owned table below.
create policy "select own practice rows" on locations for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on locations for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on locations for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on locations for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on items for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on items for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on items for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on items for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on checks for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on checks for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on checks for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on checks for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on shipments for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on shipments for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on shipments for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on shipments for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on transfers for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on transfers for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on transfers for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on transfers for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on queue_entries for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on queue_entries for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on queue_entries for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on queue_entries for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on staff_members for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on staff_members for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on staff_members for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on staff_members for delete using (practice_id = current_practice_id());

create policy "select own practice rows" on distributors for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on distributors for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on distributors for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on distributors for delete using (practice_id = current_practice_id());

-- Join tables (item_cabinets, shipment_locations, queue_locations) don't carry
-- their own practice_id - they inherit tenancy through their parent row, so the
-- policy checks the parent instead.
create policy "select via parent item" on item_cabinets for select
  using (item_id in (select id from items where practice_id = current_practice_id()));
create policy "insert via parent item" on item_cabinets for insert
  with check (item_id in (select id from items where practice_id = current_practice_id()));
create policy "update via parent item" on item_cabinets for update
  using (item_id in (select id from items where practice_id = current_practice_id()));
create policy "delete via parent item" on item_cabinets for delete
  using (item_id in (select id from items where practice_id = current_practice_id()));

create policy "select via parent shipment" on shipment_locations for select
  using (shipment_id in (select id from shipments where practice_id = current_practice_id()));
create policy "insert via parent shipment" on shipment_locations for insert
  with check (shipment_id in (select id from shipments where practice_id = current_practice_id()));
create policy "update via parent shipment" on shipment_locations for update
  using (shipment_id in (select id from shipments where practice_id = current_practice_id()));
create policy "delete via parent shipment" on shipment_locations for delete
  using (shipment_id in (select id from shipments where practice_id = current_practice_id()));

create policy "select via parent queue entry" on queue_locations for select
  using (queue_entry_id in (select id from queue_entries where practice_id = current_practice_id()));
create policy "insert via parent queue entry" on queue_locations for insert
  with check (queue_entry_id in (select id from queue_entries where practice_id = current_practice_id()));
create policy "update via parent queue entry" on queue_locations for update
  using (queue_entry_id in (select id from queue_entries where practice_id = current_practice_id()));
create policy "delete via parent queue entry" on queue_locations for delete
  using (queue_entry_id in (select id from queue_entries where practice_id = current_practice_id()));

-- ============================================================================
-- Practice + first-owner signup, as a single atomic function.
-- Doing this as one security-definer function avoids a window where a client
-- could create a practices row without also correctly attaching themselves as
-- its owner (or vice versa).
-- ============================================================================
create or replace function create_practice_for_new_user(practice_name text, join_code text)
returns uuid
language plpgsql
security definer
as $$
declare
  new_practice_id uuid;
begin
  insert into practices (name, join_code) values (practice_name, join_code)
    returning id into new_practice_id;

  update profiles set practice_id = new_practice_id, role = 'owner' where id = auth.uid();

  return new_practice_id;
end;
$$;

create or replace function join_practice_by_code(code text)
returns uuid
language plpgsql
security definer
as $$
declare
  target_practice_id uuid;
begin
  select id into target_practice_id from practices where join_code = upper(trim(code));

  if target_practice_id is null then
    raise exception 'No practice found for that join code';
  end if;

  update profiles set practice_id = target_practice_id, role = 'staff' where id = auth.uid();

  return target_practice_id;
end;
$$;

-- Auto-create a blank profile row whenever someone signs up via Supabase Auth,
-- so there's always a profiles row to attach a practice_id to afterward.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ####################################################################
-- ### 0002_practiceos_hardening.sql
-- ####################################################################

-- ============================================================================
-- PracticeOS — architecture hardening pass, before the Supabase frontend wiring
-- begins. See docs/decisions/0002-hardening-before-frontend-rebuild.md for the
-- full reasoning. Summary of what changes and why:
--
--   1. staff_name / received_by (free text) -> performed_by (real profiles.id)
--      Every staff member now has a real login, so "who did this" should be a
--      real fact, not a typed string.
--   2. staff_members table dropped - superseded by profiles + practice_id.
--   3. practices.settings jsonb added - room for per-practice config without
--      a migration for every new toggle.
--   4. practices.timezone added - so "what day is this" is computed against
--      the practice's own clock, not the database server's.
--   5. activity_log table added - a generic, append-only audit trail.
--   6. invitations table added - targeted, revocable, role-specific invites,
--      as an upgrade path from the join-code-only model (join codes still work
--      for the simple case; invitations are for "invite this specific person").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 & 2: real accountability instead of free-text names
-- ---------------------------------------------------------------------------
alter table checks add column performed_by uuid references profiles(id);
alter table shipments add column performed_by uuid references profiles(id);
alter table transfers add column performed_by uuid references profiles(id);
alter table queue_entries add column performed_by uuid references profiles(id);

comment on column checks.staff_name is 'Deprecated - use performed_by. Kept temporarily for any in-flight data during the frontend rewiring; drop once the app writes performed_by exclusively.';
comment on column shipments.received_by is 'Deprecated - use performed_by. See checks.staff_name comment.';
comment on column transfers.received_by is 'Deprecated - use performed_by. See checks.staff_name comment.';
comment on column queue_entries.staff_name is 'Deprecated - use performed_by. See checks.staff_name comment.';

drop policy if exists "select own practice rows" on staff_members;
drop policy if exists "insert own practice rows" on staff_members;
drop policy if exists "update own practice rows" on staff_members;
drop policy if exists "delete own practice rows" on staff_members;
drop table if exists staff_members;

-- ---------------------------------------------------------------------------
-- 3 & 4: room to grow without a migration per setting, and timezone-aware dates
-- ---------------------------------------------------------------------------
alter table practices add column settings jsonb not null default '{}'::jsonb;
alter table practices add column timezone text not null default 'America/New_York';

-- ---------------------------------------------------------------------------
-- 5: generic audit trail. One table instead of a bespoke history table per
-- entity - "what happened, who did it, when" for support and compliance.
-- ---------------------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  actor_id uuid references profiles(id),
  action text not null,        -- e.g. 'check.updated', 'shipment.received', 'transfer.confirmed'
  entity_type text not null,   -- e.g. 'item', 'shipment', 'transfer', 'queue_entry'
  entity_id uuid,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table activity_log enable row level security;

create policy "select own practice activity" on activity_log
  for select using (practice_id = current_practice_id());
create policy "insert own practice activity" on activity_log
  for insert with check (practice_id = current_practice_id());
-- No update/delete policy on purpose - an audit log that can be edited after
-- the fact isn't much of an audit log.

-- ---------------------------------------------------------------------------
-- 6: targeted, revocable invitations (upgrade path from join-code-only)
-- ---------------------------------------------------------------------------
create table invitations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  invited_by uuid references profiles(id),
  token uuid not null default gen_random_uuid(),
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Revoked', 'Expired')),
  expires_at timestamptz default (now() + interval '14 days'),
  created_at timestamptz default now()
);

alter table invitations enable row level security;

create policy "select own practice invitations" on invitations
  for select using (practice_id = current_practice_id());
create policy "owner/admin manage invitations" on invitations
  for insert with check (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));
create policy "owner/admin update invitations" on invitations
  for update using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

-- Accepting an invite: given a valid token, attach the caller's profile to that
-- practice/role and mark the invite used. Security-definer so a brand new user
-- (who isn't a practice member yet) can still call it.
create or replace function accept_invitation(invite_token uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  inv record;
begin
  select * into inv from invitations
    where token = invite_token and status = 'Pending' and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  update profiles set practice_id = inv.practice_id, role = inv.role where id = auth.uid();
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;


-- ####################################################################
-- ### 0003_fix_signup_trigger_and_guards.sql
-- ####################################################################

-- ============================================================================
-- 0003 — Fix signup (auth) trigger + harden the onboarding functions
-- ============================================================================
-- Found while wiring the auth/onboarding frontend (README step 1). Signing up
-- through Supabase Auth failed with:
--
--     POST /auth/v1/signup  ->  500
--     { "error_code": "unexpected_failure",
--       "msg": "Database error saving new user" }
--
-- Root cause: the on_auth_user_created trigger runs handle_new_user() as the
-- `supabase_auth_admin` role, whose session search_path does NOT include
-- `public`. The function body referenced `profiles` unqualified, so it failed to
-- resolve the table and the trigger raised — which GoTrue surfaces as the
-- generic "Database error saving new user", aborting the whole signup.
--
-- (The onboarding RPCs create_practice_for_new_user / join_practice_by_code use
-- the same unqualified style but happened to work, because PostgREST pins
-- search_path=public for the roles it executes as. The trigger has no such
-- luxury — hence the asymmetry. We pin search_path on all of them here so the
-- behavior no longer depends on the caller's environment.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The actual signup blocker: schema-qualify + pin search_path.
--    Replacing the function body is enough — the on_auth_user_created trigger
--    already points at it, so it picks this up with no trigger changes.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

-- Make sure the role that inserts into auth.users can execute the trigger fn.
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 2. Harden the onboarding functions.
--    a) Pin search_path (same defensiveness as above).
--    b) Refuse to run without a logged-in caller. Without this guard, an
--       unauthenticated caller hitting create_practice_for_new_user creates an
--       orphan practice row (the "update profiles ... where id = auth.uid()"
--       silently no-ops when auth.uid() is null). Found during testing.
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

  return new_practice_id;
end;
$$;

create or replace function join_practice_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_practice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_practice_id from practices where join_code = upper(trim(code));

  if target_practice_id is null then
    raise exception 'No practice found for that join code';
  end if;

  update profiles set practice_id = target_practice_id, role = 'staff' where id = auth.uid();

  return target_practice_id;
end;
$$;

create or replace function accept_invitation(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv from invitations
    where token = invite_token and status = 'Pending' and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  update profiles set practice_id = inv.practice_id, role = inv.role where id = auth.uid();
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;


-- ####################################################################
-- ### 0004_pin_search_path_rls_helpers.sql
-- ####################################################################

-- ============================================================================
-- 0004 — Pin search_path on the RLS helper functions (defense in depth)
-- ============================================================================
-- Same rationale as 0003: these SECURITY DEFINER helpers reference `profiles`
-- unqualified and rely on whatever search_path the caller's role happens to
-- have. They're invoked from inside every RLS policy (via current_practice_id()
-- / current_user_role()), so a caller whose search_path doesn't include
-- `public` could cause them to resolve the wrong table — or none. Pinning
-- search_path (and schema-qualifying) makes their behavior independent of the
-- caller.
--
-- Bodies are otherwise identical to what is live. The role helper is named
-- current_user_role() in the live database (current_role is a reserved word in
-- Postgres); an earlier hotfix renamed it directly in the SQL editor, and
-- migrations 0001/0002 have now been corrected on disk to match.
-- ============================================================================

create or replace function current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select practice_id from public.profiles where id = auth.uid()
$$;

create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;


-- ####################################################################
-- ### 0005_dynamic_locations_defaults.sql
-- ####################################################################

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


-- ####################################################################
-- ### 0006_distributor_contact_fields.sql
-- ####################################################################

-- ============================================================================
-- 0006 — Distributor directory: contact + account fields
-- ============================================================================
-- The distributors table started as a bare pick-list (id, practice_id, name).
-- Practices need it to be a real directory: who to contact, the practice's own
-- account code with that vendor, the sales rep, where to send orders, etc.
--
-- All columns are nullable text — only the name is required, everything else is
-- optional detail a practice fills in over time. RLS already scopes distributors
-- per practice (0001), so no policy changes are needed. `if not exists` makes
-- this safe to re-run.
-- ============================================================================

alter table distributors add column if not exists phone          text;
alter table distributors add column if not exists account_number text;  -- the practice's customer/account # with this distributor
alter table distributors add column if not exists rep_name       text;
alter table distributors add column if not exists rep_phone      text;
alter table distributors add column if not exists rep_email      text;
alter table distributors add column if not exists order_email    text;  -- where this practice sends orders
alter table distributors add column if not exists website_url    text;
alter table distributors add column if not exists notes          text;


-- ####################################################################
-- ### 0007_shipment_transfer_rpcs.sql
-- ####################################################################

-- ============================================================================
-- 0007 — Shipments + transfers: atomic compound-write RPCs
-- ============================================================================
-- Step 3 (data layer) moves shipments/transfers off the blob. Three of those
-- writes touch more than one table and MUST be all-or-nothing, so they live in
-- Postgres functions (one function = one transaction) rather than as a sequence
-- of client-side inserts that could half-fail:
--
--   1. create_shipment              — a shipment + its per-location split rows
--   2. create_shipment_from_queue   — even-split a queue entry -> shipment, then
--                                      flag the queue entry (#1 + the flag update)
--   3. receive_shipment             — mark a shipment received AND create the
--                                      pending transfers for every non-ship-to
--                                      location, together. This is the dangerous
--                                      one: a received shipment that silently
--                                      skipped its transfers leaves inventory
--                                      quietly wrong with no error anyone sees.
--
-- Design choices:
-- * SECURITY INVOKER (not DEFINER). These run in the caller's RLS context, so
--   they physically cannot read or write another practice's rows — RLS blocks
--   it. That STRENGTHENS tenant isolation instead of bypassing it. Every insert
--   uses the practice_id read from the parent row (item / queue_entry /
--   shipment), which RLS guarantees belongs to the caller.
-- * search_path pinned to public (defense in depth, per 0003/0004).
-- * Dates use the practice's OWN timezone (practices.timezone), not the server
--   clock, so "today" is correct near midnight across timezones.
-- * performed_by = auth.uid() on every write (accountability; retires the old
--   free-text staff field for these entities).
-- * Each function writes its activity_log row in the same transaction, so the
--   audit trail can't drift from what actually happened.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: today's date in a given practice's own timezone.
-- ---------------------------------------------------------------------------
create or replace function practice_today(p_practice_id uuid)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select (now() at time zone
    coalesce((select timezone from practices where id = p_practice_id), 'America/New_York'))::date
$$;

-- ---------------------------------------------------------------------------
-- 1. Manual shipment logging: shipment + its per-location split, atomically.
--    Location ids + qtys are parallel arrays (i-th qty goes to i-th location).
-- ---------------------------------------------------------------------------
create or replace function create_shipment(
  p_item_id uuid,
  p_distributor text,
  p_po text,
  p_ship_to_location_id uuid,
  p_date_ordered date,
  p_total numeric,
  p_location_ids uuid[],
  p_qtys numeric[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_practice_id uuid;
  v_shipment_id uuid;
  i int;
begin
  -- Practice is derived from the item; RLS guarantees it's the caller's item.
  select practice_id into v_practice_id from items where id = p_item_id;
  if v_practice_id is null then
    raise exception 'Item not found';
  end if;
  if array_length(p_location_ids, 1) is distinct from array_length(p_qtys, 1) then
    raise exception 'location_ids and qtys must be the same length';
  end if;

  insert into shipments (practice_id, item_id, distributor, po_ref, ship_to_location_id,
                         total_qty, date_ordered, status, transfers_created, performed_by)
  values (v_practice_id, p_item_id, nullif(p_distributor, ''), nullif(p_po, ''), p_ship_to_location_id,
          p_total, coalesce(p_date_ordered, practice_today(v_practice_id)), 'Ordered', false, auth.uid())
  returning id into v_shipment_id;

  for i in 1 .. coalesce(array_length(p_location_ids, 1), 0) loop
    insert into shipment_locations (shipment_id, location_id, qty)
    values (v_shipment_id, p_location_ids[i], coalesce(p_qtys[i], 0));
  end loop;

  insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
  values (v_practice_id, auth.uid(), 'shipment.created', 'shipment', v_shipment_id,
          jsonb_build_object('total_qty', p_total, 'distributor', p_distributor));

  return v_shipment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Queue -> shipment. Even-split the queue entry's quantity across its
--    locations (or all of the practice's, if none were chosen), create the
--    shipment via #1, then flag the queue entry — all in one transaction.
--    Idempotent: if already ordered, returns the existing shipment id.
-- ---------------------------------------------------------------------------
create or replace function create_shipment_from_queue(p_queue_entry_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  q record;
  v_locs uuid[];
  v_n int;
  v_base numeric;
  v_rem numeric;
  v_qtys numeric[];
  i int;
  v_shipment_id uuid;
begin
  select * into q from queue_entries where id = p_queue_entry_id;
  if not found then
    raise exception 'Queue entry not found';
  end if;
  if q.shipment_created then
    return q.created_shipment_id;                                    -- idempotent
  end if;
  if nullif(q.distributor, '') is null or coalesce(q.qty_to_order, 0) <= 0 then
    raise exception 'Queue entry needs a distributor and a positive quantity to order';
  end if;

  -- Locations to split across: the entry's own selection, else all of the
  -- practice's, ordered the same way the UI shows them.
  select array_agg(l.id order by l.sort_order, l.name) into v_locs
  from queue_locations ql join locations l on l.id = ql.location_id
  where ql.queue_entry_id = q.id;
  if v_locs is null then
    select array_agg(id order by sort_order, name) into v_locs
    from locations where practice_id = q.practice_id;
  end if;
  v_n := coalesce(array_length(v_locs, 1), 0);
  if v_n = 0 then
    raise exception 'No locations to split the order across';
  end if;

  -- Even split (largest-remainder): the first `rem` locations get one extra.
  v_base := floor(q.qty_to_order / v_n);
  v_rem  := q.qty_to_order - v_base * v_n;
  v_qtys := array[]::numeric[];
  for i in 1 .. v_n loop
    v_qtys := v_qtys || (v_base + case when (i - 1) < v_rem then 1 else 0 end);
  end loop;

  v_shipment_id := create_shipment(q.item_id, q.distributor, null, null,
                                   practice_today(q.practice_id), q.qty_to_order, v_locs, v_qtys);

  update shipments set notes = 'Auto-created from ordering queue' where id = v_shipment_id;

  update queue_entries
    set shipment_created = true, created_shipment_id = v_shipment_id,
        status = 'Ordered', date_ordered = coalesce(date_ordered, practice_today(q.practice_id))
    where id = q.id;

  insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
  values (q.practice_id, auth.uid(), 'shipment.created_from_queue', 'shipment', v_shipment_id,
          jsonb_build_object('queue_entry_id', q.id, 'total_qty', q.qty_to_order, 'locations', v_n));

  return v_shipment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Receive a shipment: mark it Received AND create the pending transfers for
--    every non-ship-to location that got a nonzero share, in one transaction.
--    Idempotent on transfer creation (guarded by transfers_created).
-- ---------------------------------------------------------------------------
create or replace function receive_shipment(p_shipment_id uuid, p_date_received date default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  s record;
  r record;
  v_count int := 0;
begin
  select * into s from shipments where id = p_shipment_id;
  if not found then
    raise exception 'Shipment not found';
  end if;

  update shipments
    set status = 'Received',
        date_received = coalesce(p_date_received, practice_today(s.practice_id)),
        performed_by = auth.uid()
    where id = s.id;

  if not s.transfers_created then
    -- Transfers only when there IS a ship-to address; otherwise each location's
    -- share is treated as arriving directly (the read-side receivedSince logic).
    if s.ship_to_location_id is not null then
      for r in
        select sl.location_id, sl.qty
        from shipment_locations sl
        where sl.shipment_id = s.id
          and coalesce(sl.qty, 0) > 0
          and sl.location_id <> s.ship_to_location_id
      loop
        insert into transfers (practice_id, shipment_id, item_id, from_location_id, to_location_id,
                               qty, status, date_created, performed_by)
        values (s.practice_id, s.id, s.item_id, s.ship_to_location_id, r.location_id,
                r.qty, 'Pending', practice_today(s.practice_id), auth.uid());
        v_count := v_count + 1;
      end loop;
    end if;
    update shipments set transfers_created = true where id = s.id;
  end if;

  insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
  values (s.practice_id, auth.uid(), 'shipment.received', 'shipment', s.id,
          jsonb_build_object('transfers_created', v_count));

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: callable by signed-in practice members (RLS still scopes every row).
-- ---------------------------------------------------------------------------
grant execute on function practice_today(uuid) to authenticated;
grant execute on function create_shipment(uuid, text, text, uuid, date, numeric, uuid[], numeric[]) to authenticated;
grant execute on function create_shipment_from_queue(uuid) to authenticated;
grant execute on function receive_shipment(uuid, date) to authenticated;


-- ####################################################################
-- ### 0008_categories_item_cost.sql
-- ####################################################################

-- ============================================================================
-- 0008 — Item categories + reference cost, plus a 0007 grant hardening
-- ============================================================================
-- Three unrelated-but-small changes bundled:
--   1. Lock down the 0007 RPCs' execute privilege (revoke PUBLIC, keep only
--      authenticated) — the defense-in-depth grant cleanup noted on 0007.
--   2. items.estimated_unit_cost — a rough reference cost for budgeting. NOT
--      real purchase history (that's a later feature tied to real orders).
--   3. A practice-scoped `categories` table + items.category_id — replaces
--      free-text categorization with a fixed per-practice list, so a category
--      can't drift into multiple inconsistent spellings the way Mann's historical
--      spreadsheet did ("PPE" vs "Personal Protective Equipment",
--      "Instruments & Equipment" vs "Instruments and Equipment").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restrict the 0007 functions to authenticated only (remove the implicit
--    PUBLIC execute that CREATE FUNCTION grants by default). Same defense-in-
--    depth posture as the search_path pins.
-- ---------------------------------------------------------------------------
revoke all on function practice_today(uuid) from public;
revoke all on function create_shipment(uuid, text, text, uuid, date, numeric, uuid[], numeric[]) from public;
revoke all on function create_shipment_from_queue(uuid) from public;
revoke all on function receive_shipment(uuid, date) from public;
-- (the explicit `grant ... to authenticated` from 0007 remains in effect)

-- ---------------------------------------------------------------------------
-- 2. Reference unit cost on items — nullable, optional.
-- ---------------------------------------------------------------------------
alter table items add column if not exists estimated_unit_cost numeric;

-- ---------------------------------------------------------------------------
-- 3. Categories: practice-scoped, flat — same shape as locations/distributors.
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table categories enable row level security;

create policy "select own practice rows" on categories for select using (practice_id = current_practice_id());
create policy "insert own practice rows" on categories for insert with check (practice_id = current_practice_id());
create policy "update own practice rows" on categories for update using (practice_id = current_practice_id());
create policy "delete own practice rows" on categories for delete using (practice_id = current_practice_id());

-- Case-insensitive uniqueness per practice, so the fixed list can't itself grow
-- duplicate spellings (same guard as locations in 0005).
create unique index if not exists categories_practice_name_lower_idx
  on categories (practice_id, lower(name));

-- Link items to a category. on delete set null: deleting a category unsets it on
-- its items rather than deleting the items.
alter table items add column if not exists category_id uuid references categories(id) on delete set null;


-- ####################################################################
-- ### 0009_profiles_fk_on_delete_set_null.sql
-- ####################################################################

-- ============================================================================
-- 0009 — ON DELETE SET NULL on the profiles(id) back-references
-- ============================================================================
-- These columns reference profiles(id) with NO on-delete behavior specified
-- (default NO ACTION), so any row that references a profile BLOCKS deleting that
-- profile / user. A real "remove a departed staff member from an ongoing
-- practice" hits exactly this wall — proven live during test-data cleanup, where
-- shipments.performed_by blocked deleting a user until the whole practice was
-- deleted first. A departed staff member in a real practice has no such rescue.
-- This is the gap the 0002 hardening decision doc anticipated.
--
-- Fix: recreate each FK with ON DELETE SET NULL. All six columns are nullable,
-- so this is safe: deleting a profile nulls the attribution on those rows (the
-- rows and their history survive; that one action's actor simply becomes
-- unknown). The activity_log rows remain as the durable audit trail regardless.
--
-- Each constraint is DISCOVERED by (table, column -> profiles) rather than by an
-- assumed name, then dropped and re-added. Constraint names can't be verified
-- from the app layer, and assuming a name that turns out wrong would silently
-- no-op the drop and leave the old blocking FK in place — so we look it up.
-- ============================================================================

do $$
declare
  rec record;
begin
  for rec in
    select rel.relname   as tbl,
           att.attname   as col,
           con.conname   as current_name
    from pg_constraint con
    join pg_class      rel    on rel.oid = con.conrelid
    join pg_namespace  ns     on ns.oid = rel.relnamespace
    join pg_class      refrel on refrel.oid = con.confrelid
    join pg_namespace  refns  on refns.oid = refrel.relnamespace
    join pg_attribute  att    on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and array_length(con.conkey, 1) = 1            -- single-column FKs only
      and ns.nspname = 'public'
      and refns.nspname = 'public'
      and refrel.relname = 'profiles'
      and (rel.relname, att.attname) in (
        ('shipments',     'performed_by'),
        ('checks',        'performed_by'),
        ('transfers',     'performed_by'),
        ('queue_entries', 'performed_by'),
        ('activity_log',  'actor_id'),
        ('invitations',   'invited_by')
      )
  loop
    execute format('alter table public.%I drop constraint %I', rec.tbl, rec.current_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      rec.tbl, rec.tbl || '_' || rec.col || '_fkey', rec.col
    );
    raise notice 'Recreated FK on %.% (was %) with ON DELETE SET NULL', rec.tbl, rec.col, rec.current_name;
  end loop;
end $$;


-- ####################################################################
-- ### 0010_single_activity_log_on_queue_order.sql
-- ####################################################################

-- ============================================================================
-- 0010 — One activity_log row per queue->shipment order (not two)
-- ============================================================================
-- create_shipment_from_queue calls create_shipment internally, so ordering from
-- the queue wrote TWO audit rows: 'shipment.created' (inner) AND
-- 'shipment.created_from_queue' (outer). Harmless today, but it double-counts
-- shipment-creation events, which will quietly skew the spend/order reporting
-- that activity_log is meant to back in V2.
--
-- Fix: give create_shipment a p_log flag. The queue path calls it with logging
-- OFF and writes its own single 'shipment.created_from_queue' row. Manual
-- logging is unchanged (one 'shipment.created'). Net: exactly one row per order,
-- source still distinguishable by the action name.
--
-- create_shipment's argument list changes, and CREATE OR REPLACE can't alter a
-- function's signature, so the old 8-arg version is dropped and recreated.
-- ============================================================================

drop function if exists create_shipment(uuid, text, text, uuid, date, numeric, uuid[], numeric[]);

create or replace function create_shipment(
  p_item_id uuid,
  p_distributor text,
  p_po text,
  p_ship_to_location_id uuid,
  p_date_ordered date,
  p_total numeric,
  p_location_ids uuid[],
  p_qtys numeric[],
  p_log boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_practice_id uuid;
  v_shipment_id uuid;
  i int;
begin
  select practice_id into v_practice_id from items where id = p_item_id;
  if v_practice_id is null then raise exception 'Item not found'; end if;
  if array_length(p_location_ids, 1) is distinct from array_length(p_qtys, 1) then
    raise exception 'location_ids and qtys must be the same length'; end if;

  insert into shipments (practice_id, item_id, distributor, po_ref, ship_to_location_id,
                         total_qty, date_ordered, status, transfers_created, performed_by)
  values (v_practice_id, p_item_id, nullif(p_distributor, ''), nullif(p_po, ''), p_ship_to_location_id,
          p_total, coalesce(p_date_ordered, practice_today(v_practice_id)), 'Ordered', false, auth.uid())
  returning id into v_shipment_id;

  for i in 1 .. coalesce(array_length(p_location_ids, 1), 0) loop
    insert into shipment_locations (shipment_id, location_id, qty)
    values (v_shipment_id, p_location_ids[i], coalesce(p_qtys[i], 0));
  end loop;

  if p_log then
    insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
    values (v_practice_id, auth.uid(), 'shipment.created', 'shipment', v_shipment_id,
            jsonb_build_object('total_qty', p_total, 'distributor', p_distributor));
  end if;

  return v_shipment_id;
end;
$$;

-- Recreate the queue path: create the shipment WITHOUT the inner log, then write
-- the single 'shipment.created_from_queue' row.
create or replace function create_shipment_from_queue(p_queue_entry_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  q record; v_locs uuid[]; v_n int; v_base numeric; v_rem numeric; v_qtys numeric[]; i int; v_shipment_id uuid;
begin
  select * into q from queue_entries where id = p_queue_entry_id;
  if not found then raise exception 'Queue entry not found'; end if;
  if q.shipment_created then return q.created_shipment_id; end if;
  if nullif(q.distributor, '') is null or coalesce(q.qty_to_order, 0) <= 0 then
    raise exception 'Queue entry needs a distributor and a positive quantity to order'; end if;

  select array_agg(l.id order by l.sort_order, l.name) into v_locs
  from queue_locations ql join locations l on l.id = ql.location_id
  where ql.queue_entry_id = q.id;
  if v_locs is null then
    select array_agg(id order by sort_order, name) into v_locs from locations where practice_id = q.practice_id;
  end if;
  v_n := coalesce(array_length(v_locs, 1), 0);
  if v_n = 0 then raise exception 'No locations to split the order across'; end if;

  v_base := floor(q.qty_to_order / v_n);
  v_rem  := q.qty_to_order - v_base * v_n;
  v_qtys := array[]::numeric[];
  for i in 1 .. v_n loop
    v_qtys := v_qtys || (v_base + case when (i - 1) < v_rem then 1 else 0 end);
  end loop;

  -- p_log => false: this path writes its own single audit row below.
  v_shipment_id := create_shipment(q.item_id, q.distributor, null, null,
                                   practice_today(q.practice_id), q.qty_to_order, v_locs, v_qtys, false);
  update shipments set notes = 'Auto-created from ordering queue' where id = v_shipment_id;
  update queue_entries
    set shipment_created = true, created_shipment_id = v_shipment_id,
        status = 'Ordered', date_ordered = coalesce(date_ordered, practice_today(q.practice_id))
    where id = q.id;

  insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
  values (q.practice_id, auth.uid(), 'shipment.created_from_queue', 'shipment', v_shipment_id,
          jsonb_build_object('queue_entry_id', q.id, 'total_qty', q.qty_to_order, 'locations', v_n));
  return v_shipment_id;
end;
$$;

-- The recreated create_shipment (new 9-arg signature) is a fresh object, so
-- re-apply the 0007/0008 grant posture: authenticated only, no PUBLIC.
revoke all on function create_shipment(uuid, text, text, uuid, date, numeric, uuid[], numeric[], boolean) from public;
grant execute on function create_shipment(uuid, text, text, uuid, date, numeric, uuid[], numeric[], boolean) to authenticated;


-- ####################################################################
-- ### 0011_baybridge_default_branding.sql
-- ####################################################################

-- ============================================================================
-- 0011 — Baybridge is the default brand; practices customize from null
-- ============================================================================
-- practices.primary_color / accent_color were created (0001) with column
-- defaults of Mann's own colors (#15409E / #6FA030). That made Mann's palette
-- leak into every NEW tenant: an un-customized practice was seeded with Mann's
-- blue/green and rendered in it — wrong for a multi-tenant product.
--
-- The platform default now lives in ONE place: the app stylesheet's :root
-- (Baybridge navy #14263D / teal #4089A2). A practice's color columns should be
-- null until it customizes, so practiceBrandCss() injects no override and the
-- Baybridge default shows through. This mirrors how logo_url already works
-- (null logo_url -> Baybridge icon fallback).
--
-- Dropping the defaults only affects NEW inserts. EXISTING rows keep whatever
-- they already store, so Mann (and any other practice created before this)
-- keeps its current colors untouched — no data is rewritten here. Mann's LOGO,
-- however, relies on a null logo_url + the app fallback, which is now Baybridge;
-- preserving Mann's own logo is a one-time data fix applied separately against
-- the live row (see the handoff notes / branding preservation SQL), not a
-- schema change, so it is intentionally not in this migration.
-- ============================================================================

alter table practices alter column primary_color drop default;
alter table practices alter column accent_color drop default;


-- ####################################################################
-- ### 0012_bulk_import_items.sql
-- ####################################################################

-- ============================================================================
-- 0012 — bulk_import_items: atomic CSV item import
-- ============================================================================
-- CSV bulk import writes many items (+ their per-location cabinet rows) at once.
-- Like the other compound writes, it must be all-or-nothing: a half-applied
-- import that inserted 60 of 100 items and then failed would leave the catalog
-- in a state nobody asked for. So it's one function = one transaction.
--
-- Security posture (same as the 0007 shipment/transfer RPCs — reviewed, not
-- assumed):
-- * SECURITY INVOKER. Runs in the CALLER's RLS context, so it physically
--   cannot write another practice's rows — the items INSERT policy
--   (practice_id = current_practice_id()) and the item_cabinets INSERT policy
--   (item_id must belong to the caller's practice) are still enforced against
--   every row this function writes. This STRENGTHENS isolation; it does not
--   bypass it. There is deliberately no practice_id parameter — the target
--   practice is derived from current_practice_id(), never from the caller.
-- * search_path pinned to public (defense in depth, per 0003/0004).
-- * Defensive scoping beyond what RLS already guarantees:
--     - category_id is honored ONLY if that category belongs to the caller's
--       practice; anything else is dropped to null (never trusted from input).
--     - cabinet rows are written only for the caller's OWN locations.
-- * One activity_log row for the whole import (actor_id = auth.uid()), so the
--   audit trail records who imported how many, in the same transaction.
--
-- Input: p_items is a JSON array; each element is one item:
--   { name (required), description, tracking_type ('good_low'|'quantity'),
--     unit, threshold (quantity only), estimated_unit_cost, category_id,
--     cabinet }
-- The client resolves category names -> ids and filters out duplicates during
-- the preview step, so by the time this runs the payload is already clean; the
-- checks here are a safety net, and any bad row raises -> the whole import rolls
-- back (all-or-nothing). cabinet is a single value applied to every location
-- (v1: no per-location cabinets via import).
-- ============================================================================

create or replace function bulk_import_items(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_practice_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_category_id uuid;
  v_cabinet text;
  v_type text;
  v_count int := 0;
begin
  v_practice_id := current_practice_id();
  if v_practice_id is null then
    raise exception 'Current user has no practice';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item->>'name'), '') = '' then
      raise exception 'Every item needs a name';
    end if;

    v_type := lower(coalesce(nullif(trim(v_item->>'tracking_type'), ''), 'good_low'));
    if v_type not in ('good_low', 'quantity') then
      raise exception 'Invalid tracking_type: %', v_item->>'tracking_type';
    end if;

    -- Only accept a category the CALLER's practice actually owns.
    v_category_id := null;
    if nullif(trim(v_item->>'category_id'), '') is not null then
      select id into v_category_id
      from categories
      where id = (trim(v_item->>'category_id'))::uuid
        and practice_id = v_practice_id;
    end if;

    insert into items (practice_id, name, description, tracking_type, unit,
                       threshold, estimated_unit_cost, category_id)
    values (
      v_practice_id,
      trim(v_item->>'name'),
      nullif(trim(coalesce(v_item->>'description', '')), ''),
      v_type,
      nullif(trim(coalesce(v_item->>'unit', '')), ''),
      case when v_type = 'quantity'
           then coalesce((nullif(trim(v_item->>'threshold'), ''))::numeric, 0)
           else null end,
      (nullif(trim(v_item->>'estimated_unit_cost'), ''))::numeric,
      v_category_id
    )
    returning id into v_item_id;

    -- One cabinet value -> a row for each of the practice's own locations.
    v_cabinet := nullif(trim(coalesce(v_item->>'cabinet', '')), '');
    if v_cabinet is not null then
      insert into item_cabinets (item_id, location_id, cabinet)
      select v_item_id, l.id, v_cabinet
      from locations l
      where l.practice_id = v_practice_id;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
    values (v_practice_id, auth.uid(), 'items.bulk_imported', 'item', null,
            jsonb_build_object('count', v_count));
  end if;

  return v_count;
end;
$$;

-- Callable by signed-in practice members only (RLS still scopes every row).
revoke all on function bulk_import_items(jsonb) from public;
grant execute on function bulk_import_items(jsonb) to authenticated;


-- ####################################################################
-- ### 0013_practice_logos_storage.sql
-- ####################################################################

-- ============================================================================
-- 0013 — Practice logo storage: private bucket + per-practice access policies
-- ============================================================================
-- First use of Supabase Storage. Objects live in storage.objects and are
-- governed by RLS on that table exactly like our tenant tables, so a bad policy
-- here can leak/overwrite one practice's logo to another the same way a bad
-- table policy could leak data. This is designed and reviewed with the same
-- weight as any schema migration.
--
-- Model:
-- * Bucket 'practice-logos' is PRIVATE (public => false): there is no
--   unauthenticated read path at all; the app renders a logo via a short-lived
--   SIGNED URL, which itself goes through the read policy below.
-- * Object path is `{practice_id}/logo-<timestamp>.<ext>` — the practice_id is
--   the FIRST path segment, and every policy keys off (storage.foldername(name))[1].
--   An object not under a practice-id folder matches NO policy, so it can never
--   be created (the insert policy blocks it) and thus never exists to be read.
-- * Read: any signed-in member of the practice, own folder only.
-- * Insert/Update/Delete: own folder AND owner/admin only — mirrors the existing
--   practices-table UPDATE policy that already gates who may change
--   primary_color/accent_color, rather than inventing a new rule.
-- * Raster-only (png/jpeg/webp), 2 MB cap, enforced at the bucket. SVG is
--   excluded on purpose: inline SVG can carry <script> (stored-XSS vector).
--
-- practices.logo_path stores the object path (distinct from logo_url, which
-- stays for static/external logos like Mann's /logo.jpg). The app resolves the
-- header logo in order: signed(logo_path) -> logo_url -> Baybridge default.
-- ============================================================================

-- Private, raster-only, 2 MB bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-logos', 'practice-logos', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Read: signed-in member of the practice, own folder only.
drop policy if exists "logos: read own practice" on storage.objects;
create policy "logos: read own practice"
on storage.objects for select to authenticated
using ( bucket_id = 'practice-logos'
        and (storage.foldername(name))[1] = (current_practice_id())::text );

-- Insert: own folder, owner/admin only.
drop policy if exists "logos: insert own practice (owner/admin)" on storage.objects;
create policy "logos: insert own practice (owner/admin)"
on storage.objects for insert to authenticated
with check ( bucket_id = 'practice-logos'
             and (storage.foldername(name))[1] = (current_practice_id())::text
             and current_user_role() in ('owner', 'admin') );

-- Update: own folder, owner/admin only.
drop policy if exists "logos: update own practice (owner/admin)" on storage.objects;
create policy "logos: update own practice (owner/admin)"
on storage.objects for update to authenticated
using ( bucket_id = 'practice-logos'
        and (storage.foldername(name))[1] = (current_practice_id())::text
        and current_user_role() in ('owner', 'admin') );

-- Delete: own folder, owner/admin only.
drop policy if exists "logos: delete own practice (owner/admin)" on storage.objects;
create policy "logos: delete own practice (owner/admin)"
on storage.objects for delete to authenticated
using ( bucket_id = 'practice-logos'
        and (storage.foldername(name))[1] = (current_practice_id())::text
        and current_user_role() in ('owner', 'admin') );

-- Storage object path for the practice's uploaded logo (see resolution order above).
alter table practices add column if not exists logo_path text;


-- ####################################################################
-- ### 0014_location_addresses.sql
-- ####################################################################

-- ============================================================================
-- 0014 — Per-location physical + billing addresses
-- ============================================================================
-- Each location can carry a physical/mailing address and a separate billing
-- address. These are LOCATION SETTINGS ONLY — edited from the Locations screen,
-- never read on the inventory/ordering path (Dashboard, Check-in, Shipments,
-- Inventory, Queue keep showing only the location name, as today).
--
-- One jsonb column per address, grouping the fields together instead of widening
-- `locations` by a dozen columns for data that never touches inventory/ordering
-- (same jsonb-for-grouped-config instinct as practices.settings). Shape, all
-- fields optional:
--   { "line1", "line2", "city", "state", "postal_code", "country" }
--
-- Unlike practices.settings (a config bag that's always present, hence
-- NOT NULL DEFAULT '{}'), these are NULLABLE because null is meaningful:
--   * physical_address IS NULL      -> no physical address on file
--   * billing_address  IS NULL      -> billing is the SAME as physical (the
--                                      default/common case; the "billing same as
--                                      physical" checkbox is just billing IS NULL)
--   * billing_address  IS NOT NULL  -> a distinct billing address
--
-- Additive and nullable, so this never blocks adding or renaming a location on
-- having an address filled in. Existing locations RLS (practice-scoped
-- select/insert/update/delete) already covers these columns — no new policy.
-- ============================================================================

alter table locations add column if not exists physical_address jsonb;
alter table locations add column if not exists billing_address jsonb;


-- ####################################################################
-- ### 0015_location_cabinets.sql
-- ####################################################################

-- ============================================================================
-- 0015 — Per-location managed cabinet/storage labels
-- ============================================================================
-- Cabinet assignment was free text on item_cabinets.cabinet, so the same shelf
-- could drift into "Cab 3" / "Cabinet 3" / "3". This replaces that with a
-- managed per-location list — same move (and same reasoning) as 0008 replacing
-- free-text categorization with the `categories` table, and the same FK shape
-- (item link references the list, ON DELETE SET NULL).
--
-- Per-LOCATION, not practice-wide: Tampa's "Cabinet 3" and Palmetto's
-- "Cabinet 3" are physically unrelated spaces. So location_cabinets is a child
-- of location and is RLS-scoped via its parent location (like item_cabinets /
-- shipment_locations / queue_locations, per the 0001 join-table note), not via a
-- redundant practice_id column.
--
-- Expand/contract: item_cabinets.cabinet (text) is kept but becomes vestigial
-- once the app writes cabinet_id; a later migration drops it after the app is
-- confirmed on cabinet_id. Nothing here is destructive — existing free-text
-- values are preserved as managed labels + backfilled cabinet_id links.
-- ============================================================================

-- 1. The managed list: per-location cabinet/storage labels.
create table if not exists location_cabinets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete cascade not null,
  label text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table location_cabinets enable row level security;

-- Scoped via the parent location (no practice_id column). A row is reachable
-- only if its location belongs to the caller's practice.
drop policy if exists "select via parent location" on location_cabinets;
create policy "select via parent location" on location_cabinets for select
  using (location_id in (select id from locations where practice_id = current_practice_id()));
drop policy if exists "insert via parent location" on location_cabinets;
create policy "insert via parent location" on location_cabinets for insert
  with check (location_id in (select id from locations where practice_id = current_practice_id()));
drop policy if exists "update via parent location" on location_cabinets;
create policy "update via parent location" on location_cabinets for update
  using (location_id in (select id from locations where practice_id = current_practice_id()));
drop policy if exists "delete via parent location" on location_cabinets;
create policy "delete via parent location" on location_cabinets for delete
  using (location_id in (select id from locations where practice_id = current_practice_id()));

-- Case-insensitive uniqueness per location (same guard as category/location names).
create unique index if not exists location_cabinets_loc_label_lower_idx
  on location_cabinets (location_id, lower(label));

-- 2. Backfill labels from existing free-text cabinets: one per distinct
--    (location, trimmed non-empty cabinet). Empty on a fresh DB (no items yet).
insert into location_cabinets (location_id, label, sort_order)
select location_id, label, 0
from (
  select distinct location_id, btrim(cabinet) as label
  from item_cabinets
  where cabinet is not null and btrim(cabinet) <> ''
) d
on conflict (location_id, lower(label)) do nothing;

-- 3. Link item_cabinets to the managed label (FK, ON DELETE SET NULL — same as
--    items.category_id). Backfill the link from the just-created labels.
alter table item_cabinets add column if not exists cabinet_id uuid references location_cabinets(id) on delete set null;

update item_cabinets ic
set cabinet_id = lc.id
from location_cabinets lc
where lc.location_id = ic.location_id
  and lower(lc.label) = lower(btrim(ic.cabinet))
  and ic.cabinet is not null and btrim(ic.cabinet) <> ''
  and ic.cabinet_id is null;

-- 4. bulk_import_items: match the cabinet value against each location's EXISTING
--    labels and link via cabinet_id — never create a label from import (an
--    unmatched cabinet is left unset + warned in the preview, exactly like an
--    unmatched category). Signature unchanged -> CREATE OR REPLACE (existing
--    authenticated grant preserved). Security posture IDENTICAL to 0012:
--    SECURITY INVOKER, search_path pinned, practice derived from
--    current_practice_id(), every insert still RLS-checked (items / location_
--    cabinets / item_cabinets insert policies all apply to the caller's rows).
create or replace function bulk_import_items(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_practice_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_category_id uuid;
  v_cabinet text;
  v_type text;
  v_loc uuid;
  v_cab_id uuid;
  v_count int := 0;
begin
  v_practice_id := current_practice_id();
  if v_practice_id is null then raise exception 'Current user has no practice'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'p_items must be a JSON array'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'name'), '') = '' then raise exception 'Every item needs a name'; end if;

    v_type := lower(coalesce(nullif(trim(v_item->>'tracking_type'), ''), 'good_low'));
    if v_type not in ('good_low', 'quantity') then raise exception 'Invalid tracking_type: %', v_item->>'tracking_type'; end if;

    v_category_id := null;
    if nullif(trim(v_item->>'category_id'), '') is not null then
      select id into v_category_id from categories
      where id = (trim(v_item->>'category_id'))::uuid and practice_id = v_practice_id;
    end if;

    insert into items (practice_id, name, description, tracking_type, unit,
                       threshold, estimated_unit_cost, category_id)
    values (
      v_practice_id, trim(v_item->>'name'),
      nullif(trim(coalesce(v_item->>'description', '')), ''), v_type,
      nullif(trim(coalesce(v_item->>'unit', '')), ''),
      case when v_type = 'quantity' then coalesce((nullif(trim(v_item->>'threshold'), ''))::numeric, 0) else null end,
      (nullif(trim(v_item->>'estimated_unit_cost'), ''))::numeric, v_category_id
    )
    returning id into v_item_id;

    -- One cabinet value -> matched against each location's EXISTING labels
    -- (case-insensitive). NO implicit label creation from import — an unmatched
    -- cabinet is left unset at that location (no item_cabinets row) and the
    -- client preview warns the row. Identical rule, and identical reasoning, to
    -- the unmatched-category handling above: importing must never quietly mint
    -- new managed labels, or free-text drift just relocates into the CSV path.
    v_cabinet := nullif(trim(coalesce(v_item->>'cabinet', '')), '');
    if v_cabinet is not null then
      for v_loc in select id from locations where practice_id = v_practice_id loop
        select id into v_cab_id from location_cabinets
        where location_id = v_loc and lower(label) = lower(v_cabinet);
        if v_cab_id is not null then
          insert into item_cabinets (item_id, location_id, cabinet_id) values (v_item_id, v_loc, v_cab_id);
        end if;
      end loop;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    insert into activity_log (practice_id, actor_id, action, entity_type, entity_id, detail)
    values (v_practice_id, auth.uid(), 'items.bulk_imported', 'item', null, jsonb_build_object('count', v_count));
  end if;

  return v_count;
end;
$$;

-- 5. "Copy this list to another location." SECURITY INVOKER: everything runs
--    under the caller's RLS, so both locations must be the caller's own — it
--    physically cannot copy across practices. Both are checked EXPLICITLY up
--    front so the error experience is consistent: without the source check, an
--    invalid target fails loud (insert policy) but an invalid source would fail
--    quiet (RLS filters the SELECT to nothing -> returns 0). Existing labels at
--    the target are skipped (case-insensitive). Returns the number added.
create or replace function copy_location_cabinets(p_from_location uuid, p_to_location uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_count int;
begin
  if not exists (select 1 from locations where id = p_from_location and practice_id = current_practice_id()) then
    raise exception 'Source location not found';
  end if;
  if not exists (select 1 from locations where id = p_to_location and practice_id = current_practice_id()) then
    raise exception 'Target location not found';
  end if;

  insert into location_cabinets (location_id, label, sort_order)
  select p_to_location, lc.label, lc.sort_order
  from location_cabinets lc
  where lc.location_id = p_from_location
  on conflict (location_id, lower(label)) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function copy_location_cabinets(uuid, uuid) from public;
grant execute on function copy_location_cabinets(uuid, uuid) to authenticated;


-- ####################################################################
-- ### 0016_gate_destructive_deletes.sql
-- ####################################################################

-- ============================================================================
-- 0016 — Gate outright DELETE on managed entities to owner/admin (interim H1)
-- ============================================================================
-- Consistency-report finding H1: within-practice authorization was flat — any
-- staff member could delete locations, items, categories, cabinet labels, or
-- distributors. `FOUNDER.md` requires least-privilege; this tightens outright
-- DELETE on the top-level managed entities to owner/admin.
--
-- Scope, deliberately narrow:
-- * INSERT/UPDATE are UNCHANGED — adding and editing is normal staff work; only
--   outright deletion is restricted.
-- * Child/join tables (item_cabinets, shipment_locations, queue_locations) are
--   NOT gated: their deletes happen during ordinary editing (e.g. reassigning an
--   item's cabinet rewrites item_cabinets), so gating them would break staff
--   editing. Their tenant/parent scoping is untouched.
-- * checks/shipments/transfers/queue_entries have no outright-delete UI, so
--   there is nothing to gate there today.
--
-- This is the INTERIM fix on the existing 3-role model. The full
-- capabilities/permissions model stays deferred — ADR 0006, unchanged. Each
-- policy's tenant scope is preserved; the role check is ANDed onto it (for
-- location_cabinets, onto its existing parent-location subquery, not replacing
-- it).
-- ============================================================================

drop policy if exists "delete own practice rows" on locations;
create policy "delete own practice rows" on locations for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete own practice rows" on items;
create policy "delete own practice rows" on items for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete own practice rows" on categories;
create policy "delete own practice rows" on categories for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete own practice rows" on distributors;
create policy "delete own practice rows" on distributors for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete via parent location" on location_cabinets;
create policy "delete via parent location" on location_cabinets for delete
  using (location_id in (select id from locations where practice_id = current_practice_id())
         and current_user_role() in ('owner', 'admin'));


-- ####################################################################
-- ### 0017_practice_lifecycle.sql
-- ####################################################################

-- ============================================================================
-- 0017 — Practice lifecycle status model (ADR 0007)
-- ============================================================================
-- Introduces a first-class practice lifecycle so suspension and offboarding are
-- real, RLS-enforced states, and so offboarding — not hard-delete — becomes the
-- normal way a practice leaves (resolving finding M3).
--
-- Enforcement is deliberately a SINGLE chokepoint: current_practice_id() returns
-- the caller's practice only when status in ('trial','active'), NULL otherwise.
-- Every tenant policy already resolves through that helper, so a frozen practice
-- closes all reads and writes at once — no per-table policy edits.
--
-- STATED DECISION (ADR 0007): new practices default to 'active', not 'trial'.
-- There are no trial mechanics yet (no trial_ends_at, no billing, no trial->paid
-- transition), so the two are functionally identical today; defaulting to 'active'
-- avoids parking every practice in a 'trial' state with no exit path pre-Stripe.
-- When Stripe lands (Phase 2), the default can flip to 'trial' with a real
-- trial_ends_at. This is a decision on the record, not an accident.
-- ============================================================================

-- 1. Columns. ADD COLUMN ... DEFAULT backfills every existing practice to
--    'active' / now(); the check constrains the value set.
alter table practices
  add column if not exists status text not null default 'active'
    check (status in ('trial', 'active', 'suspended', 'offboarded')),
  add column if not exists status_changed_at timestamptz not null default now();

-- 2. The freeze: gate current_practice_id() on status. DEFINER + reads practices
--    directly, so no recursion through the practices SELECT policy. A suspended or
--    offboarded practice yields NULL here, and every tenant policy denies.
create or replace function current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.practices p
  join public.profiles pr on pr.practice_id = p.id
  where pr.id = auth.uid()
    and p.status in ('trial', 'active')
$$;

-- 3. A member must still read their OWN profile even when frozen — otherwise the
--    app can't tell "suspended" from "never onboarded" and would misroute them to
--    onboarding. The profiles SELECT policy was practice-scoped only; add a
--    self-read. For an ACTIVE practice this is a superset that changes nothing
--    (self is already in the practice match); for a FROZEN one the member now sees
--    exactly their own profile row and no other.
drop policy if exists "select profiles in own practice" on profiles;
create policy "select profiles in own practice" on profiles
  for select using (id = auth.uid() or practice_id = current_practice_id());

-- 4. THE SINGLE FREEZE EXCEPTION — name + status only.
--    A frozen practice's members need just enough to render a "practice suspended,
--    contact support" screen. This SECURITY DEFINER function is the one and only
--    crack in the freeze:
--      * COLUMN scope is the return signature — exactly (name, status), nothing
--        else. (RLS is row-level, so a table policy could not restrict columns;
--        the function can, and does.)
--      * ROW scope is hard-wired to the caller's own practice via
--        pr.id = auth.uid() — it cannot be aimed at another tenant.
--    Same DEFINER identity-helper convention as current_practice_id/current_user_role.
create or replace function my_practice_status()
returns table (name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.status
  from public.practices p
  join public.profiles pr on pr.practice_id = p.id
  where pr.id = auth.uid()
$$;
revoke all on function my_practice_status() from public;
grant execute on function my_practice_status() to authenticated;

-- 5. M3 fix — onboarding upserts the profile instead of assuming it exists.
--    The RPCs did `update profiles ... where id = auth.uid()`, which silently
--    no-ops if the profile row is missing (e.g. a prior hard-delete cascaded it
--    away). Upsert makes re-onboarding robust and closes M3 as defensive depth on
--    top of "offboarding replaces hard-delete."
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

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), new_practice_id, 'owner', (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;

  -- Seed the default location (preserved from 0005 — must not regress).
  insert into locations (practice_id, name, sort_order)
    values (new_practice_id, 'Main Office', 0);

  return new_practice_id;
end;
$$;

create or replace function join_practice_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_practice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_practice_id from practices where join_code = upper(trim(code));

  if target_practice_id is null then
    raise exception 'No practice found for that join code';
  end if;

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), target_practice_id, 'staff', (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;

  return target_practice_id;
end;
$$;

create or replace function accept_invitation(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv from invitations
    where token = invite_token and status = 'Pending' and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), inv.practice_id, inv.role, (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;


-- ####################################################################
-- ### 0018_lock_status_to_operator.sql
-- ####################################################################

-- ============================================================================
-- 0018 — Lifecycle status is operator-only (column-level UPDATE lockdown)
-- ============================================================================
-- Follows 0017/ADR 0007. The practices UPDATE policy lets owner/admin update the
-- row, which (with a table-wide UPDATE grant) includes the new `status` /
-- `status_changed_at` columns — i.e. a tenant could suspend/offboard/reactivate
-- their own practice. The lifecycle is meant to be OPERATOR-driven, so tenants
-- must not write those columns at all.
--
-- Postgres note: a column-level REVOKE is a no-op while the role holds a
-- table-level UPDATE (that implies every column). So we drop the table-wide grant
-- and re-grant UPDATE on exactly the columns a tenant may edit — everything except
-- status, status_changed_at (operator-only) and id, created_at (immutable).
--
-- Enforcement is orthogonal to RLS: an owner still needs the row policy to pass,
-- but now also needs column privilege on each column written; they have none on
-- status. service_role (the operator path) bypasses these grants, so operator
-- suspend/offboard/reactivate is unaffected. Additive and low-risk: the app only
-- ever updates logo_path/timezone/primary_color/accent_color, all still granted.
-- ============================================================================

revoke update on practices from authenticated;

grant update (name, join_code, logo_url, primary_color, accent_color, settings, timezone, logo_path)
  on practices to authenticated;
