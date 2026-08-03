import { supabase } from "./supabase";

/**
 * Shipments + per-location split data access (step 3c).
 *
 * Per the identity-boundary decision (docs/decisions/0003): the DB is id-keyed
 * (ship_to_location_id, shipment_locations.location_id); the in-memory shape the
 * app uses keeps locations as NAMES, translated here at the boundary. The unique
 * location-name guarantee (0005) makes name<->id a clean bijection.
 *
 * The multi-table writes (create + receive) go through the 0007 RPCs so they're
 * atomic; simple field edits are direct updates.
 *
 * app shipment shape:
 *   { id, itemId, distributor, po, shipTo (location name|""), dateOrdered,
 *     status, total, split: { [locationName]: qty }, dateReceived, notes,
 *     transfersCreated }
 */

function rowToShipment(row, locIdToName) {
  const split = {};
  for (const sl of row.shipment_locations || []) {
    const name = locIdToName[sl.location_id];
    if (name) split[name] = Number(sl.qty) || 0;
  }
  return {
    id: row.id,
    itemId: row.item_id,
    distributor: row.distributor || "",
    po: row.po_ref || "",
    shipTo: row.ship_to_location_id ? (locIdToName[row.ship_to_location_id] || "") : "",
    dateOrdered: row.date_ordered || "",
    status: row.status,
    total: Number(row.total_qty) || 0,
    split,
    dateReceived: row.date_received || "",
    notes: row.notes || "",
    transfersCreated: !!row.transfers_created,
  };
}

export async function fetchShipments(practiceId, locations) {
  const locIdToName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const { data, error } = await supabase
    .from("shipments")
    .select("id, item_id, distributor, po_ref, ship_to_location_id, total_qty, date_ordered, status, date_received, transfers_created, notes, shipment_locations(location_id, qty)")
    .eq("practice_id", practiceId)
    .order("date_ordered", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => rowToShipment(row, locIdToName));
}

// Manual "log an order" — atomic shipment + split via the 0007 RPC.
// `split` is a name-keyed { [locationName]: qty } map.
export async function createShipment(itemId, { distributor, po, shipTo, dateOrdered, split }, locations) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  const names = Object.keys(split);
  const total = names.reduce((sum, n) => sum + (Number(split[n]) || 0), 0);
  const { data, error } = await supabase.rpc("create_shipment", {
    p_item_id: itemId,
    p_distributor: distributor || null,
    p_po: po || null,
    p_ship_to_location_id: shipTo ? (nameToId[shipTo] || null) : null,
    p_date_ordered: dateOrdered || null,
    p_total: total,
    p_location_ids: names.map((n) => nameToId[n]).filter(Boolean),
    p_qtys: names.filter((n) => nameToId[n]).map((n) => Number(split[n]) || 0),
  });
  if (error) throw error;
  return data; // new shipment id
}

// Edit the per-location split of an existing (not-yet-received) shipment — a
// simple multi-row update, no transfer side effects, so direct writes are fine.
export async function updateShipmentSplit(shipmentId, split, locations) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  await supabase.from("shipment_locations").delete().eq("shipment_id", shipmentId);
  const rows = Object.entries(split)
    .filter(([name]) => nameToId[name])
    .map(([name, qty]) => ({ shipment_id: shipmentId, location_id: nameToId[name], qty: Number(qty) || 0 }));
  if (rows.length) {
    const { error } = await supabase.from("shipment_locations").insert(rows);
    if (error) throw error;
  }
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const { error: upErr } = await supabase.from("shipments").update({ total_qty: total }).eq("id", shipmentId);
  if (upErr) throw upErr;
}

// Mark received + create transfers atomically via the 0007 RPC.
export async function receiveShipment(shipmentId, dateReceived) {
  const { data, error } = await supabase.rpc("receive_shipment", {
    p_shipment_id: shipmentId,
    p_date_received: dateReceived || null,
  });
  if (error) throw error;
  return data; // number of transfers created
}
