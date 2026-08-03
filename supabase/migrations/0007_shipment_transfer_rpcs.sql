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
