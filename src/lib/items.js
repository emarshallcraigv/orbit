import { supabase } from "./supabase";

/**
 * Items + per-location cabinets data access (step 3a).
 *
 * The DB is the id-keyed source of truth: `items` rows carry a uuid id, and
 * `item_cabinets` ties (item_id, location_id) -> cabinet. The app's in-memory
 * item shape keeps cabinets keyed by location NAME (a stable handle, unique per
 * practice thanks to migration 0005's case-insensitive index), so this module
 * translates name <-> location_id at the boundary. That keeps the id
 * normalization where it belongs (the DB) without churning every UI component.
 *
 * app item shape:
 *   { id, name, desc, type: 'Good/Low'|'Quantity', unit, threshold,
 *     thresholdDesc, cabinets: { [locationName]: cabinet } }
 */

function toAppType(trackingType) {
  return trackingType === "quantity" ? "Quantity" : "Good/Low";
}
function toDbType(appType) {
  return appType === "Quantity" ? "quantity" : "good_low";
}
// Blank/invalid -> null; otherwise a number (for the optional reference cost).
function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToItem(row, locIdToName) {
  const cabinets = {};
  for (const c of row.item_cabinets || []) {
    const name = locIdToName[c.location_id];
    if (name) cabinets[name] = c.cabinet ?? "";
  }
  return {
    id: row.id,
    name: row.name,
    desc: row.description || "",
    type: toAppType(row.tracking_type),
    unit: row.unit || "",
    threshold: row.threshold,
    thresholdDesc: row.threshold_desc || "",
    estimatedUnitCost: row.estimated_unit_cost ?? "",
    categoryId: row.category_id || "",
    cabinets,
  };
}

// Replace an item's cabinet rows from a name-keyed map (only non-empty ones).
async function writeCabinets(itemId, cabinetsByName, nameToId) {
  const { error: delErr } = await supabase.from("item_cabinets").delete().eq("item_id", itemId);
  if (delErr) throw delErr;
  const rows = Object.entries(cabinetsByName || {})
    .filter(([name, cab]) => nameToId[name] && cab != null && String(cab).trim() !== "")
    .map(([name, cab]) => ({ item_id: itemId, location_id: nameToId[name], cabinet: String(cab) }));
  if (rows.length) {
    const { error: insErr } = await supabase.from("item_cabinets").insert(rows);
    if (insErr) throw insErr;
  }
}

export async function fetchItems(practiceId, locations) {
  const locIdToName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const { data, error } = await supabase
    .from("items")
    .select("id, name, description, tracking_type, unit, threshold, threshold_desc, active, estimated_unit_cost, category_id, item_cabinets(location_id, cabinet)")
    .eq("practice_id", practiceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => rowToItem(row, locIdToName));
}

export async function createItem(practiceId, itemData, locations) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  const { data, error } = await supabase
    .from("items")
    .insert({
      practice_id: practiceId,
      name: itemData.name,
      description: itemData.desc || null,
      tracking_type: toDbType(itemData.type),
      unit: itemData.unit || null,
      threshold: itemData.type === "Quantity" ? (itemData.threshold ?? 0) : null,
      threshold_desc: itemData.thresholdDesc || null,
      estimated_unit_cost: numOrNull(itemData.estimatedUnitCost),
      category_id: itemData.categoryId || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await writeCabinets(data.id, itemData.cabinets, nameToId);
  return data.id;
}

export async function updateItem(id, patch, locations) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  const fields = {};
  if ("type" in patch) fields.tracking_type = toDbType(patch.type);
  if ("unit" in patch) fields.unit = patch.unit || null;
  if ("threshold" in patch) fields.threshold = patch.threshold ?? null;
  if ("name" in patch) fields.name = patch.name;
  if ("desc" in patch) fields.description = patch.desc || null;
  if ("thresholdDesc" in patch) fields.threshold_desc = patch.thresholdDesc || null;
  if ("estimatedUnitCost" in patch) fields.estimated_unit_cost = numOrNull(patch.estimatedUnitCost);
  if ("categoryId" in patch) fields.category_id = patch.categoryId || null;
  if (Object.keys(fields).length) {
    const { error } = await supabase.from("items").update(fields).eq("id", id);
    if (error) throw error;
  }
  if ("cabinets" in patch) await writeCabinets(id, patch.cabinets, nameToId);
}

export async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

// Bulk CSV import — atomic, via the bulk_import_items RPC (migration 0012).
// `items` is the resolved payload from importItems.buildPayload(). The RPC
// derives the practice from current_practice_id() and scopes every write to it;
// returns the count inserted.
export async function bulkImportItems(items) {
  const { data, error } = await supabase.rpc("bulk_import_items", { p_items: items });
  if (error) throw error;
  return data;
}
