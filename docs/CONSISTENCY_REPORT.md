# Repository Consistency Report

The current implementation reviewed against the **complete documentation set** —
including the real [`FOUNDER.md`](FOUNDER.md) and [`PRODUCT_VISION.md`](PRODUCT_VISION.md).

**Relationship to [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md):** that document answers
*"what's missing?"* This one answers a different question — **"what's built that
quietly contradicts a stated principle?"** — a screen open to all staff that a
document says should be restricted, a shortcut that works but violates a rule in
`FOUNDER.md`/`PRODUCT_VISION.md`, dead code that contradicts the philosophy. Where
the two overlap, this references the gap analysis rather than repeating it; where
this surfaces something genuinely new, it's marked **NEW**.

Severity is about contradiction-with-the-docs, not raw effort. Each item lists
**Description / Why it matters / Effort (S·M·L) / Recommended timing.**

---

## Critical — none

The **highest-stakes documented principle holds.** `FOUNDER.md` ("Every practice
has completely isolated data", "Customer data is never shared across tenants",
"Never bypass security for convenience") and `SECURITY.md` are matched by the
implementation: RLS on every tenant table, the `SECURITY INVOKER`/`DEFINER` split
used correctly, Storage locked to a private per-practice bucket, secrets kept out
of the client — and all of it isolation-tested repeatedly. No built thing
contradicts tenant isolation. This section is intentionally empty, and that's a
real result, not an oversight.

---

## High

### H1 — Within-practice authorization is effectively flat; destructive actions are open to every staff member — 🟡 INTERIM FIX APPLIED
> Interim mitigation shipped (migration `0016`): outright `DELETE` on the top-level
> managed entities (locations, items, categories, distributors, cabinet labels) is
> now gated to `owner`/`admin` at the **RLS layer**, ANDed onto each policy's tenant
> scope, with the UI Delete control hidden from staff to match. `INSERT`/`UPDATE`
> stay open (normal staff work); child/join tables stay ungated (their deletes are
> ordinary editing). Verified by a **role-dimension isolation test** (two real
> sessions in one practice: staff DELETE blocked on all five entities, owner DELETE
> succeeds). This closes the sharpest edge — "a staff user can empty the catalog."
> **Still open, by design:** the full capabilities/permissions model
> (read-only, clinical-staff, etc.) remains deferred — ADR
> [`0006`](decisions/0006-role-model-deferred.md); the description below stands as
> the record of the original finding.
- **Description:** Of all RLS policies, only **three** are role-gated (practices
  UPDATE, invitations, and Storage-logo writes — all `owner`/`admin`). Everything
  else — creating, editing, and **deleting** items, locations, categories, cabinet
  labels, distributors, plus logging shipments/transfers/checks — is
  practice-scoped only, with **no role check**. In the UI, only the Branding screen
  is role-gated; every other management screen is open to all roles. A `staff` user
  can delete a location or empty the catalog.
- **Why it matters:** `FOUNDER.md` lists **"Authorization"** and **"Least privilege
  access"** under *"Security is not optional"*, and says *"Never bypass security for
  convenience."* `PRODUCT_VISION.md`'s role list includes **"Read Only"** and
  **"Clinical Staff"** — neither is honorable today; there is no way to grant
  restricted or read-only access. This is the clearest case of the build quietly
  under-delivering a stated security principle. (It is **not** a cross-tenant leak —
  isolation holds — it's a *within-practice* least-privilege gap.)
- **Reconcile:** `GAP_ANALYSIS.md` lists "UI role-gating — Partial"; ADR
  [`0006`](decisions/0006-role-model-deferred.md) deliberately defers the role
  *model*. This report sharpens it: the gap is **at the data layer**, not just the
  UI (RLS itself isn't role-gated for management actions), and the concrete
  contradiction — destructive actions ungated for all staff, "Read Only"
  impossible — stands **independent of** the larger model decision.
- **Effort:** **L** for the full capabilities/permissions model (per 0006).
  **S–M** for an interim mitigation: gate destructive/management actions to
  owner/admin at both RLS and UI, honoring least-privilege without prejudging the
  model.
- **Timing:** Full model stays deferred (0006). The **interim destructive-action
  gating is worth doing before onboarding multi-user practices** — a several-staff
  practice shouldn't have every user able to delete the catalog. Sequence it with
  the role decision, not after it.

### H2 — A practice's timezone is stored but never settable; every practice is silently locked to America/New_York — ✅ RESOLVED
> Resolved: a time-zone selector on the owner/admin **Settings** screen writes `practices.timezone` (verified: default Eastern → saved Central → persisted across reload).
- **Description:** The app is carefully timezone-aware (`practice_today`,
  `checked_at` rendered in the practice's tz, `fmtDate` parsed as local). But
  `practices.timezone` defaults to `'America/New_York'` and there is **no UI to
  change it**. A practice in any other timezone gets the wrong "today," wrong
  check dates near midnight, and wrong overdue math.
- **Why it matters:** `FOUNDER.md`: *"Every customer-specific value belongs in the
  database"* and *"No practice-specific logic should ever be hardcoded."* Timezone
  is in the DB but effectively hardcoded to one value because it can't be set —
  undermining the exact tz-correctness the app invests in, for any non-Eastern
  practice. The initial market is nationwide.
- **Effort:** **S–M** — a timezone selector on a practice-settings surface (natural
  home: the owner/admin Branding/practice screen) + save; every read path already
  uses `practice.timezone`.
- **Timing:** **Before onboarding any practice outside US Eastern — i.e. before/at
  launch.** **NEW** (not in `GAP_ANALYSIS.md`).

---

## Medium

### M1 — Dead legacy code with hardcoded Mann-specific location names (`LEGACY_SHIP_FIELD`) — ✅ RESOLVED
> Resolved: `LEGACY_SHIP_FIELD` and the fallback branch removed; `shipQty` now reads only the `split` map (which every Supabase shipment carries). Build clean; no refs remain.
- **Description:** `App.jsx` defines
  `LEGACY_SHIP_FIELD = { Tampa, Palmetto, "St. Pete", Largo }` and `shipQty` falls
  back to it for blob-era shipment records. The blob layer is fully retired (the
  data-layer rewrite is done; `storage.js` deleted); every shipment now comes from
  Supabase with a `split` map, so the fallback branch is **unreachable dead code** —
  its own comment says it lasts only *"until the step 3 data-layer rewrite retires
  the legacy shape entirely,"* which has happened.
- **Why it matters:** `FOUNDER.md`: *"No practice-specific logic should ever be
  hardcoded"* and *"Avoid technical debt."* Hardcoded Mann location names in a
  multi-tenant codebase is precisely what the philosophy forbids — now as
  unreachable dead weight.
- **Effort:** **S** — delete the constant and the fallback branch; `shipQty` reduces
  to the split lookup. (Confirm no Supabase shipment relies on the fallback — it
  can't; `shipment_locations` always yields a split.)
- **Timing:** Low-risk cleanup; fold into the next shipments-adjacent change or a
  small hygiene pass. **NEW.**

### M2 — Legacy `staff_members` table (unused)
- **Description:** Survives from the single-practice era; the free-text staff picker
  was retired for `performed_by = auth.uid()`. No `src/` code references it.
- **Why it matters:** `FOUNDER.md`: *"Avoid duplication," "Avoid technical debt."*
  Dead schema.
- **Effort:** **S** — drop it in a straightforward cleanup migration (doesn't need
  the doc-gate).
- **Timing:** Cleanup; fold into a nearby migration. **Reconcile:** already in
  `GAP_ANALYSIS.md`.

### M3 — Practice hard-delete orphans a member's profile
- **Description:** `profiles.practice_id ON DELETE CASCADE` means hard-deleting a
  practice deletes members' profiles and orphans their auth users (they can't
  re-onboard); the onboarding RPC assumes the profile exists.
- **Why it matters:** `FOUNDER.md`: *"Reliability."* An edge case today (manual
  deletion only), but a real footgun if practice deletion becomes a feature.
- **Effort:** **S** — onboarding RPC upserts the profile.
- **Timing:** On the **held practice-lifecycle work**. **Reconcile:** documented in
  `DATABASE_SCHEMA.md` and `GAP_ANALYSIS.md`.

---

## Low

- **L1 — "Confirm email" is OFF.** *Deliberate and documented* ([`../LAUNCH.md`](../LAUNCH.md)
  is authoritative; also SECURITY/MVP/GAP). Not a hidden contradiction — the launch
  runbook gates it to the last pre-signup step. Listed only for completeness.
- **L2 — `item_cabinets.cabinet` vestigial column.** Documented expand/contract;
  drop in a later migration. Tracked, not a surprise.
- **L3 — `activity_log` captured but unsurfaced.** `FOUNDER.md` *"Audit important
  actions"* is **satisfied** — it's captured on every action; surfacing it is a
  later product choice (V2 reporting), not a contradiction.
- **L4 — Mobile / barcode not built.** `PRODUCT_VISION.md` says mobile is "not an
  afterthought" (incl. barcode scanning); today it's a responsive SPA with a
  mobile-style bottom nav but no dedicated app or scanning. The vision frames mobile
  as "eventually," so this is a **future gap, not a contradiction.**
- **L5 — Repo name `orbit` vs product Baybridge.** Cosmetic; naming is provisional
  per `BRAND_GUIDELINES.md`.

---

## Where the build actively matches the documented vision (so this isn't only a list of faults)

- **Tenant isolation / "every business object belongs to a Practice"** — real and
  enforced, not aspirational (`FOUNDER.md` Database Standards + Multi-Tenant
  Philosophy).
- **Dashboard prioritizes action over information** — the hitlist is exactly what
  `FOUNDER.md`/`PRODUCT_VISION.md` describe.
- **Managed lists over free text** (categories, cabinets) — directly serves *"reduce
  mistakes."*
- **Industry-generic core naming** (practices/locations/items) — matches *"expand
  without major database changes"* (modulo the M1 dead code).
- **Integrations designed but not implemented** — matches *"design clean integration
  points now; do not implement until needed."*
- **Audit trail captured on every write** — matches *"Audit important actions."*

---

## Suggested handling (no implementation — for your direction)

- **H2 (timezone)** and **M1 (dead hardcoded names)** are the cleanest new,
  low-risk items and could reprioritize what comes right after the timestamp work —
  H2 especially, since it's a launch prerequisite for non-Eastern practices and is
  small.
- **H1 (authorization)** is the weightiest; its full form is the deferred role
  decision (0006), but an interim "gate destructive actions to owner/admin" is a
  contained, high-value step that honors the stated principle without prejudging
  the model.
- Everything in Medium/Low is either already tracked in `GAP_ANALYSIS.md` or
  documented as deliberate.
