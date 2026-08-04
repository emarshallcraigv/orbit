-- ============================================================================
-- 0016 — Gate outright DELETE on managed entities to owner/admin (interim H1)
-- ============================================================================
-- Consistency-report finding H1: within-practice authorization was flat — any
-- staff member could delete locations, items, categories, cabinet labels, or
-- distributors. `FOUNDER.md` requires least-privilege; this tightens outright
-- DELETE on the top-level managed entities to owner/admin.
--
-- Scope, deliberately narrow:
-- * INSERT/UPDATE are UNCHANGED — adding and editing is normal staff work; only
--   outright deletion is restricted.
-- * Child/join tables (item_cabinets, shipment_locations, queue_locations) are
--   NOT gated: their deletes happen during ordinary editing (e.g. reassigning an
--   item's cabinet rewrites item_cabinets), so gating them would break staff
--   editing. Their tenant/parent scoping is untouched.
-- * checks/shipments/transfers/queue_entries have no outright-delete UI, so
--   there is nothing to gate there today.
--
-- This is the INTERIM fix on the existing 3-role model. The full
-- capabilities/permissions model stays deferred — ADR 0006, unchanged. Each
-- policy's tenant scope is preserved; the role check is ANDed onto it (for
-- location_cabinets, onto its existing parent-location subquery, not replacing
-- it).
-- ============================================================================

drop policy if exists "delete own practice rows" on locations;
create policy "delete own practice rows" on locations for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete own practice rows" on items;
create policy "delete own practice rows" on items for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete own practice rows" on categories;
create policy "delete own practice rows" on categories for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete own practice rows" on distributors;
create policy "delete own practice rows" on distributors for delete
  using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

drop policy if exists "delete via parent location" on location_cabinets;
create policy "delete via parent location" on location_cabinets for delete
  using (location_id in (select id from locations where practice_id = current_practice_id())
         and current_user_role() in ('owner', 'admin'));
