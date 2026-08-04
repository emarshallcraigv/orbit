# Product Roadmap

Phases framed entirely around **customer value** — what a practice can do that it
couldn't before. No implementation detail lives here.

> **This document does not replace [`ROADMAP.md`](../ROADMAP.md).** That file (repo
> root) is the granular, currently-maintained *engineering* sequence — the actual
> build order (V1 near-term items, etc.) with technical specifics. This file is the
> customer-value layer *above* it. When they appear to disagree, `ROADMAP.md` is the
> source of truth for what's being built next; this file is the "why it matters."

Roughly, the engineering versions map to these phases as: **V1 → Phase 1**, **V2 →
Phase 2**, **V3 → Phase 3**, **V4 → Phase 4**, and Phase 5 sits across the top.

---

## Phase 1 — Foundation: know what you have, everywhere *(in progress)*

**Customer value:** A practice can finally trust a single, live picture of its
supplies across every location — what's on hand, what's running low, and what
needs action today — instead of scattered spreadsheets and memory.

- One catalog of supplies, organized by consistent categories and per-location
  storage labels.
- Location-by-location check-ins that automatically flag what needs ordering.
- A dashboard that surfaces exactly what needs attention, ranked by urgency.
- Log an order and mark it received; stock updates itself, including moving
  supplies between locations.
- Suggestions to **rebalance between locations** instead of over-ordering.
- Multi-practice from day one, each with its own branding and team.

**Deliberately *not* here:** placing real orders, and real purchase pricing — see
Phases 2–3.

## Phase 2 — Cost & budget: see where the money goes

**Customer value:** A practice can see and control supply spend — cost per unit,
what was actually paid per order, and spending by category, distributor, and time
period — turning "we spend a lot on supplies" into specific, actionable numbers.

- Capture real order costs (price paid, shipping, tax) against real purchases.
- Reporting and budget tracking built on that data.
- Ordering still happens outside the app in this phase — this is about *tracking
  and understanding* cost, not placing orders.

## Phase 3 — Ordering: order without leaving the app

**Customer value:** The practice stops re-keying orders into distributor
websites — it orders directly from within Baybridge, and compares options.

- Direct ordering through distributor API integrations.
- The product data to make that useful: product images, distributor-specific
  SKUs (the same item has different SKUs at different distributors), and price
  comparison across distributors for the same item.

*Real ordering being pushed all the way to Phase 3 — not V1 or V2 — is a
deliberate scope decision (see [`MVP_REQUIREMENTS.md`](MVP_REQUIREMENTS.md)).*

## Phase 4 — Operations beyond supply

**Customer value:** Baybridge becomes the operational backbone for more than
supplies — additional practice workflows, defined by what real usage in Phases 1–3
shows is actually needed rather than guessed at now.

## Phase 5 — Intelligence (AI)

**Customer value:** The system gets ahead of the practice — predicting what will
run low and when, suggesting order quantities and timing, and turning the audit
trail and cost history into recommendations, not just records. This layer sits on
top of the structured, tenant-isolated data the earlier phases build; it is only
as good as that foundation, which is why the foundation comes first.

---

*Enabled by, but not itself a phase:* expansion beyond dental practices to other
industries — made possible by keeping business logic in Postgres rather than the
frontend, so a different industry's UI can be added without re-architecting the
core (see [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md)).
