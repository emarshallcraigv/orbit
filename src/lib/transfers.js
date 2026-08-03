import { supabase } from "./supabase";

/**
 * Transfers data access (step 3c). Transfers are created by receive_shipment
 * (0007 RPC), so there's no create() here — only load and confirm. Confirming a
 * transfer is a single-table update (no cross-entity side effects), so it's a
 * direct write plus a best-effort audit row.
 *
 * Per docs/decisions/0003, the DB is id-keyed (from/to_location_id) and the
 * in-memory shape uses location names, translated at this boundary.
 *
 * app transfer shape:
 *   { id, shipmentId, itemId, fromLocation (name), toLocation (name), qty,
 *     status, dateCreated, dateReceived }
 */

function rowToTransfer(row, locIdToName) {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    itemId: row.item_id,
    fromLocation: row.from_location_id ? (locIdToName[row.from_location_id] || "") : "",
    toLocation: row.to_location_id ? (locIdToName[row.to_location_id] || "") : "",
    qty: Number(row.qty) || 0,
    status: row.status,
    dateCreated: row.date_created || "",
    dateReceived: row.date_received || "",
  };
}

export async function fetchTransfers(practiceId, locations) {
  const locIdToName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const { data, error } = await supabase
    .from("transfers")
    .select("id, shipment_id, item_id, from_location_id, to_location_id, qty, status, date_created, date_received")
    .eq("practice_id", practiceId)
    .order("date_created", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => rowToTransfer(row, locIdToName));
}

// Confirm a transfer arrived at its destination. Sets performed_by and a
// timezone-correct received date (via the practice_today RPC), then logs it.
export async function confirmTransfer(transferId, { performedBy, practiceId }) {
  const { data: today } = await supabase.rpc("practice_today", { p_practice_id: practiceId });
  const { error } = await supabase
    .from("transfers")
    .update({ status: "Received", date_received: today || null, performed_by: performedBy || null })
    .eq("id", transferId);
  if (error) throw error;
  // Audit is best-effort — a failed log row must not fail the confirmation.
  try {
    await supabase.from("activity_log").insert({
      practice_id: practiceId, actor_id: performedBy || null,
      action: "transfer.confirmed", entity_type: "transfer", entity_id: transferId, detail: {},
    });
  } catch (_e) { /* ignore */ }
}
