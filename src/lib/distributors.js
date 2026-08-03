import { supabase } from "./supabase";

/**
 * Distributors data access (step 3a + directory extension).
 *
 * A per-practice vendor directory: name is the app-facing handle (shipments and
 * queue entries still store a distributor as a name string), plus optional
 * contact/account fields added in migration 0006.
 */

const FIELDS = "id, name, phone, account_number, rep_name, rep_phone, rep_email, order_email, website_url, notes";

// Trim the name; turn blank optional fields into null so the DB stores nulls,
// not empty strings. Only whitelisted keys pass through.
const OPTIONAL = ["phone", "account_number", "rep_name", "rep_phone", "rep_email", "order_email", "website_url", "notes"];
function cleanFields(fields) {
  const out = {};
  if (fields.name != null) out.name = String(fields.name).trim();
  for (const k of OPTIONAL) {
    if (k in fields) {
      const v = fields[k] == null ? "" : String(fields[k]).trim();
      out[k] = v === "" ? null : v;
    }
  }
  return out;
}

export async function fetchDistributors(practiceId) {
  const { data, error } = await supabase
    .from("distributors")
    .select(FIELDS)
    .eq("practice_id", practiceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createDistributor(practiceId, fields) {
  const { data, error } = await supabase
    .from("distributors")
    .insert({ practice_id: practiceId, ...cleanFields(fields) })
    .select(FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateDistributor(id, fields) {
  const { data, error } = await supabase
    .from("distributors")
    .update(cleanFields(fields))
    .eq("id", id)
    .select(FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDistributor(id) {
  const { error } = await supabase.from("distributors").delete().eq("id", id);
  if (error) throw error;
}
