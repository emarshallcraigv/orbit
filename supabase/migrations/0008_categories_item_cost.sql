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
