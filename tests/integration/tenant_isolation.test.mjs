// Integration: two-practice tenant isolation — the core security guarantee.
// Two separate practices (two owners). Neither can read, update, or delete the
// other's rows; each sees exactly its own. This is the canonical isolation test.
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

// Sign up a fresh owner and create their practice; return the client + ids.
async function newPractice(tag, stamp) {
  const c = mk();
  let r = await c.auth.signUp({ email: `${tag}+${stamp}@isotest.dev`, password: "test-pw-12345!" });
  assert.ok(!r.error, `${tag} signUp: ${r.error?.message}`);
  r = await c.rpc("create_practice_for_new_user", { practice_name: `Iso ${tag} ${stamp}`, join_code: `IS${tag[0].toUpperCase()}${stamp.slice(-5)}` });
  assert.ok(!r.error, `${tag} create_practice: ${r.error?.message}`);
  const practiceId = r.data;
  const loc = (await c.from("locations").insert({ practice_id: practiceId, name: `${tag} Location` }).select().single()).data;
  const item = (await c.from("items").insert({ practice_id: practiceId, name: `${tag} Secret Item` }).select().single()).data;
  assert.ok(loc?.id && item?.id, `${tag} failed to seed rows`);
  return { c, practiceId, loc, item };
}

test("neither practice can read/update/delete the other's rows", { skip }, async () => {
  const stamp = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
  const A = await newPractice("alpha", stamp);
  const B = await newPractice("beta", stamp + "b");

  // Each sees exactly its own item, not the other's.
  const aSees = (await A.c.from("items").select("id,name")).data || [];
  assert.ok(aSees.some((i) => i.id === A.item.id), "A sees its own item");
  assert.ok(!aSees.some((i) => i.id === B.item.id), "A must NOT see B's item");

  const bSees = (await B.c.from("items").select("id,name")).data || [];
  assert.ok(bSees.some((i) => i.id === B.item.id), "B sees its own item");
  assert.ok(!bSees.some((i) => i.id === A.item.id), "B must NOT see A's item");

  // B cannot target A's rows by id — SELECT returns nothing.
  assert.equal(((await B.c.from("items").select("id").eq("id", A.item.id)).data || []).length, 0, "B cannot read A's item by id");
  assert.equal(((await B.c.from("locations").select("id").eq("id", A.loc.id)).data || []).length, 0, "B cannot read A's location by id");

  // B cannot UPDATE A's row (0 rows affected) and A's value is unchanged.
  const upd = await B.c.from("items").update({ name: "HIJACKED" }).eq("id", A.item.id).select();
  assert.equal((upd.data || []).length, 0, "B's UPDATE of A's item affects 0 rows");
  const still = (await A.c.from("items").select("name").eq("id", A.item.id).single()).data;
  assert.equal(still.name, "alpha Secret Item", "A's item name is untouched");

  // B cannot DELETE A's row (0 rows affected) and it still exists.
  const del = await B.c.from("items").delete().eq("id", A.item.id).select();
  assert.equal((del.data || []).length, 0, "B's DELETE of A's item affects 0 rows");
  assert.equal(((await A.c.from("items").select("id").eq("id", A.item.id)).data || []).length, 1, "A's item survives B's delete");
});
