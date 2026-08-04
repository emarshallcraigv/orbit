import { supabase } from "./supabase";

/**
 * Per-location cabinet/storage labels (managed list, migration 0015).
 *
 * A location's labels are its own — Tampa's "Cabinet 3" is a different row from
 * Palmetto's. RLS scopes location_cabinets via its parent location, so a plain
 * select returns only the caller's practice's labels. Item cabinet assignment
 * references these by id (item_cabinets.cabinet_id); nothing here or in the item
 * form ever creates a label implicitly — labels are only created here, on the
 * Locations screen.
 */

export async function fetchLocationCabinets() {
  const { data, error } = await supabase
    .from("location_cabinets")
    .select("id, location_id, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Case-insensitive uniqueness check within one location (pre-checks the DB
// unique index so callers can show a friendly message).
export function cabinetLabelTaken(cabinets, locationId, label, ignoreId = null) {
  const needle = label.trim().toLowerCase();
  return (cabinets || []).some(
    (c) => c.location_id === locationId && c.id !== ignoreId && c.label.trim().toLowerCase() === needle
  );
}

export async function addCabinet(locationId, label) {
  const { data, error } = await supabase
    .from("location_cabinets")
    .insert({ location_id: locationId, label: label.trim() })
    .select("id, location_id, label, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function renameCabinet(id, label) {
  const { error } = await supabase.from("location_cabinets").update({ label: label.trim() }).eq("id", id);
  if (error) throw error;
}

export async function deleteCabinet(id) {
  const { error } = await supabase.from("location_cabinets").delete().eq("id", id);
  if (error) throw error;
}

// Copy one location's list to another (atomic RPC; both must be the caller's own
// locations — enforced in the function + RLS). Returns the number of labels added.
export async function copyCabinets(fromLocationId, toLocationId) {
  const { data, error } = await supabase.rpc("copy_location_cabinets", {
    p_from_location: fromLocationId,
    p_to_location: toLocationId,
  });
  if (error) throw error;
  return data;
}
