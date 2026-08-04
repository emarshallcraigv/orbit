# MVP Requirements

Defines what the first launchable version of Baybridge is — and, just as
importantly, what it deliberately is not. The scope discipline described here has
been practiced throughout the build, not invented for this document.

## Definition of the MVP

Baybridge's MVP is **Phase 1 (Foundation)**: a complete, trustworthy,
multi-tenant supply-inventory system that a practice can run its day on — knowing
what it has across locations, what's low, and what to do about it — **without**
placing orders or tracking real cost inside the app yet.

## In scope (MVP)

- Multi-tenant auth + practice onboarding (create a practice or join by code).
- Per-practice dynamic locations (1..N), with addresses and per-location cabinet
  labels.
- Supply catalog: items with categories, per-location cabinet assignment,
  tracking type (Good/Low or exact quantity), reorder threshold, reference cost.
- Location check-ins that flag what needs ordering; an ordering queue.
- Shipment logging + receiving (with per-location split and between-location
  transfers); a live inventory snapshot.
- Distributor directory.
- Cross-location rebalancing suggestions.
- CSV bulk item import (for onboarding an existing catalog).
- Per-practice branding (logo + colors); Baybridge default when uncustomized.
- Assignments, reminders, and a notification center (the last major V1 workstream).
- Audit trail (`activity_log`) captured on every meaningful action.

## Explicitly out of scope for MVP (deliberate)

- **Placing real orders.** V1 tracks *that* something needs ordering and *that* it
  was ordered — it does not submit the order. Direct ordering is pushed all the
  way to **Phase 3 (V3)** because it needs distributor API integrations and real
  product/SKU/pricing data to be useful.
- **Real purchase-cost tracking and spend reporting** — **Phase 2 (V2)**.
- **AI/prediction** — **Phase 5**.
- **Admin/platform console** — designed, not built (see
  [`ADMIN_PLATFORM.md`](ADMIN_PLATFORM.md)).
- **Billing** (Stripe) — future.

Pushing ordering and cost out of the MVP is the central scope call: it keeps the
first release small, trustworthy, and shippable, and avoids building ordering on
top of data that isn't yet structured for it.

## Launch criteria

1. All Phase-1 features above are built and verified.
2. **Tenant isolation proven**: a two-practice isolation test passes for every
   tenant-owned table and every RLS-touching function (see
   [`SECURITY.md`](SECURITY.md), [`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md)).
3. **Auth "Confirm email" turned ON** and an email provider (Resend) wired — the
   one hard blocker before real signups.
4. Staging/production split stood up, with the consolidated setup file smoke-run
   against a fresh project (see [`../STAGING.md`](../STAGING.md)).
5. A real practice can complete onboarding → catalog setup (incl. CSV import) →
   daily check-in → order/receive loop end-to-end.

## Success criteria (post-launch)

- A practice replaces its supply spreadsheet with Baybridge and stops maintaining
  the spreadsheet.
- Check-ins happen on the practice's own cadence (reminders fire when they lapse).
- Redundant orders drop because rebalancing surfaces internal stock first.
- Zero cross-tenant data incidents.

See [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md) for the value framing and
[`../ROADMAP.md`](../ROADMAP.md) for the live engineering sequence.
