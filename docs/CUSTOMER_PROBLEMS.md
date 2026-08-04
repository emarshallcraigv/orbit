# Customer Problems

Real problems this product exists to solve, grounded in the actual history of the
build (starting as a single-practice tool for Mann Orthodontics, now the
multi-tenant Baybridge platform). This is not a blank template: the seed entries
below are problems that have **already been solved in the codebase**, documented
so the reasoning survives and the pattern is repeatable.

**Structure for every entry going forward:**
- **Problem** — the underlying real-world situation.
- **Current Workflow** — how practices handle it today (often a spreadsheet or memory).
- **Pain Points** — what specifically goes wrong.
- **Impact** — cost, risk, or waste.
- **Proposed Solution** — the product response (link the ADR / migration if built).
- **Success Metric** — how we know it worked.

---

## 1. Category names drift into inconsistent spellings (SOLVED)

- **Problem:** The same category is written differently over time — "PPE" vs
  "Personal Protective Equipment", "Instruments & Equipment" vs "Instruments and
  Equipment".
- **Current Workflow:** Mann's real historical spreadsheet used free-text
  category labels typed per row.
- **Pain Points:** Filtering, grouping, and reporting fracture — the "same"
  category splits into several, and nobody notices until the totals are wrong.
- **Impact:** Unreliable category-level views; wasted time reconciling; erodes
  trust in the data.
- **Proposed Solution:** A practice-scoped `categories` table with a fixed,
  managed list; items reference it by id (`items.category_id`, `ON DELETE SET
  NULL`), with case-insensitive uniqueness per practice. Free text is gone.
  (Migration `0008`.)
- **Success Metric:** A category can no longer exist in two spellings; every
  item's category resolves to one canonical row.

## 2. Cabinet/storage locations are free text and drift the same way (SOLVED)

- **Problem:** Where an item lives ("Cabinet 3", "Cab 3", "3", "Top shelf") was
  free text, and — worse — a cabinet number at one office is a physically
  different space than the same number at another office.
- **Current Workflow:** Free-text cabinet typed per item, per location.
- **Pain Points:** Same drift as categories, plus cross-location confusion; you
  can't offer a clean pick-list or trust that "Cabinet 3" means one thing.
- **Impact:** Staff waste time locating stock; check-ins are error-prone.
- **Proposed Solution:** A **per-location** managed `location_cabinets` list
  (not practice-wide), referenced by `item_cabinets.cabinet_id` (`ON DELETE SET
  NULL`); item assignment is a strict dropdown of that location's own labels, with
  a "copy list to another location" action for deliberate replication. Import
  matches existing labels only — never creates them. (Migration `0015`, ADR-style
  reasoning in the migration header.)
- **Success Metric:** Cabinet labels are chosen from a managed list; no new label
  is ever created implicitly (item form or CSV import); each location owns its own.

## 3. "We're low here, but there's excess of it at another office" (SOLVED in design, build pending)

- **Problem:** An item is low at one location while another location has more than
  it needs — the practice orders more instead of moving what it already owns.
- **Current Workflow:** Each location is checked in isolation; rebalancing depends
  on someone remembering another office's stock.
- **Pain Points:** Unnecessary orders, cash tied up in over-stock, imbalance
  persists.
- **Impact:** Real money spent on supplies the practice already has on hand
  elsewhere.
- **Proposed Solution:** Cross-location rebalancing suggestions — when a low-stock
  item can be pulled from another location's excess, surface that instead of an
  order. **Design agreed, not yet built.** (See [ADR
  `0004`](decisions/0004-cross-location-rebalancing.md); sequenced in
  [`ROADMAP.md`](../ROADMAP.md).)
- **Success Metric:** Low-stock events that have a viable internal source are
  flagged as "transfer, don't order," reducing redundant orders.

---

*Add new problems above this line as they're identified — always grounded in a
real practice situation, never a hypothetical.*
