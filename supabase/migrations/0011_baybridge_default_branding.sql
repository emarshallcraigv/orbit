-- ============================================================================
-- 0011 — Baybridge is the default brand; practices customize from null
-- ============================================================================
-- practices.primary_color / accent_color were created (0001) with column
-- defaults of Mann's own colors (#15409E / #6FA030). That made Mann's palette
-- leak into every NEW tenant: an un-customized practice was seeded with Mann's
-- blue/green and rendered in it — wrong for a multi-tenant product.
--
-- The platform default now lives in ONE place: the app stylesheet's :root
-- (Baybridge navy #14263D / teal #4089A2). A practice's color columns should be
-- null until it customizes, so practiceBrandCss() injects no override and the
-- Baybridge default shows through. This mirrors how logo_url already works
-- (null logo_url -> Baybridge icon fallback).
--
-- Dropping the defaults only affects NEW inserts. EXISTING rows keep whatever
-- they already store, so Mann (and any other practice created before this)
-- keeps its current colors untouched — no data is rewritten here. Mann's LOGO,
-- however, relies on a null logo_url + the app fallback, which is now Baybridge;
-- preserving Mann's own logo is a one-time data fix applied separately against
-- the live row (see the handoff notes / branding preservation SQL), not a
-- schema change, so it is intentionally not in this migration.
-- ============================================================================

alter table practices alter column primary_color drop default;
alter table practices alter column accent_color drop default;
