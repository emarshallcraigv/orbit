// Integration: role-dimension delete gating (H1 / migration 0016).
// Within ONE practice, a STAFF session's DELETE on each top-level managed entity
// must affect 0 rows (RLS USING fails silently), while the OWNER session's DELETE
// affects 1. Uses .delete().select() so the returned rows ARE the proof.
//
// Needs a live Supabase project. Run: npm run test:integration
// (loads .env.local; skips cleanly when VITE_SUPABASE_URL/KEY are absent.)
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const skip = (!URL || !KEY) && "no Supabase env (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)";
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

test("staff cannot DELETE managed entities; owner can (same practice)", { skip }, async () => {
  const owner = mk(), staff = mk();
  const stamp = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
  const joinCode = `RT${stamp.slice(-6)}`;

  // Owner: sign up + create practice (role owner).
  let r = await owner.auth.signUp({ email: `owner+${stamp}@roletest.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `owner signUp: ${r.error?.message}`);
  r = await owner.rpc("create_practice_for_new_user", { practice_name: `RoleTest ${stamp}`, join_code: joinCode });
  assert.ok(!r.error, `create_practice: ${r.error?.message}`);
  const practiceId = r.data;

  // Owner seeds one row of each managed entity.
  const loc = (await owner.from("locations").insert({ practice_id: practiceId, name: "RT Location" }).select().single()).data;
  const item = (await owner.from("items").insert({ practice_id: practiceId, name: "RT Item" }).select().single()).data;
  const cat = (await owner.from("categories").insert({ practice_id: practiceId, name: "RT Category" }).select().single()).data;
  const dist = (await owner.from("distributors").insert({ practice_id: practiceId, name: "RT Distributor" }).select().single()).data;
  const cab = (await owner.from("location_cabinets").insert({ location_id: loc.id, label: "RT Cabinet" }).select().single()).data;
  for (const [n, v] of [["location", loc], ["item", item], ["category", cat], ["distributor", dist], ["cabinet", cab]])
    assert.ok(v?.id, `owner failed to seed ${n}`);

  // Staff: sign up + join the SAME practice (join_practice_by_code sets role staff).
  r = await staff.auth.signUp({ email: `staff+${stamp}@roletest.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `staff signUp: ${r.error?.message}`);
  const staffUid = r.data.user.id;
  r = await staff.rpc("join_practice_by_code", { code: joinCode });
  assert.ok(!r.error, `join_practice: ${r.error?.message}`);
  // Scope to the staff's OWN profile row (profiles SELECT is practice-scoped: an
  // unfiltered .single() would see owner+staff and error — that's not a leak).
  const prof = (await staff.from("profiles").select("practice_id, role").eq("id", staffUid).single()).data;
  assert.equal(prof?.role, "staff", "joined user is role staff");
  assert.equal(prof?.practice_id, practiceId, "staff is in the same practice as owner");

  // child-first so the owner's later deletes don't cascade a target out from under us
  const targets = [
    ["location_cabinets", cab.id], ["items", item.id], ["categories", cat.id],
    ["distributors", dist.id], ["locations", loc.id],
  ];

  // Staff DELETE attempts: every one affects 0 rows.
  for (const [table, id] of targets) {
    const { data, error } = await staff.from(table).delete().eq("id", id).select();
    assert.ok(!error, `staff DELETE ${table} unexpected error: ${error?.message}`);
    assert.equal(data?.length ?? 0, 0, `staff DELETE ${table} should affect 0 rows`);
  }
  // Rows survived the staff attempts (owner authoritative read).
  for (const [table, id] of targets) {
    const { data } = await owner.from(table).select("id").eq("id", id);
    assert.equal(data?.length ?? 0, 1, `${table} row must survive staff's attempt`);
  }
  // Owner DELETE: every one affects 1 row.
  for (const [table, id] of targets) {
    const { data, error } = await owner.from(table).delete().eq("id", id).select();
    assert.ok(!error, `owner DELETE ${table} error: ${error?.message}`);
    assert.equal(data?.length ?? 0, 1, `owner DELETE ${table} should affect 1 row`);
  }
});
