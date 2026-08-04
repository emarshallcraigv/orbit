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
