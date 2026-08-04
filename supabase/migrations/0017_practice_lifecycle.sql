-- ============================================================================
-- 0017 — Practice lifecycle status model (ADR 0007)
-- ============================================================================
-- Introduces a first-class practice lifecycle so suspension and offboarding are
-- real, RLS-enforced states, and so offboarding — not hard-delete — becomes the
-- normal way a practice leaves (resolving finding M3).
--
-- Enforcement is deliberately a SINGLE chokepoint: current_practice_id() returns
-- the caller's practice only when status in ('trial','active'), NULL otherwise.
-- Every tenant policy already resolves through that helper, so a frozen practice
-- closes all reads and writes at once — no per-table policy edits.
--
-- STATED DECISION (ADR 0007): new practices default to 'active', not 'trial'.
-- There are no trial mechanics yet (no trial_ends_at, no billing, no trial->paid
-- transition), so the two are functionally identical today; defaulting to 'active'
-- avoids parking every practice in a 'trial' state with no exit path pre-Stripe.
-- When Stripe lands (Phase 2), the default can flip to 'trial' with a real
-- trial_ends_at. This is a decision on the record, not an accident.
-- ============================================================================

-- 1. Columns. ADD COLUMN ... DEFAULT backfills every existing practice to
--    'active' / now(); the check constrains the value set.
alter table practices
  add column if not exists status text not null default 'active'
    check (status in ('trial', 'active', 'suspended', 'offboarded')),
  add column if not exists status_changed_at timestamptz not null default now();

-- 2. The freeze: gate current_practice_id() on status. DEFINER + reads practices
--    directly, so no recursion through the practices SELECT policy. A suspended or
--    offboarded practice yields NULL here, and every tenant policy denies.
create or replace function current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.practices p
  join public.profiles pr on pr.practice_id = p.id
  where pr.id = auth.uid()
    and p.status in ('trial', 'active')
$$;

-- 3. A member must still read their OWN profile even when frozen — otherwise the
--    app can't tell "suspended" from "never onboarded" and would misroute them to
--    onboarding. The profiles SELECT policy was practice-scoped only; add a
--    self-read. For an ACTIVE practice this is a superset that changes nothing
--    (self is already in the practice match); for a FROZEN one the member now sees
--    exactly their own profile row and no other.
drop policy if exists "select profiles in own practice" on profiles;
create policy "select profiles in own practice" on profiles
  for select using (id = auth.uid() or practice_id = current_practice_id());

-- 4. THE SINGLE FREEZE EXCEPTION — name + status only.
--    A frozen practice's members need just enough to render a "practice suspended,
--    contact support" screen. This SECURITY DEFINER function is the one and only
--    crack in the freeze:
--      * COLUMN scope is the return signature — exactly (name, status), nothing
--        else. (RLS is row-level, so a table policy could not restrict columns;
--        the function can, and does.)
--      * ROW scope is hard-wired to the caller's own practice via
--        pr.id = auth.uid() — it cannot be aimed at another tenant.
--    Same DEFINER identity-helper convention as current_practice_id/current_user_role.
create or replace function my_practice_status()
returns table (name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.status
  from public.practices p
  join public.profiles pr on pr.practice_id = p.id
  where pr.id = auth.uid()
$$;
revoke all on function my_practice_status() from public;
grant execute on function my_practice_status() to authenticated;

-- 5. M3 fix — onboarding upserts the profile instead of assuming it exists.
--    The RPCs did `update profiles ... where id = auth.uid()`, which silently
--    no-ops if the profile row is missing (e.g. a prior hard-delete cascaded it
--    away). Upsert makes re-onboarding robust and closes M3 as defensive depth on
--    top of "offboarding replaces hard-delete."
create or replace function create_practice_for_new_user(practice_name text, join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_practice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into practices (name, join_code) values (practice_name, join_code)
    returning id into new_practice_id;

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), new_practice_id, 'owner', (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;

  -- Seed the default location (preserved from 0005 — must not regress).
  insert into locations (practice_id, name, sort_order)
    values (new_practice_id, 'Main Office', 0);

  return new_practice_id;
end;
$$;

create or replace function join_practice_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_practice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_practice_id from practices where join_code = upper(trim(code));

  if target_practice_id is null then
    raise exception 'No practice found for that join code';
  end if;

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), target_practice_id, 'staff', (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;

  return target_practice_id;
end;
$$;

create or replace function accept_invitation(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv from invitations
    where token = invite_token and status = 'Pending' and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), inv.practice_id, inv.role, (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;
