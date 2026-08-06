-- ============================================================================
-- 0018 — Lifecycle status is operator-only (column-level UPDATE lockdown)
-- ============================================================================
-- Follows 0017/ADR 0007. The practices UPDATE policy lets owner/admin update the
-- row, which (with a table-wide UPDATE grant) includes the new `status` /
-- `status_changed_at` columns — i.e. a tenant could suspend/offboard/reactivate
-- their own practice. The lifecycle is meant to be OPERATOR-driven, so tenants
-- must not write those columns at all.
--
-- Postgres note: a column-level REVOKE is a no-op while the role holds a
-- table-level UPDATE (that implies every column). So we drop the table-wide grant
-- and re-grant UPDATE on exactly the columns a tenant may edit — everything except
-- status, status_changed_at (operator-only) and id, created_at (immutable).
--
-- Enforcement is orthogonal to RLS: an owner still needs the row policy to pass,
-- but now also needs column privilege on each column written; they have none on
-- status. service_role (the operator path) bypasses these grants, so operator
-- suspend/offboard/reactivate is unaffected. Additive and low-risk: the app only
-- ever updates logo_path/timezone/primary_color/accent_color, all still granted.
-- ============================================================================

revoke update on practices from authenticated;

grant update (name, join_code, logo_url, primary_color, accent_color, settings, timezone, logo_path)
  on practices to authenticated;
