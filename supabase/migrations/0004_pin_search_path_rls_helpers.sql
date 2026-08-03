-- ============================================================================
-- 0004 — Pin search_path on the RLS helper functions (defense in depth)
-- ============================================================================
-- Same rationale as 0003: these SECURITY DEFINER helpers reference `profiles`
-- unqualified and rely on whatever search_path the caller's role happens to
-- have. They're invoked from inside every RLS policy (via current_practice_id()
-- / current_user_role()), so a caller whose search_path doesn't include
-- `public` could cause them to resolve the wrong table — or none. Pinning
-- search_path (and schema-qualifying) makes their behavior independent of the
-- caller.
--
-- Bodies are otherwise identical to what is live. The role helper is named
-- current_user_role() in the live database (current_role is a reserved word in
-- Postgres); an earlier hotfix renamed it directly in the SQL editor, and
-- migrations 0001/0002 have now been corrected on disk to match.
-- ============================================================================

create or replace function current_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select practice_id from public.profiles where id = auth.uid()
$$;

create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;
