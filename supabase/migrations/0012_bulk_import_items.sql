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
