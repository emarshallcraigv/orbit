# Security Model

The security posture that is **actually built**, not a checklist of intentions.
The product is sold to other businesses, so a bug in tenant isolation is a real
liability — the whole architecture is organized around making cross-tenant access
impossible by construction.

## 1. Row-Level Security is the enforcement layer

Every tenant-owned table has RLS **enabled** with practice-scoped policies. The
canonical policy shape is:

```sql
using (practice_id = current_practice_id())          -- select/update/delete
with check (practice_id = current_practice_id())     -- insert
```

Join/child tables that don't carry `practice_id` (`item_cabinets`,
`shipment_locations`, `queue_locations`, `location_cabinets`) are scoped **through
their parent** — e.g. `location_id in (select id from locations where practice_id =
current_practice_id())`. A child row can therefore only exist under, and be read
through, a parent the caller owns.

Application code never filters by `practice_id` for safety — it *may* for
convenience, but correctness does not depend on it. Even a bug in the frontend
cannot leak another practice's rows.

## 2. `SECURITY INVOKER` vs `SECURITY DEFINER` — the convention

Both exist in the codebase, used deliberately:

- **`SECURITY INVOKER` (the default for feature work).** Runs in the *caller's*
  RLS context, so every read/write inside the function is still checked against the
  caller's policies. This **strengthens** isolation — the function physically
  cannot touch another practice's rows. Used for all compound-write RPCs:
  `create_shipment`, `create_shipment_from_queue`, `receive_shipment`,
  `bulk_import_items`, `copy_location_cabinets`, and the read helper
  `practice_today`. These functions derive the practice from a parent row or from
  `current_practice_id()` — **never** from a caller-supplied `practice_id`
  parameter, so a caller can't aim a write at another tenant.
- **`SECURITY DEFINER` (only for identity/bootstrap).** Runs with the definer's
  privileges to do the one thing RLS can't bootstrap itself:
  - `current_practice_id()` / `current_user_role()` — read the caller's own
    `profiles` row to resolve tenancy/role. These are the helpers RLS policies call;
    they must be DEFINER to avoid recursive RLS on `profiles`. As of the lifecycle
    model (`0017`, ADR [`0007`](decisions/0007-practice-lifecycle.md)),
    `current_practice_id()` also **gates on practice status**: it returns the
    practice id only when `status in ('trial','active')` and `NULL` for `suspended`
    or `offboarded`. Because every tenant policy resolves through this one helper, a
    frozen practice closes *all* reads and writes at a single chokepoint — no
    per-table edits, not bypassable from the app.
  - `handle_new_user` (signup trigger), `create_practice_for_new_user`,
    `join_practice_by_code`, `accept_invitation` — onboarding, which by definition
    runs before/at the moment a user is attached to a practice.

  Every DEFINER function is scoped tightly (acts only on `auth.uid()`'s own
  profile / the supplied join code or invite token) so it can't be used to reach
  across tenants.

## 3. `search_path` pinning + grant hardening

- All functions pin `set search_path = public` (helpers hardened in `0004`),
  closing the search-path-hijack class of vulnerability.
- Functions `revoke all … from public` and `grant execute … to authenticated`
  (the 0007/0008 hardening) — defense-in-depth so only signed-in users can call
  them, and RLS still scopes every row.

## 4. Storage security (private bucket)

The `practice-logos` bucket (`0013`) is **private** — no unauthenticated read path
at all. Objects live at `{practice_id}/logo-<ts>.<ext>`; every `storage.objects`
policy scopes on `(storage.foldername(name))[1] = current_practice_id()::text`:

- **Read** — any signed-in member of the practice, own folder only. Logos render
  via short-lived **signed URLs** (a cross-origin signed URL would taint canvas
  sampling, so color extraction downloads a same-origin blob instead).
- **Write / update / delete** — own folder **and** `current_user_role() in
  ('owner','admin')`, mirroring the practices-table update policy for colors.
- An object outside a practice folder matches no policy, so it can never be
  created — and therefore never exists to be read.
- Raster-only (`image/png|jpeg|webp`), 2 MB cap, enforced at the bucket. SVG is
  excluded because inline SVG can carry `<script>` (stored-XSS).

## 5. Roles

`profiles.role ∈ {owner, admin, staff}`. The DB is the enforcement point (RLS
policies and Storage policies gate owner/admin writes for branding). UI role-gating
is **partial** — e.g. the Branding nav item is owner/admin-only — and is tracked as
an area still being filled in; the DB does not depend on the UI for enforcement.

**Destructive deletes are owner/admin-only.** Outright `DELETE` on the top-level
managed entities — locations, items, categories, distributors, and cabinet labels
(`location_cabinets`) — is gated to `owner`/`admin` at the RLS layer (migration
`0016`), ANDed onto each policy's existing tenant scope; the UI hides the Delete
control from staff to match. `INSERT`/`UPDATE` stay open to all roles (adding and
editing are normal staff work), and child/join tables (`item_cabinets`,
`shipment_locations`, `queue_locations`) are deliberately **not** gated because their
row-deletes happen during ordinary editing. This is the **interim** least-privilege
fix on the existing 3-role model; the full capabilities/permissions model stays
deferred (ADR [`0006`](decisions/0006-role-model-deferred.md)).

## 6. Practice lifecycle freeze (`0017`)

A `suspended` or `offboarded` practice is **fully frozen**: `current_practice_id()`
returns `NULL`, so every tenant policy denies — the members authenticate but see and
touch nothing. There is exactly **one** deliberately narrow exception: a member may
read **their own** practice's `name` and `status`, and only those two fields, so the
app can render a "practice suspended — contact support" screen. It is exposed through
a purpose-built read path that selects only those two columns (Postgres RLS is
row-level, so column scope is enforced by the function/view, not a broad policy). No
inventory, no other tenant, nothing else — and this is the *only* crack in the
freeze; its scope must not drift. See ADR
[`0007`](decisions/0007-practice-lifecycle.md).

## 7. What we send to third parties (Sentry)

Error monitoring (Sentry) is wired to **transmit stack traces, not tenant data**:
`sendDefaultPii: false`, errors-only (no performance traces), and a `beforeSend`
that scrubs anything practice-identifying. We do **not** send inventory, practice
names, member emails, or any PHI-adjacent content off-platform. Sentry is dormant
unless `VITE_SENTRY_DSN` is set, so nothing leaves the browser until the DSN is
configured at launch. See [`INTEGRATIONS.md`](INTEGRATIONS.md).

## 8. Secrets handling

- The **anon key** is public by design and shipped in the client bundle; it grants
  nothing beyond what RLS allows.
- The **service-role key** is never in the app or the repo; it is used only by the
  operator for out-of-band admin (e.g. deleting an orphaned Storage object).
- `.env.local` (URL + anon key) is gitignored; `.env.example` documents the shape.
- ⚠️ **Deferred, must not be forgotten:** Supabase Auth "Confirm email" is
  currently **OFF** so development signups work without an email provider. It
  **must be turned ON before any real practice signs up**, alongside wiring Resend.

## 9. How isolation is verified

Any change touching RLS or a new tenant table gets an isolation test run for real
(real auth sessions, direct queries) — not described. Usually the two-practice form
(neither tenant can read/write the other's rows); role- and status-dimension
variants use two sessions *within one* practice. See
[`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md). Examples run to date:
shipments/transfers, `bulk_import_items`, Storage logos, `location_cabinets` +
`copy_location_cabinets`, and the H1 **role-dimension** delete-gating test (staff
blocked, owner/admin succeeds, same practice — `0016`). The lifecycle **status
dimension** (`0017`) is tested the same way and committed into the permanent suite.

See also: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md),
[`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md), ADR
[`0002`](decisions/0002-hardening-before-frontend-rebuild.md).
