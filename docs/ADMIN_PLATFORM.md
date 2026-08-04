# Admin / Platform Console — Design

> **Status: design only. Not built.** This is the recommended shape for a
> platform-operator console (support, oversight, provisioning across all
> practices), documented so it's ready when it's prioritized. Nothing here exists
> in the codebase yet.

## Why a separate concern

The tenant app is built on the invariant that **a user only ever sees their own
practice** (RLS `practice_id = current_practice_id()`). A platform operator needs
the opposite: controlled visibility *across* practices for support and oversight.
The design goal is to add that **without weakening the tenant isolation that
already exists** — the operator surface layers on top, it does not loosen the base
policies.

## Recommended approach: a separate app + additive policies

1. **A separate frontend/app**, not a mode inside the tenant app. Keeps the
   blast radius contained: the tenant bundle never ships admin capability, and a
   bug in one can't expose the other.

2. **A `platform_admins` table** — the allow-list of operator accounts
   (`user_id → auth.users`, role, `created_at`). Membership here is what grants
   cross-tenant reach; it is entirely separate from `profiles.role` (which is
   *within* a practice).

3. **A `is_platform_admin()` `SECURITY DEFINER` helper** (mirrors
   `current_practice_id()`): returns true iff `auth.uid()` is in `platform_admins`.
   Tightly scoped, `search_path` pinned — same discipline as the existing helpers.

4. **Additive RLS policies, layered — never replacing the tenant policies.** For
   each table an operator may read, add a *separate* policy alongside the existing
   tenant policy:
   ```sql
   create policy "platform admin read" on <table>
     for select using (is_platform_admin());
   ```
   Because Postgres policies are **OR-combined**, this grants operators read access
   **in addition to** the tenant rule, and a normal tenant user is completely
   unaffected — their access is still exactly `practice_id = current_practice_id()`.
   Start **read-only**; add narrowly-scoped write policies only for specific,
   audited operator actions.

5. **Everything an operator does is audited** — reuse `activity_log` (or a
   dedicated platform-audit table) so cross-tenant access leaves a trail.

## What it would provide (scope for later)
- Practice directory + health (counts, activity, last-active).
- Support view into a specific practice (read-only) to reproduce issues.
- Provisioning/lifecycle: create, suspend, or offboard a practice (the practice
  hard-delete caveat in [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) must be resolved
  first — onboarding RPC should upsert the profile).
- Platform metrics (feeds Phase-2 thinking and PostHog).

## Non-goals
- No standing "god mode" in the tenant app.
- No weakening or bypassing of tenant RLS — additive policies only.
- No operator write access without an explicit, audited reason.

See [`SECURITY.md`](SECURITY.md) for the invoker/definer + RLS conventions this
would extend.
