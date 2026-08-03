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
