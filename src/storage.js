/**
 * PLACEHOLDER — this whole file is exactly what needs replacing.
 *
 * The rest of App.jsx still calls getValue()/setValue() expecting one JSON blob per
 * key ("items", "checks", "shipments", "transfers", "queue", "lists"). That matched
 * the old single-tenant Firestore setup. It does NOT match the new Supabase schema in
 * supabase/migrations/0001_init.sql, which is normalized into real tables scoped by
 * practice_id.
 *
 * This stub just uses localStorage so the app still builds and runs locally while
 * that rewiring happens — it is NOT multi-tenant, NOT shared across devices, and NOT
 * meant to be the real implementation. See README.md, "What's NOT done yet," step 3.
 */

function localKey(key) {
  return "mann-supply::local::" + key;
}

export async function getValue(key) {
  return localStorage.getItem(localKey(key));
}

export async function setValue(key, value) {
  localStorage.setItem(localKey(key), value);
  return { key, value };
}
