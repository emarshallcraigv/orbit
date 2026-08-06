-- ============================================================================
-- 0019 — Reject joining a suspended/offboarded practice up front (UX)
-- ============================================================================
-- Follow-up to the lifecycle model (0017/ADR 0007). Today, join_practice_by_code
-- and accept_invitation attach the user first; only afterward does the freeze
-- (current_practice_id() -> NULL for a frozen practice) send them to the "practice
-- suspended" screen. Not a security gap — they get no access either way — but a
-- confusing one: the join "succeeds," then immediately dead-ends.
--
-- This adds an explicit status check to both onboarding RPCs: if the target
-- practice isn't in ('trial','active'), raise a clear message and don't attach.
-- Both are SECURITY DEFINER, so they read practices.status directly (the freeze
-- doesn't hide it from them). Everything else — the auth guard, the profile
-- upsert, the invite bookkeeping, the seeded owner path — is unchanged from 0017.
-- ============================================================================

create or replace function join_practice_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_practice_id uuid;
  target_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id, status into target_practice_id, target_status
    from practices where join_code = upper(trim(code));

  if target_practice_id is null then
    raise exception 'No practice found for that join code';
  end if;
  if target_status not in ('trial', 'active') then
    raise exception 'This practice isn''t accepting members right now.';
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
  target_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv from invitations
    where token = invite_token and status = 'Pending' and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  select status into target_status from practices where id = inv.practice_id;
  if target_status not in ('trial', 'active') then
    raise exception 'This practice isn''t accepting members right now.';
  end if;

  insert into profiles (id, practice_id, role, email)
    values (auth.uid(), inv.practice_id, inv.role, (select email from auth.users where id = auth.uid()))
    on conflict (id) do update set practice_id = excluded.practice_id, role = excluded.role;
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;
