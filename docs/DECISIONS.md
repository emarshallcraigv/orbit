# Architecture Decision Records (ADRs)

This file is the **index and template** for ADRs. It does **not** rewrite the
existing records — those live as individual files in
[`decisions/`](decisions/) and are the source of truth.

## Existing ADRs

| # | Title | File |
|---|---|---|
| 0002 | Hardening before the frontend rebuild | [`decisions/0002-hardening-before-frontend-rebuild.md`](decisions/0002-hardening-before-frontend-rebuild.md) |
| 0003 | Location identity boundary (DB id-keyed, UI name-keyed) | [`decisions/0003-location-identity-boundary.md`](decisions/0003-location-identity-boundary.md) |
| 0004 | Cross-location rebalancing (design brief) | [`decisions/0004-cross-location-rebalancing.md`](decisions/0004-cross-location-rebalancing.md) |
| 0005 | Branding settings screen (design brief) | [`decisions/0005-branding-settings-screen.md`](decisions/0005-branding-settings-screen.md) |
| 0006 | Role model: deferred, not resolved | [`decisions/0006-role-model-deferred.md`](decisions/0006-role-model-deferred.md) |

> Note: numbering starts at `0002` (there is no `0001` ADR in the repo). Several
> significant decisions are also captured **in migration headers** rather than as
> standalone ADRs (e.g. the `location_cabinets` per-location + match-only-import
> reasoning in `0015`, the Baybridge-default branding reasoning in `0011`). When a
> decision is inseparable from a migration, the header is an acceptable home;
> promote it to an ADR here if it's referenced repeatedly.

## When to write an ADR

Write one for a decision that is **non-trivial and hard to reverse**, or that
future work will need to understand the *why* of: schema-shape choices, security
model choices, identity/boundary conventions, or a deliberately-deferred feature's
design. Small, obvious, or easily-reversed choices don't need one.

## Template

```markdown
# NNNN — <short decision title>

Status: proposed | accepted | superseded by NNNN
Date: YYYY-MM-DD

## Context
What situation forced a decision? What constraints and prior art apply?
(Cross-reference related ADRs / migrations rather than restating them.)

## Decision
What we chose, stated plainly.

## Alternatives considered
The other real options and why they lost — especially the close call.

## Consequences
What this makes easy, what it makes harder, and what it commits us to.
Include any follow-up work or caveats it creates.
```

## Conventions
- Filename: `decisions/NNNN-kebab-title.md`, zero-padded, sequential.
- Keep it short and honest — the value is the *reasoning*, not length.
- Mark a record `superseded by NNNN` rather than deleting it; the history is the point.
