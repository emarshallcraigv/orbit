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
