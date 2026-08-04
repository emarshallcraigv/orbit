# 0007 — Practice lifecycle status model

Status: proposed (awaiting approval; no code until docs are reviewed)
Date: 2026-08-04

## Context

Until now a practice has exactly two states: it exists, or it is **hard-deleted**.
That has two problems:

- **No lifecycle.** There is no way to express "in evaluation," "frozen for
  non-payment," or "offboarded but retained." `docs/ADMIN_PLATFORM.md` already
  anticipates operator actions to *"create, suspend, or offboard a practice,"* and
  explicitly says the hard-delete caveat *"must be resolved first."*
- **Hard-delete is a footgun (finding M3).** `profiles.practice_id` is
  `ON DELETE CASCADE`, so deleting a practice deletes its members' profiles and
  orphans their auth users — they can't re-onboard, and the onboarding RPC assumes
  the profile exists (`docs/DATABASE_SCHEMA.md`, `docs/CONSISTENCY_REPORT.md` M3).

This ADR introduces a first-class lifecycle so suspension and offboarding become
real, auditable states — and so offboarding, not hard-delete, becomes the normal
way a practice leaves.

## Decision

Add `practices.status` — `not null`, checked against a small set — plus
`status_changed_at timestamptz`.

**States**

| Status | Meaning | Access |
|---|---|---|
| `trial` | New / in evaluation, pre-payment. | **Full** |
| `active` | Live; design partner in good standing or paying. | **Full** |
| `suspended` | Frozen (non-payment or operator action). Reversible. | **None** (full freeze) |
| `offboarded` | Terminal/archived. Data retained for a retention window, then purged out-of-band by the operator. | **None** |

**Enforcement — one helper, not many policies.** Every tenant RLS policy already
keys off the `current_practice_id()` SECURITY DEFINER helper. We change **only that
helper** to return the caller's `practice_id` **only when
`status in ('trial','active')`**, and `NULL` otherwise. Because every policy
resolves through it, `suspended` and `offboarded` close *all* reads and writes at
the data layer with a single, auditable change — no per-table policy edits, no way
for the app to bypass it.

**Suspended = full freeze (read-only deferred).** A frozen practice returns no rows
at all. Read-only suspension (reads allowed, writes blocked) is a legitimate future
refinement but requires a *second* helper (`current_practice_writable()`) ANDed onto
every INSERT/UPDATE/DELETE policy — a large surface we are deliberately **not**
taking on now. Recorded as deferred.

**The single, deliberately narrow exception.** A frozen practice's members still
authenticate, so the app must be able to show a "practice suspended — contact
support" screen. For that, and *only* that, one narrow policy lets a member read
**their own** practice's `name` and `status` — **those two fields, nothing else** —
regardless of status. This is the *only* exception to the otherwise total freeze;
its scope must not drift. It exposes no inventory, no other tenant's data, and
nothing beyond the practice name and its lifecycle state. (Postgres RLS is
row-level, not column-level; the two-field limit is enforced by exposing it through
a purpose-built, `SECURITY DEFINER` read function / minimal view that selects only
those two columns, rather than a broad table policy.)

**Offboarding replaces hard-delete.** Removing a practice becomes: set
`status = 'offboarded'`. Data is retained; members lose access but are *not*
orphaned. Actual row deletion becomes an out-of-band operator action taken after a
retention window, never the app's normal path. This resolves M3: the app stops
hard-deleting. As defensive depth, the onboarding RPCs also **upsert** the profile,
so even a manual hard-delete can't strand a returning user.

**New-practice default: `active` (stated decision, not incidental).** New practices
default to `active`, not `trial`. Rationale: there are no trial mechanics yet
(no `trial_ends_at`, no billing, no trial→paid transition), so `trial` and `active`
are functionally identical today, and defaulting to `active` avoids parking every
practice in a `trial` state that has no exit path pre-Stripe. When Stripe lands
(Phase 2), new signups can default to `trial` with a real `trial_ends_at` and an
enforced transition. Flipping the column default at that point is a one-line change.
*(This is the one place the choice is arbitrary-today; it is called out here so the
default is a decision on the record. Reviewer may override to `trial`.)*

## Alternatives considered

- **Keep hard-delete, just fix the orphan** — rejected as the *primary* answer. It
  patches M3 but still offers no lifecycle; suspension/offboarding remain
  impossible, and `ADMIN_PLATFORM.md`'s operator actions stay unbuildable. (We keep
  the RPC-upsert as defensive depth regardless.)
- **Enforce status per-policy** (add a status check to every tenant policy) —
  rejected. Correct but broad and error-prone; the helper is a single chokepoint
  every policy already trusts.
- **Read-only suspension now** — rejected *for now*. More capable, but needs a
  second helper threaded through every write policy. Deferred until there's a
  concrete need; full-freeze is the safe, small first step.
- **Status column + one-helper freeze + offboard-as-delete** — chosen.

## Consequences

- One migration (`0017`): the `status` + `status_changed_at` columns, the
  `current_practice_id()` change, the narrow name/status read path, the RPC upsert,
  and a backfill of existing practices to `active`.
- Suspending or offboarding a practice is now a data-layer state change enforced by
  RLS — not an app convenience and not bypassable.
- M3 is resolved: the app no longer hard-deletes; offboarding retains data and
  never orphans a member. `GAP_ANALYSIS.md` and `CONSISTENCY_REPORT.md` M3 update
  accordingly.
- `ADMIN_PLATFORM.md`'s suspend/offboard operator actions now have a backing model
  (the operator surface itself is still later work).
- Deferred, on the record: read-only suspension; billing-driven `trial` semantics
  and `trial_ends_at` (arrive with Stripe, Phase 2).
- A **status-dimension isolation test** (members of a suspended/offboarded practice
  get zero rows; active works; the name/status exception returns exactly those two
  fields and nothing more) is part of the definition of done, same standard as every
  isolation test — and lands committed in the new permanent test suite.
