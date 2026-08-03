-- ============================================================================
-- 0003 — Fix signup (auth) trigger + harden the onboarding functions
-- ============================================================================
-- Found while wiring the auth/onboarding frontend (README step 1). Signing up
-- through Supabase Auth failed with:
--
--     POST /auth/v1/signup  ->  500
--     { "error_code": "unexpected_failure",
--       "msg": "Database error saving new user" }
--
-- Root cause: the on_auth_user_created trigger runs handle_new_user() as the
-- `supabase_auth_admin` role, whose session search_path does NOT include
-- `public`. The function body referenced `profiles` unqualified, so it failed to
-- resolve the table and the trigger raised — which GoTrue surfaces as the
-- generic "Database error saving new user", aborting the whole signup.
--
-- (The onboarding RPCs create_practice_for_new_user / join_practice_by_code use
-- the same unqualified style but happened to work, because PostgREST pins
-- search_path=public for the roles it executes as. The trigger has no such
-- luxury — hence the asymmetry. We pin search_path on all of them here so the
-- behavior no longer depends on the caller's environment.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The actual signup blocker: schema-qualify + pin search_path.
--    Replacing the function body is enough — the on_auth_user_created trigger
--    already points at it, so it picks this up with no trigger changes.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

-- Make sure the role that inserts into auth.users can execute the trigger fn.
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 2. Harden the onboarding functions.
--    a) Pin search_path (same defensiveness as above).
--    b) Refuse to run without a logged-in caller. Without this guard, an
--       unauthenticated caller hitting create_practice_for_new_user creates an
--       orphan practice row (the "update profiles ... where id = auth.uid()"
--       silently no-ops when auth.uid() is null). Found during testing.
-- ---------------------------------------------------------------------------
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

  update profiles set practice_id = new_practice_id, role = 'owner' where id = auth.uid();

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

  update profiles set practice_id = target_practice_id, role = 'staff' where id = auth.uid();

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

  update profiles set practice_id = inv.practice_id, role = inv.role where id = auth.uid();
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;
