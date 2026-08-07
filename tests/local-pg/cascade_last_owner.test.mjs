// Local-Postgres test for the enforce_last_owner trigger (migration 0020).
//
// This is NOT a Supabase-backed integration test — it runs against a real, local,
// ephemeral PostgreSQL so we can exercise trigger + FK-cascade ORDERING, which
// depends on Postgres internals that are easy to get subtly wrong. It mirrors the
// exact trigger from 0020 against a minimal practices/profiles schema.
//
// Run via ./run.sh (which provisions Postgres and sets PG* env). Connection comes
// from PGHOST/PGPORT/PGUSER/PGDATABASE.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const client = new pg.Client({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  user: process.env.PGUSER || "postgres",
  database: process.env.PGDATABASE || "postgres",
});

// Exact trigger logic from supabase/migrations/0020_role_management_and_permissions.sql,
// on a minimal schema that reproduces the real ON DELETE CASCADE from practices->profiles.
const SETUP = `
drop table if exists profiles; drop table if exists practices;
create table practices (id uuid primary key default gen_random_uuid());
create table profiles (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff')));
create or replace function enforce_last_owner()
returns trigger language plpgsql set search_path = public as $$
declare pid uuid; losing_owner boolean;
begin
  if TG_OP = 'DELETE' then pid := old.practice_id; losing_owner := old.role = 'owner';
  else pid := old.practice_id; losing_owner := old.role = 'owner' and new.role is distinct from 'owner'; end if;
  if not losing_owner then return coalesce(new, old); end if;
  if not exists (select 1 from practices where id = pid) then return coalesce(new, old); end if;
  if (select count(*) from profiles where practice_id = pid and role = 'owner' and id is distinct from old.id) = 0
  then raise exception 'A practice must keep at least one owner'; end if;
  return coalesce(new, old);
end; $$;
create trigger trg_enforce_last_owner before update or delete on profiles
  for each row execute function enforce_last_owner();
`;

const expectError = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

test.before(async () => { await client.connect(); await client.query(SETUP); });
test.after(async () => { await client.end(); });

test("cascade-deleting a single-owner practice is allowed (trigger must not raise)", async () => {
  const p = (await client.query(`insert into practices default values returning id`)).rows[0].id;
  await client.query(`insert into profiles (practice_id, role) values ($1,'owner')`, [p]);
  const err = await expectError(() => client.query(`delete from practices where id=$1`, [p]));
  assert.equal(err, null, `practice delete must cascade without the trigger raising (got: ${err})`);
  const remaining = (await client.query(`select count(*)::int n from profiles where practice_id=$1`, [p])).rows[0].n;
  assert.equal(remaining, 0, "the sole owner's profile is cascade-deleted");
});

test("demoting the sole owner while the practice exists is blocked", async () => {
  const p = (await client.query(`insert into practices default values returning id`)).rows[0].id;
  const oid = (await client.query(`insert into profiles (practice_id, role) values ($1,'owner') returning id`, [p])).rows[0].id;
  const err = await expectError(() => client.query(`update profiles set role='staff' where id=$1`, [oid]));
  assert.ok(err && /at least one owner/i.test(err), `demotion must be blocked (got: ${err})`);
  const role = (await client.query(`select role from profiles where id=$1`, [oid])).rows[0].role;
  assert.equal(role, "owner", "role unchanged after the blocked demotion");
});

test("with two owners, demoting one is allowed and cascade-delete removes both", async () => {
  const p = (await client.query(`insert into practices default values returning id`)).rows[0].id;
  const a1 = (await client.query(`insert into profiles (practice_id, role) values ($1,'owner') returning id`, [p])).rows[0].id;
  await client.query(`insert into profiles (practice_id, role) values ($1,'owner')`, [p]);
  assert.equal(await expectError(() => client.query(`update profiles set role='staff' where id=$1`, [a1])), null, "demoting one of two owners is allowed");
  assert.equal(await expectError(() => client.query(`delete from practices where id=$1`, [p])), null, "cascade delete of a multi-owner practice succeeds");
});
