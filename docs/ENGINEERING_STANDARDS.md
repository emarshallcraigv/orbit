# Engineering Standards

These are not aspirational — they codify the discipline actually used throughout
this build. New work is expected to meet the same bar.

## Migrations

- **Every migration is reviewed before it is run.** The full SQL is read and
  traced by a human before applying — not a summary of the SQL. Migrations that
  touch security (RLS, a new tenant table, a `SECURITY *` function) get extra
  scrutiny and their rationale written into the migration header.
- **Numbered and ordered.** `supabase/migrations/NNNN_description.sql`, applied in
  order. `supabase/setup_production_from_scratch.sql` is the concatenation of all
  migrations for standing up a fresh environment in one paste; **it is kept in
  lockstep** — every new migration is appended to it in the same commit.
- **Non-destructive by default (expand/contract).** Add columns/links and backfill
  first; drop the old thing in a *later* migration once the app is confirmed on the
  new one (e.g. `item_cabinets.cabinet` kept vestigial after `cabinet_id` landed).
- **Discovery-based migrations assert their expected match count** and raise on
  mismatch, rather than silently no-op'ing when reality differs from assumption.
- **Idempotency guards** (`if not exists`, `drop policy if exists … create`) so a
  migration is safe to re-apply during development.
- The consolidated setup file must be **smoke-run once against a fresh scratch
  project** before the staging/production split relies on it (see
  [`../STAGING.md`](../STAGING.md)) — inspection confirms structure, only a real
  run confirms it executes.

## Testing & verification

- **Isolation tests are required for anything touching RLS or tenant data.** A
  two-practice test (two real auth sessions, direct queries) proving neither
  practice can read/write the other's rows — **actually run and its output shown**,
  never merely described. This has been done for shipments/transfers,
  `bulk_import_items`, Storage logos, and `location_cabinets`/`copy_location_cabinets`.
- **Pure logic is unit-tested** in plain Node (no browser/DB): ranking, CSV
  validation, color extraction. Restructure code to be testable *before* testing it
  (e.g. keep the Supabase import out of a module so its core stays Node-testable).
- **Verify, don't assume.** Confirm a change actually took effect — read the live
  UI, run the query, check the count — rather than declaring victory from the diff.
  Real bugs have been caught this way (a display-layer date shifting a day; a
  missing `logo_path` in a select that would have looked fine until reload; an
  import auto-creating labels that contradicted an agreed rule).
- **Be honest about what wasn't verified.** When browser automation genuinely
  can't drive something (a native file-picker, a download), say so explicitly
  rather than implying it was tested.

### The permanent test suite

Tests live in the repo and are re-runnable — the isolation tests we used to write as
throwaway scripts are now committed. Runner: Node's built-in **`node --test`** (zero
new dependency, matches the plain-Node convention above).

- `tests/unit/` — **pure logic, no env/DB**: hitlist ranking, CSV validation, color
  extraction, shipment split math, date formatting. Run in CI-style with
  `npm test` → `node --test tests/unit`.
- `tests/integration/` — **live-Supabase isolation tests** (two real auth sessions,
  direct queries). Each is **guarded to skip when the Supabase env vars are absent**,
  so `npm test` stays offline-safe; run them explicitly with
  `npm run test:integration` (loads `.env.local`, uses the project-local Node). This
  is where the tenant two-practice tests, the H1 role-dimension delete-gating test,
  and the `0017` status-dimension test live.
- A test committed here is the durable form of "actually run and its output shown":
  the standard isn't weakened, it's made repeatable.

## Delivery cadence

- **Commit + push after every slice** — this is part of the definition of "done"
  for a slice, not optional batching. Each slice is independently reviewable.
- **Commit messages explain the *why*** and end with the standard co-author trailer.
- Work on a branch; the granular sequence lives in [`../ROADMAP.md`](../ROADMAP.md).

## Decisions

- Non-trivial or hard-to-reverse choices get an ADR in
  [`decisions/`](decisions/) (template + index in [`DECISIONS.md`](DECISIONS.md)).
- Surface trade-offs and make a recommendation; don't hide a decision inside an
  implementation.

## Scope discipline

- Prefer the structurally-correct option over the by-convention one when they
  diverge (RLS-by-construction over app-level filtering; a managed list + FK over
  free text). This has repeatedly paid off.
- Flag out-of-scope work rather than folding it in; hold agreed-but-not-started
  work when priorities change, and say so.
