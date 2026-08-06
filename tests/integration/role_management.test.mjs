// Integration: owner/admin gating on Locations & Categories + member role
// management + the "never zero owners" rule (migration 0020, Batch 2).
//
// Proves a STAFF session genuinely can't create/edit these or escalate its own
// role, even bypassing the UI (direct API calls), and that the last-owner rule
// holds at the DB. Runs with anon sessions (no service key). Needs 0020 applied.
// Run: npm run test:integration
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const skip = (!URL || !KEY) && "no Supabase env (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)";
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const roleOf = (c, id) => c.from("profiles").select("role").eq("id", id).single().then((r) => r.data?.role);

test("staff can't create/edit locations+categories or escalate role; last-owner rule holds", { skip }, async () => {
  const owner = mk(), staff = mk();
  const stamp = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
  const joinCode = `RM${stamp.slice(-6)}`;

  // Owner + practice, seeded with a category to attempt edits against.
  let r = await owner.auth.signUp({ email: `ownerRM+${stamp}@rm.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `owner signup: ${r.error?.message}`);
  const ownerId = r.data.user.id;
  r = await owner.rpc("create_practice_for_new_user", { practice_name: `RM ${stamp}`, join_code: joinCode });
  assert.ok(!r.error, `create_practice: ${r.error?.message}`);
  const pid = r.data;
  const cat = (await owner.from("categories").insert({ practice_id: pid, name: "Cat A" }).select().single()).data;
  assert.ok(cat?.id, "owner created a category");

  // Staff joins the practice (role staff).
  r = await staff.auth.signUp({ email: `staffRM+${stamp}@rm.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `staff signup: ${r.error?.message}`);
  const staffId = r.data.user.id;
  r = await staff.rpc("join_practice_by_code", { code: joinCode });
  assert.ok(!r.error, `join: ${r.error?.message}`);

  // --- Staff is blocked from create/edit on locations & categories (RLS) ---
  assert.ok((await staff.from("locations").insert({ practice_id: pid, name: "Staff Loc" }).select()).error,
    "staff INSERT location must be rejected");
  assert.equal(((await staff.from("categories").update({ name: "Hacked" }).eq("id", cat.id).select()).data || []).length, 0,
    "staff UPDATE category affects 0 rows");

  // --- Staff can't escalate its own role via a direct profile write ---
  assert.ok((await staff.from("profiles").update({ role: "owner" }).eq("id", staffId).select()).error,
    "staff self-promote must be rejected (no column privilege on role)");
  assert.equal(await roleOf(staff, staffId), "staff", "staff role unchanged");

  // --- Staff can't drive set_member_role either ---
  assert.ok((await staff.rpc("set_member_role", { p_profile_id: ownerId, p_role: "staff" })).error,
    "staff cannot call set_member_role");

  // --- Staff CAN still edit its own display_name (an allowed column) ---
  const nameUpd = await staff.from("profiles").update({ display_name: "Staffer" }).eq("id", staffId).select();
  assert.ok(!nameUpd.error && (nameUpd.data || []).length === 1, "staff can still edit own display_name");

  // --- Owner CAN create a location and rename the category ---
  const ownLoc = await owner.from("locations").insert({ practice_id: pid, name: "Owner Loc" }).select();
  assert.ok(!ownLoc.error && (ownLoc.data || []).length === 1, `owner create location: ${ownLoc.error?.message}`);
  assert.equal(((await owner.from("categories").update({ name: "Cat B" }).eq("id", cat.id).select()).data || []).length, 1,
    "owner can rename a category");

  // --- Last-owner rule: the sole owner can't demote themselves ---
  const demoteSelf = await owner.rpc("set_member_role", { p_profile_id: ownerId, p_role: "staff" });
  assert.ok(demoteSelf.error && /at least one owner/i.test(demoteSelf.error.message),
    `sole owner demote must be blocked; got ${demoteSelf.error?.message}`);

  // --- Owner promotes staff to admin (positive path) ---
  assert.ok(!(await owner.rpc("set_member_role", { p_profile_id: staffId, p_role: "admin" })).error, "owner promotes staff->admin");
  assert.equal(await roleOf(owner, staffId), "admin", "member is now admin");

  // An admin is not an owner, so the practice still has one owner -> still blocked.
  assert.ok((await owner.rpc("set_member_role", { p_profile_id: ownerId, p_role: "staff" })).error,
    "still sole owner -> self-demote blocked");

  // --- With a second owner, the original can step down ---
  assert.ok(!(await owner.rpc("set_member_role", { p_profile_id: staffId, p_role: "owner" })).error, "promote member->owner");
  const demoteOk = await owner.rpc("set_member_role", { p_profile_id: ownerId, p_role: "staff" });
  assert.ok(!demoteOk.error, `with a 2nd owner, self-demote should succeed; got ${demoteOk.error?.message}`);
  assert.equal(await roleOf(owner, ownerId), "staff", "original owner is now staff");
});
