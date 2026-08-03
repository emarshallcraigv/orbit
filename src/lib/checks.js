import { supabase } from "./supabase";

/**
 * Check-ins data access (step 3e). One row per (item, location) — the schema's
 * unique(item_id, location_id) matches the app's one-check-per-item-per-location
 * model, so saving is an upsert on that conflict.
 *
 * Per docs/decisions/0003 the DB is id-keyed; the in-memory shape is the app's
 * `checks` dict keyed by keyFor(locationName, itemId). The displayed check date
 * is derived from checked_at in the PRACTICE's timezone (not the browser/server),
 * so it lines up with the timezone-aware dates the shipment/transfer RPCs write.
 *
 * app check shape: { count, status, notes, date }
 *   - Quantity items:  counted_qty -> count (status is derived by the app)
 *   - Good/Low items:  status -> status  (count stays "")
 */

function dateInTz(ts, timezone) {
  if (!ts) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  } catch {
    return String(ts).slice(0, 10);
  }
}

export async function fetchChecks(practiceId, locations, timezone) {
  const locIdToName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const { data, error } = await supabase
    .from("checks")
    .select("item_id, location_id, counted_qty, status, notes, checked_at")
    .eq("practice_id", practiceId);
  if (error) throw error;
  const dict = {};
  for (const row of data || []) {
    const locName = locIdToName[row.location_id];
    if (!locName) continue;
    dict[locName + "::" + row.item_id] = {
      count: row.counted_qty ?? "",
      status: row.status || undefined,
      notes: row.notes || "",
      date: dateInTz(row.checked_at, timezone),
    };
  }
  return dict;
}

// Upsert a check for (item, location). Caller passes DB-shaped fields (already
// mapped for the item's tracking type). Records performed_by + a fresh checked_at.
export async function saveCheck(practiceId, itemId, locationName, fields, locations, opts = {}) {
  const nameToId = Object.fromEntries(locations.map((l) => [l.name, l.id]));
  const locId = nameToId[locationName];
  if (!locId) return;
  const row = {
    practice_id: practiceId,
    item_id: itemId,
    location_id: locId,
    counted_qty: fields.counted_qty ?? null,
    status: fields.status ?? null,
    notes: fields.notes || null,
    performed_by: opts.performedBy || null,
    checked_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("checks").upsert(row, { onConflict: "item_id,location_id" });
  if (error) throw error;
}
