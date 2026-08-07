// Integration: user_locations tenant/role isolation (migration 0021, ADR 0008).
// The table is inert (no UI), but its RLS must hold: reads practice-scoped via the
// parent location, writes owner/admin-only, and inserts confined to same-practice
// members + locations. Anon sessions; needs 0021 applied. Run: npm run test:integration
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const skip = (!URL || !KEY) && "no Supabase env (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)";
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function practice(tag, stamp) {
  const c = mk();
  const r = await c.auth.signUp({ email: `${tag}+${stamp}@ul.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `${tag} signup: ${r.error?.message}`);
  const uid = r.data.user.id;
  const code = `UL${tag[0].toUpperCase()}${stamp.slice(-5)}`;
  const pid = (await c.rpc("create_practice_for_new_user", { practice_name: `UL ${tag} ${stamp}`, join_code: code })).data;
  const loc = (await c.from("locations").select("id").eq("practice_id", pid).limit(1).single()).data; // Main Office (seeded)
  return { c, uid, pid, code, locId: loc.id };
}

test("user_locations: tenant + role + same-practice boundaries hold", { skip }, async () => {
  const stamp = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
  const A = await practice("alpha", stamp);
  const B = await practice("beta", stamp + "b");

  // A staff member (for the role-gate check).
  const staff = mk();
  await staff.auth.signUp({ email: `alphastaff+${stamp}@ul.dev`, password: "test-pw-12345!" });
  const staffUid = (await staff.auth.getUser()).data.user.id;
  await staff.rpc("join_practice_by_code", { code: A.code });

  // A owner assigns itself to its own location -> allowed.
  const ins = await A.c.from("user_locations").insert({ profile_id: A.uid, location_id: A.locId }).select();
  assert.ok(!ins.error && (ins.data || []).length === 1, `A owner insert should succeed: ${ins.error?.message}`);

  // B cannot SEE A's row.
  assert.equal(((await B.c.from("user_locations").select("profile_id").eq("location_id", A.locId)).data || []).length, 0,
    "B cannot read A's user_locations row");

  // B cannot INSERT against A's location (cross-tenant location -> with-check fails).
  assert.ok((await B.c.from("user_locations").insert({ profile_id: B.uid, location_id: A.locId }).select()).error,
    "B cannot insert into A's location");

  // B cannot DELETE A's row (scoped out -> 0 rows).
  assert.equal(((await B.c.from("user_locations").delete().eq("location_id", A.locId).select()).data || []).length, 0,
    "B's delete of A's row affects 0 rows");
  assert.equal(((await A.c.from("user_locations").select("profile_id").eq("location_id", A.locId)).data || []).length, 1,
    "A's row survives B's delete attempt");

  // A staff (not owner/admin) cannot INSERT -> role gate.
  assert.ok((await staff.from("user_locations").insert({ profile_id: staffUid, location_id: A.locId }).select()).error,
    "A staff cannot insert (owner/admin only)");

  // A owner cannot link a FOREIGN profile (B's owner) to its own location.
  assert.ok((await A.c.from("user_locations").insert({ profile_id: B.uid, location_id: A.locId }).select()).error,
    "A owner cannot assign a member from another practice");

  // A owner can DELETE its own row.
  assert.equal(((await A.c.from("user_locations").delete().eq("location_id", A.locId).select()).data || []).length, 1,
    "A owner can delete its own row");
});
