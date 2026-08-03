import { supabase } from "./supabase";

/**
 * Locations data access — the first real Supabase table wiring (step 2).
 * Everything else still runs on the localStorage blob until step 3; this
 * module is deliberately scoped to the `locations` table only.
 *
 * Names are unique per practice, case-insensitively — enforced in the DB
 * (migration 0005) and pre-checked here so callers can show a friendly message
 * instead of a raw constraint violation. `nameTaken` is the client-side guard.
 */

export async function fetchLocations(practiceId) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, sort_order, physical_address, billing_address")
    .eq("practice_id", practiceId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Save a location's addresses. Pass address objects
// ({line1,line2,city,state,postal_code,country}) or null. billing = null means
// "same as physical" (migration 0014). These are location settings only.
export async function saveLocationAddresses(id, physicalAddress, billingAddress) {
  const { error } = await supabase
    .from("locations")
    .update({ physical_address: physicalAddress, billing_address: billingAddress })
    .eq("id", id);
  if (error) throw error;
}

// Case-insensitive check against an in-memory list, optionally ignoring one id
// (so renaming a location to a different casing of its own name is allowed).
export function nameTaken(locations, name, ignoreId = null) {
  const needle = name.trim().toLowerCase();
  return locations.some((l) => l.id !== ignoreId && l.name.trim().toLowerCase() === needle);
}

export async function createLocation(practiceId, name, sortOrder) {
  const { data, error } = await supabase
    .from("locations")
    .insert({ practice_id: practiceId, name: name.trim(), sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function renameLocation(id, name) {
  const { data, error } = await supabase
    .from("locations")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("id, name, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocation(id) {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw error;
}

// Persist a new ordering by writing each row's sort_order to its array index.
export async function saveLocationOrder(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("locations").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}
