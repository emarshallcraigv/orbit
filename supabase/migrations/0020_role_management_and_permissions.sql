-- ============================================================================
-- 0020 — Extend owner/admin gating + member role management (Batch 2)
-- ============================================================================
-- Three related things, all enforced at the DATABASE layer:
--
--  (A) Locations & Categories: gate INSERT and UPDATE to owner/admin (0016 only
--      gated DELETE). Adding/renaming a location or category is now admin work.
--
--  (B) Member role management:
--      * Close a self-escalation hole: today the "update own profile" policy
--        (id = auth.uid()) has no column restriction, so a staff user could set
--        their OWN role to 'owner' via a direct API call. We revoke column-level
--        UPDATE on role/practice_id from `authenticated` (same shape as the 0018
--        status lockdown) and re-grant only the self-editable columns. Role and
--        tenancy are now writable ONLY through SECURITY DEFINER functions.
--      * set_member_role(): the one tenant path to change a role — caller must be
--        owner/admin in the same practice as the target.
--
--  (C) "A practice can never have zero owners" — enforced by a trigger, not the
--      UI. A CHECK can't aggregate across rows; a unique/exclusion constraint
--      can't express ">= 1 owner"; RPC-only logic misses non-RPC paths. A trigger
--      catches EVERY write path (RPC, service_role, any future code). It skips
--      enforcement when the parent practice no longer exists, so a practice
--      hard-delete / offboard cleanup cascade is never blocked.
-- ============================================================================

-- (A) Locations & Categories: owner/admin for INSERT + UPDATE ------------------
drop policy if exists "insert own practice rows" on locations;
create policy "insert own practice rows" on locations for insert
  with check (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));
drop policy if exists "update own practice rows" on locations;
create policy "update own practice rows" on locations for update
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "insert own practice rows" on categories;
create policy "insert own practice rows" on categories for insert
  with check (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));
drop policy if exists "update own practice rows" on categories;
create policy "update own practice rows" on categories for update
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

-- (B) Lock role/practice_id to SECURITY DEFINER writers only -------------------
-- Table-wide UPDATE implies every column, so a bare column REVOKE is a no-op:
-- drop it and re-grant UPDATE only on the columns a member may self-edit.
revoke update on profiles from authenticated;
grant update (display_name, email) on profiles to authenticated;

create or replace function set_member_role(p_profile_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_practice uuid;
  caller_role text;
  target_practice uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('owner', 'admin', 'staff') then
    raise exception 'Invalid role';
  end if;

  select practice_id, role into caller_practice, caller_role from profiles where id = auth.uid();
  -- Fail closed on NULL: `null not in (...)` is NULL (not TRUE), so a NULL role
  -- would slip past a bare NOT IN. This is the one function that can grant owner.
  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can change roles';
  end if;

  select practice_id into target_practice from profiles where id = p_profile_id;
  if target_practice is null or target_practice is distinct from caller_practice then
    raise exception 'That member is not in your practice';
  end if;

  -- The last-owner invariant is enforced by the trigger below, so demoting the
  -- final owner here raises there.
  update profiles set role = p_role where id = p_profile_id;
end;
$$;
revoke all on function set_member_role(uuid, text) from public;
grant execute on function set_member_role(uuid, text) to authenticated;

-- (C) Never-zero-owners invariant (trigger) -----------------------------------
create or replace function enforce_last_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pid uuid;
  losing_owner boolean;
begin
  if TG_OP = 'DELETE' then
    pid := old.practice_id;
    losing_owner := old.role = 'owner';
  else -- UPDATE
    pid := old.practice_id;
    losing_owner := old.role = 'owner' and new.role is distinct from 'owner';
  end if;

  if not losing_owner then
    return coalesce(new, old);
  end if;

  -- Parent practice already gone (cascade from a practice delete/offboard cleanup):
  -- nothing to protect, don't block the cascade.
  if not exists (select 1 from practices where id = pid) then
    return coalesce(new, old);
  end if;

  -- Any other owner left in the practice?
  if (select count(*) from profiles
        where practice_id = pid and role = 'owner' and id is distinct from old.id) = 0 then
    raise exception 'A practice must keep at least one owner';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_enforce_last_owner on profiles;
create trigger trg_enforce_last_owner
  before update or delete on profiles
  for each row execute function enforce_last_owner();
