# 0006 — Role model: deferred, not resolved

Status: accepted (records a deliberate deferral)
Date: 2026-08-03

## Context

Surfaced during the documentation pass, from a genuine tension between the vision
documents and the database:

- `docs/FOUNDER.md` and `docs/PRODUCT_VISION.md` describe **six named roles** —
  Platform Administrator, Practice Owner, Office Manager, Inventory Manager,
  Clinical Staff, Read Only.
- The database today has a **three-value enum**: `profiles.role ∈
  {owner, admin, staff}` (see `docs/DATABASE_SCHEMA.md`). UI role-gating is only
  partial (e.g. Branding is owner/admin-only); RLS is the real enforcement layer.
- Crucially, `PRODUCT_VISION.md` itself says: *"Future roles should be
  permission-based rather than hardcoded."*

That last line is the crux: simply expanding the enum to six values is a **bigger
version of the exact hardcoding the vision warns against**, so "just add the roles"
is not obviously the right move — but neither is designing a full permissions model
in passing, mid-documentation, which is precisely the rushed decision this whole
review pause exists to avoid.

## Decision

**Defer.** Record the tension; change nothing in the schema, tables, or code.

- Keep the three-value enum (`owner`/`admin`/`staff`) as-is for now — it works fine
  for the product as it stands.
- Do **not** expand the enum to six named roles.
- Do **not** build a capabilities/permissions model now.
- Treat the durable answer (a real capabilities/permissions model) as deserving its
  **own dedicated design pass**, taken up deliberately when a concrete need forces
  it — not decided here.

## Alternatives considered

- **Expand the enum to six named roles** — rejected. It's a larger instance of the
  hardcoding the vision explicitly cautions against, and it would likely need
  re-litigating again the next time a practice needs a role that doesn't fit one of
  the six. It trades one rigid list for a slightly longer rigid list.
- **Design a capabilities/permissions model now** — rejected *for now*. This is the
  more durable answer, but it's a real design problem (what capabilities exist, how
  they compose, how they interact with RLS and the future platform-admin surface)
  that warrants dedicated attention, not a decision made in passing during a
  documentation pass.
- **Defer, with the reasoning recorded** — chosen.

## Consequences

- The three-value enum continues to serve; nothing breaks; no migration.
- UI role-gating remains partial (owner/admin vs staff) — acceptable, since RLS,
  not the UI, enforces access.
- When a real need arises for a role that doesn't fit the current three (or the
  platform-admin surface in `docs/ADMIN_PLATFORM.md` gets built — note that
  `platform_admins` is deliberately *separate* from `profiles.role`), this decision
  should be revisited with a proper design pass oriented toward
  capabilities/permissions rather than a longer hardcoded enum.
- Until then: no new role work is implied or scheduled. This record exists so the
  next person doesn't rediscover the tension from scratch or resolve it by accident.
