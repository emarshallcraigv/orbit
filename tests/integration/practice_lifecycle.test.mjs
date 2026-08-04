// Integration: practice lifecycle status dimension (0017 / ADR 0007).
// Within ONE practice, flipping status to 'suspended' must FREEZE all tenant
// access via the current_practice_id() chokepoint, while my_practice_status()
// still returns exactly { name, status } (the single narrow exception). A tenant
// cannot un-freeze itself; reactivation is operator-only.
//
// Needs a live Supabase project with 0017 applied. Run: npm run test:integration
// (skips cleanly when VITE_SUPABASE_URL/KEY are absent).
//
// NOTE: setup flips status via the OWNER session, which works only because the
// practices UPDATE policy currently lets owner/admin write `status`. That is a
// known gap (lifecycle is meant to be operator-driven) — when status is locked to
// operator-only, this setup must switch to a service-role client.
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional — enables the reactivation leg
const skip = (!URL || !KEY) && "no Supabase env (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)";
const mk = (key = KEY) => createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

test("suspending a practice freezes all tenant access; my_practice_status stays a 2-field window", { skip }, async (t) => {
  const owner = mk();
  const stamp = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;

  // Owner + active practice, seeded with a location and an item.
  let r = await owner.auth.signUp({ email: `life+${stamp}@lifetest.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `owner signUp: ${r.error?.message}`);
  r = await owner.rpc("create_practice_for_new_user", { practice_name: `Life ${stamp}`, join_code: `LF${stamp.slice(-6)}` });
  assert.ok(!r.error, `create_practice: ${r.error?.message}`);
  const practiceId = r.data;
  // create_practice seeds 'Main Office'; add an item too.
  const item = (await owner.from("items").insert({ practice_id: practiceId, name: "Life Item" }).select().single()).data;
  assert.ok(item?.id, "seeded item");

  // --- Active baseline: full access, status helper says active ---
  assert.ok(((await owner.from("items").select("id")).data || []).length >= 1, "active: owner reads items");
  assert.ok(((await owner.from("locations").select("id")).data || []).length >= 1, "active: owner reads locations");
  let st = (await owner.rpc("my_practice_status")).data;
  let row = Array.isArray(st) ? st[0] : st;
  assert.equal(row?.status, "active", "active: my_practice_status reports active");

  // --- Suspend (owner write; see file note) ---
  const susp = await owner.from("practices").update({ status: "suspended", status_changed_at: new Date().toISOString() }).eq("id", practiceId).select();
  assert.equal((susp.data || []).length, 1, "owner suspended the practice");

  // --- Frozen: current_practice_id() is now NULL -> every tenant policy denies ---
  assert.equal(((await owner.from("items").select("id")).data || []).length, 0, "frozen: items are invisible");
  assert.equal(((await owner.from("locations").select("id")).data || []).length, 0, "frozen: locations are invisible");
  const prac = (await owner.from("practices").select("id, name").eq("id", practiceId).maybeSingle()).data;
  assert.equal(prac, null, "frozen: the practice row itself is unreadable");

  // --- The single exception: my_practice_status returns EXACTLY name + status ---
  st = (await owner.rpc("my_practice_status")).data;
  row = Array.isArray(st) ? st[0] : st;
  assert.ok(row, "frozen: my_practice_status still returns a row");
  assert.equal(row.status, "suspended", "frozen: status is suspended");
  assert.deepEqual(Object.keys(row).sort(), ["name", "status"], "frozen: exactly two fields, no leakage");
  assert.ok(typeof row.name === "string" && row.name.length > 0, "frozen: practice name is present for the screen");

  // --- Sticky: a tenant CANNOT un-freeze itself (reactivation is operator-only) ---
  const selfReactivate = await owner.from("practices").update({ status: "active" }).eq("id", practiceId).select();
  assert.equal((selfReactivate.data || []).length, 0, "tenant cannot self-reactivate a suspended practice");
  st = (await owner.rpc("my_practice_status")).data;
  row = Array.isArray(st) ? st[0] : st;
  assert.equal(row?.status, "suspended", "still suspended after the self-reactivate attempt");

  // --- Reactivation leg: operator-only. Runs only with a service-role key. ---
  if (SERVICE_KEY) {
    const admin = mk(SERVICE_KEY);
    const react = await admin.from("practices").update({ status: "active", status_changed_at: new Date().toISOString() }).eq("id", practiceId).select();
    assert.equal((react.data || []).length, 1, "operator reactivated the practice");
    assert.ok(((await owner.from("items").select("id")).data || []).length >= 1, "reactivated: owner reads items again");
  } else {
    t.diagnostic("reactivation leg skipped — set SUPABASE_SERVICE_ROLE_KEY to exercise the operator un-suspend (tenants correctly cannot).");
  }
});
