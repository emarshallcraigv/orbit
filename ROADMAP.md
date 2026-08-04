# Roadmap

This product ships in versions, each a coherent, usable milestone on its own — not a
single long build-up to a finished product.

## Version 1 (current, in progress)

Supply inventory management as a complete, working system: item catalog with
categories, dynamic per-practice locations, check-ins, the ordering queue (flagging
what's needed, tracking status through to ordered), shipment logging and receiving,
transfers between locations, cross-location rebalancing suggestions (flagging when a
low-stock item can be pulled from another location's excess instead of ordering more),
distributor directory, multi-tenant auth and practice onboarding, and a dashboard that
surfaces what needs attention. V1 tracks that something needs to be ordered and that it
was ordered — it does not place the order itself, and does not yet capture real purchase
pricing.

**Near-term build order within V1** (current sequencing, not yet all built):
queue (3d, done) → check-ins (3e, done) → visual design refresh + dashboard-as-hitlist
(done) → CSV bulk item import (done) → Branding settings screen (done — logo upload +
color pickers + logo-based color auto-suggest; brief in `docs/decisions/0005`) →
cross-location rebalancing suggestions (design brief in `docs/decisions/0004`).

## Version 2

Real cost tracking and budgeting: price per unit, actual order costs (price paid,
shipping, tax) captured against real purchases, and reporting built on that data
(spend by category / distributor / time period, budget tracking). Ordering itself
still happens outside the app in V2 — this version is about tracking and reporting on
cost, not placing orders.

## Version 3

Direct ordering through the app, via an open API integration with distributors. This
is a significantly bigger scope than V1/V2 and needs real product data to be useful:
product images, distributor-specific item numbers/SKUs (the same item may have a
different SKU at each distributor), and price comparison across distributors for the
same item. Likely needs a proper per-distributor pricing/catalog structure (an item
can have multiple distributor listings, each with its own SKU / price / image) — not
something to design or build now, just flagged here so it's not a surprise when V3
planning starts.

## Version 4 and beyond

Broader operational features beyond supply chain management. Scope stays open — to
be shaped by what real V1–V3 usage shows is actually needed, not guessed now — but
`docs/PRODUCT_VISION.md` gives it more concrete direction than "open" alone, folded
in here so it isn't lost. Two distinct thrusts sit under this heading:

**Operational intelligence** (PRODUCT_VISION "Version 4") — extend the platform from
supplies into the practice's wider operations:
- Equipment management and maintenance tracking
- Task management
- Supply forecasting and inventory optimization
- Location performance, practice benchmarks, and operational reporting

**AI operations assistant** (PRODUCT_VISION "Version 5") — an intelligence layer on
top of the structured, tenant-isolated data the earlier versions build. It assists,
it never removes user control:
- Predict inventory shortages; recommend transfers; forecast purchasing and budgets
- Vendor recommendations and operational insights
- Workflow automation, natural-language search, and document/invoice processing

Both are deliberately later-phase: they depend on the foundation (structured data,
audit trail, cost history) being in place first. See
[`docs/PRODUCT_ROADMAP.md`](docs/PRODUCT_ROADMAP.md) for the customer-value framing
(these are Phases 4–5 there) and [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md)
for the full module list, including the mobile strategy.

## Enabled by, but not itself a version

Expansion beyond dental practices to other industries, whenever that happens —
enabled by keeping business logic in Postgres (RLS policies, security-definer
functions) rather than the frontend, so a different industry's UI can be added
without re-architecting what exists underneath.
