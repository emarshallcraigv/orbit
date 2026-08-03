import { supabase } from "./supabase";

/**
 * Ordering-queue data access (step 3d): queue_entries + queue_locations.
 *
 * Per docs/decisions/0003, the DB is id-keyed (queue_locations.location_id); the
 * in-memory shape keeps location names (translated at this boundary).
 *
 * The queue->shipment transition goes through the atomic create_shipment_from_queue
 * RPC (0007). Everything else here is direct table writes — see flagQueueLocation
 * for why the parent+child write does NOT need an RPC.
 *
 * app entry shape:
 *   { id, itemId, dateFlagged, distributor, status, dateOrdered, notes,
 *     qtyToOrder, shipmentCreated, createdShipmentId,
 *     locations: [locationName], details: { [locationName]: { qty, reason } } }
 */

function rowToEntry(row, locIdToName) {
  const locations = [];
  const details = {};
  for (const ql of row.queue_locations || []) {
    const name = locIdToName[ql.location_id];
    if (name) {
      locations.push(name);
      details[name] = { qty: ql.qty ?? null, reason: ql.reason || "" };
    }
  }
  return {
    id: row.id,
    itemId: row.item_id,
    dateFlagged: row.date_flagged || "",
    distributor: row.distributor || "",
    status: row.status,
    dateOrdered: row.date_ordered || "",
    notes: row.notes || "",
    qtyToOrder: row.qty_to_order ?? "",
    shipmentCreated: !!row.shipment_created,
    createdShipmentId: row.created_shipment_id || null,
    locations,
    details,
  };
}

export async function practiceToday(practiceId) {
  const { data } = await supabase.rpc("practice_today", { p_practice_id: practiceId });
  return data || null;
}

export async function fetchQueue(practiceId, locations) {
  const locIdToName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const { data, error } = await supabase
    .from("queue_entries")
    .select("id, item_id, date_flagged, distributor, status, date_ordered, notes, qty_to_order, shipment_created, created_shipment_id, queue_locations(location_id, qty, reason)")
    .eq("practice_id", practiceId)
    .order("date_flagged", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => rowToEntry(row, locIdToName));
}

/**
 * Flag an item for ordering at a location (from a check-in "Need to Order" or a
 * manual add). One OPEN (Pending/Ordered) entry per item, accumulating locations.
 *
 * This touches two tables (queue_entries + queue_locations) but is a single-ENTITY
 * parent+child write — the same shape as items+item_cabinets and shipments+split,
 * both done client-side. It is NOT the cross-entity compound flow class that gets
 * an RPC (queue->shipment, shipment->transfers), because a partial failure here is
 * not the dangerous, silent kind: the source of truth for "needs ordering" is the
 * CHECK (the dashboard computes attention from checks, not the queue), so a
 * half-written entry never hides a needed order — the flag still shows. And a
 * failure is visible + recoverable, not silent inventory corruption. The parent is
 * written first so the entry always has its core fields; errors propagate.
 */
export async function flagQueueLocation(practiceId, itemId, locationName, detail, locations, opts = {}) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  const locId = nameToId[locationName];
  if (!locId) return null;

  const { data: existing, error: findErr } = await supabase
    .from("queue_entries")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("item_id", itemId)
    .in("status", ["Pending", "Ordered"])
    .order("date_flagged", { ascending: false })
    .limit(1);
  if (findErr) throw findErr;

  let entryId = existing && existing[0] ? existing[0].id : null;
  if (!entryId) {
    const insert = { practice_id: practiceId, item_id: itemId, status: "Pending", performed_by: opts.performedBy || null };
    if (opts.flaggedDate) insert.date_flagged = opts.flaggedDate;
    const { data: created, error: insErr } = await supabase.from("queue_entries").insert(insert).select("id").single();
    if (insErr) throw insErr;
    entryId = created.id;
  }

  const { error: locErr } = await supabase
    .from("queue_locations")
    .upsert(
      { queue_entry_id: entryId, location_id: locId, qty: detail?.qty ?? null, reason: detail?.reason || null },
      { onConflict: "queue_entry_id,location_id" }
    );
  if (locErr) throw locErr;
  return entryId;
}

// Simple field edits on a queue entry (distributor, qty, status, notes).
export async function updateQueueFields(id, patch) {
  const fields = {};
  if ("distributor" in patch) fields.distributor = patch.distributor || null;
  if ("qtyToOrder" in patch) fields.qty_to_order = (patch.qtyToOrder === "" || patch.qtyToOrder == null) ? null : Number(patch.qtyToOrder);
  if ("status" in patch) fields.status = patch.status;
  if ("notes" in patch) fields.notes = patch.notes || null;
  if (!Object.keys(fields).length) return;
  const { error } = await supabase.from("queue_entries").update(fields).eq("id", id);
  if (error) throw error;
}

// Replace an entry's covered locations (the queue LocationToggle).
export async function setQueueLocations(entryId, locationNames, details, locations) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  await supabase.from("queue_locations").delete().eq("queue_entry_id", entryId);
  const rows = locationNames
    .filter((n) => nameToId[n])
    .map((n) => ({ queue_entry_id: entryId, location_id: nameToId[n], qty: details?.[n]?.qty ?? null, reason: details?.[n]?.reason || null }));
  if (rows.length) {
    const { error } = await supabase.from("queue_locations").insert(rows);
    if (error) throw error;
  }
}

// Order the entry -> atomic shipment + split + queue flag via the 0007 RPC.
export async function orderQueueEntry(entryId) {
  const { data, error } = await supabase.rpc("create_shipment_from_queue", { p_queue_entry_id: entryId });
  if (error) throw error;
  return data; // new shipment id
}
