# 0008 — `user_locations`: inert foundation, built ahead of need

Status: accepted (records a deliberately unused table)
Date: 2026-08-06

## Context

Two near-term V1 systems — **assignments** and **reminders/notifications**
(`docs/GAP_ANALYSIS.md`, the largest remaining workstream) — will need to answer
"which members are associated with which locations?" Without a shared home for that
relationship, each system would invent its own (a JSON blob on a notification rule,
an ad-hoc join, a per-feature table), and they'd drift apart — exactly the
duplication `FOUNDER.md` warns against.

At the same time, building the *feature* now would be speculative: there is no
validated need yet for a member↔location UI, and guessing at its shape (is an
assignment "primary"? does it carry a role? a notification preference?) is how
premature structure calcifies.

## Decision

Build **only the relationship table** — `user_locations (profile_id, location_id,
created_at)`, unique on the pair — and nothing else. It is:

- **Deliberately unused.** No UI reads or writes it; no `src/` code references it.
- **Bare.** No "primary" flag, no role, no preferences — nothing beyond the
  relationship. Speculative columns are the thing this decision explicitly avoids.
- **Tenant-safe from day one.** RLS scoped via the parent location (like
  `item_cabinets` / `shipment_locations`), reads practice-scoped, writes gated to
  `owner`/`admin`, inserts additionally requiring the assigned profile to be in the
  caller's practice. Migration `0021`.

Future assignments/notifications work **consumes this table** rather than
reinventing the relationship; any columns those systems genuinely need get added
then, when the need is real and the shape is known.

## Alternatives considered

- **Don't build it until the consuming feature does** — rejected. The relationship
  is common to multiple upcoming systems; standing it up once, tenant-safe, avoids
  each reinventing (and mis-securing) it. The cost is one small, isolated migration.
- **Build a richer table now** (primary flag, per-assignment role/preferences) —
  rejected. That's the speculative structure this decision exists to avoid; those
  columns belong to a validated feature, not a foundation.
- **A generic `assignments` table** (polymorphic subject/target) — rejected as
  over-abstract for a concrete member↔location link; revisit only if a second
  assignment kind actually appears.

## Consequences

- One migration (`0021`); one new table with RLS; **zero** behavior change — the app
  runs identically, because nothing reads or writes it.
- When assignments/notifications are planned, they start from this table (referenced
  from `docs/GAP_ANALYSIS.md`'s assignments/notifications workstream) instead of a
  blank slate.
- Because it is inert, it needs the same discipline as the deferred role model (ADR
  [`0006`](0006-role-model-deferred.md)): this record exists so the next person
  knows the table is intentional, unused, and **not** to be wired into any UI until
  a real need is validated — not dead code to be "cleaned up."
- An isolation test (`tests/integration/user_locations.test.mjs`) proves the
  tenant/role boundaries hold even though nothing in the app exercises them yet.
