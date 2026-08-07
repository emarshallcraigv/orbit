// Integration: practice lifecycle status dimension (0017 / ADR 0007, 0018).
// Within ONE practice, flipping status to 'suspended' must FREEZE all tenant
// access via the current_practice_id() chokepoint, while my_practice_status()
// still returns exactly { name, status } (the single narrow exception).
//
// Since 0018, `status` is OPERATOR-ONLY: a tenant owner/admin has no column
// privilege to write it, so status transitions here go through a service-role
// (operator) client. This test therefore needs SUPABASE_SERVICE_ROLE_KEY and
// skips cleanly without it. (The freeze itself was also verified live before the
// 0018 lockdown; 0018 changes only WHO may set status, not what a frozen status
// does.) The test also asserts that a plain owner is blocked from writing status.
//
// Run: SUPABASE_SERVICE_ROLE_KEY=... npm run test:integration
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL || !KEY
  ? "no Supabase env (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)"
  : !SERVICE_KEY
    ? "no SUPABASE_SERVICE_ROLE_KEY (lifecycle status is operator-only since 0018)"
    : false;
const mk = (key = KEY) => createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

test("suspending a practice freezes all tenant access; my_practice_status stays a 2-field window", { skip }, async () => {
  const owner = mk();
  const admin = mk(SERVICE_KEY); // operator path — bypasses column grants / RLS
  const stamp = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
  const setStatus = (id, status) =>
    admin.from("practices").update({ status, status_changed_at: new Date().toISOString() }).eq("id", id).select();

  // Owner + active practice, seeded with a location (create_practice) and an item.
  let r = await owner.auth.signUp({ email: `life+${stamp}@lifetest.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `owner signUp: ${r.error?.message}`);
  r = await owner.rpc("create_practice_for_new_user", { practice_name: `Life ${stamp}`, join_code: `LF${stamp.slice(-6)}` });
  assert.ok(!r.error, `create_practice: ${r.error?.message}`);
  const practiceId = r.data;
  const item = (await owner.from("items").insert({ practice_id: practiceId, name: "Life Item" }).select().single()).data;
  assert.ok(item?.id, "seeded item");

  // --- Active baseline: full access, status helper says active ---
  assert.ok(((await owner.from("items").select("id")).data || []).length >= 1, "active: owner reads items");
  assert.ok(((await owner.from("locations").select("id")).data || []).length >= 1, "active: owner reads locations");
  let row = (await owner.rpc("my_practice_status")).data?.[0];
  assert.equal(row?.status, "active", "active: my_practice_status reports active");

  // --- A tenant CANNOT write status (0018 column lockdown) ---
  const tenantWrite = await owner.from("practices").update({ status: "suspended" }).eq("id", practiceId).select();
  assert.equal((tenantWrite.data || []).length, 0, "owner cannot set status (operator-only)");
  row = (await owner.rpc("my_practice_status")).data?.[0];
  assert.equal(row?.status, "active", "still active — the tenant write did nothing");

  // --- Operator suspends ---
  assert.equal(((await setStatus(practiceId, "suspended")).data || []).length, 1, "operator suspended the practice");

  // --- Frozen: current_practice_id() is now NULL -> every tenant policy denies ---
  assert.equal(((await owner.from("items").select("id")).data || []).length, 0, "frozen: items are invisible");
  assert.equal(((await owner.from("locations").select("id")).data || []).length, 0, "frozen: locations are invisible");
  const prac = (await owner.from("practices").select("id, name").eq("id", practiceId).maybeSingle()).data;
  assert.equal(prac, null, "frozen: the practice row itself is unreadable");

  // --- The single exception: my_practice_status returns EXACTLY name + status ---
  row = (await owner.rpc("my_practice_status")).data?.[0];
  assert.ok(row, "frozen: my_practice_status still returns a row");
  assert.equal(row.status, "suspended", "frozen: status is suspended");
  assert.deepEqual(Object.keys(row).sort(), ["name", "status"], "frozen: exactly two fields, no leakage");
  assert.ok(typeof row.name === "string" && row.name.length > 0, "frozen: practice name present for the screen");

  // --- Operator reactivation restores access ---
  assert.equal(((await setStatus(practiceId, "active")).data || []).length, 1, "operator reactivated the practice");
  assert.ok(((await owner.from("items").select("id")).data || []).length >= 1, "reactivated: owner reads items again");

  // --- Removal path is 'offboarded' (a status transition), NOT a DELETE ---
  // Offboarding is how a practice leaves (ADR 0007): data retained, access frozen.
  assert.equal(((await setStatus(practiceId, "offboarded")).data || []).length, 1, "operator offboarded the practice");
  assert.equal(((await owner.from("items").select("id")).data || []).length, 0, "offboarded: all tenant access frozen");
  const offRow = (await owner.rpc("my_practice_status")).data?.[0];
  assert.equal(offRow?.status, "offboarded", "offboarded: my_practice_status reports offboarded");
});
