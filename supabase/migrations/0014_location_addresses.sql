-- ============================================================================
-- 0014 — Per-location physical + billing addresses
-- ============================================================================
-- Each location can carry a physical/mailing address and a separate billing
-- address. These are LOCATION SETTINGS ONLY — edited from the Locations screen,
-- never read on the inventory/ordering path (Dashboard, Check-in, Shipments,
-- Inventory, Queue keep showing only the location name, as today).
--
-- One jsonb column per address, grouping the fields together instead of widening
-- `locations` by a dozen columns for data that never touches inventory/ordering
-- (same jsonb-for-grouped-config instinct as practices.settings). Shape, all
-- fields optional:
--   { "line1", "line2", "city", "state", "postal_code", "country" }
--
-- Unlike practices.settings (a config bag that's always present, hence
-- NOT NULL DEFAULT '{}'), these are NULLABLE because null is meaningful:
--   * physical_address IS NULL      -> no physical address on file
--   * billing_address  IS NULL      -> billing is the SAME as physical (the
--                                      default/common case; the "billing same as
--                                      physical" checkbox is just billing IS NULL)
--   * billing_address  IS NOT NULL  -> a distinct billing address
--
-- Additive and nullable, so this never blocks adding or renaming a location on
-- having an address filled in. Existing locations RLS (practice-scoped
-- select/insert/update/delete) already covers these columns — no new policy.
-- ============================================================================

alter table locations add column if not exists physical_address jsonb;
alter table locations add column if not exists billing_address jsonb;
