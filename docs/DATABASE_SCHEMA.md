# Database Schema

The live schema as built across **15 migrations** (`supabase/migrations/0001_*`
… `0015_*`). Postgres on Supabase. A single consolidated
`supabase/setup_production_from_scratch.sql` reproduces it in one paste for a
fresh environment (kept in lockstep with the numbered migrations).

## Governing principle: every business object belongs to a practice

Multi-tenancy is enforced in the database, not the app. **Every tenant-owned
table carries `practice_id uuid references practices(id) on delete cascade`**, and
Row-Level Security scopes every read/write to `practice_id = current_practice_id()`
(see [`SECURITY.md`](SECURITY.md)). Join/child tables that don't carry
`practice_id` are scoped **via their parent** instead (documented per table below).
The pivot the whole system hangs off is `profiles.practice_id` — "which practice
does this user belong to."

## Tables

### Identity & tenancy
- **`practices`** — the tenant. `id`, `name`, `join_code` (unique), branding
  (`logo_url`, `logo_path`, `primary_color`, `accent_color`), `settings jsonb`,
  `timezone`, `status` + `status_changed_at` (`0017`), `created_at`. Colors default
  to `null` = the Baybridge platform default (migration `0011`); `logo_path` points
  at the private Storage object (`0013`).
  **Lifecycle status** (`0017`, ADR [`0007`](decisions/0007-practice-lifecycle.md)):
  `status ∈ {trial, active, suspended, offboarded}`, `not null default 'active'`.
  `trial`/`active` = full access; `suspended`/`offboarded` = **fully frozen** —
  enforced centrally by `current_practice_id()` returning `NULL` unless
  `status in ('trial','active')`, so every tenant policy closes at once. The **only**
  exception is a narrow read path exposing a frozen practice's `name` and `status`
  (those two fields only) to its own members, for the "practice suspended" screen.
  Offboarding is the normal removal path (data retained, members not orphaned);
  hard-delete is an out-of-band operator last resort.
- **`profiles`** — one row per `auth.users` entry. `id` (FK → `auth.users`,
  cascade), `practice_id` (FK → `practices`, cascade), `email`, `display_name`,
  `role` (`owner` / `admin` / `staff`). Created automatically by the
  `handle_new_user` trigger on signup. This is the source of truth for tenancy and
  role.
- **`invitations`** — targeted invites: `practice_id`, email, role, token,
  `expires_at` (default now + 14 days), `created_at`. Backend + `accept_invitation`
  RPC exist; **no send-invite UI yet** (see [`CUSTOMER_ONBOARDING.md`](CUSTOMER_ONBOARDING.md)).

### Locations & their managed lists
- **`locations`** — offices a practice tracks (1..N; the old hardcoded 4 is gone,
  `0005`). `practice_id`, `name` (case-insensitively unique per practice),
  `sort_order`, `physical_address jsonb`, `billing_address jsonb` (`0014`;
  `billing_address IS NULL` means "same as physical").
- **`location_cabinets`** — per-location managed cabinet/storage labels (`0015`).
  `location_id` (FK → `locations`, cascade), `label`, `sort_order`. **No
  `practice_id`** — RLS-scoped via the parent location. Case-insensitive unique per
  location.

### Catalog
- **`items`** — the master supply catalog. `practice_id`, `name`, `description`,
  `tracking_type` (`good_low` / `quantity`), `unit`, `threshold`, `threshold_desc`,
  `estimated_unit_cost` (`0008`), `category_id` (FK → `categories`, `ON DELETE SET
  NULL`, `0008`), `active`, `created_at`.
- **`item_cabinets`** — per-(item, location) cabinet assignment. `item_id`,
  `location_id`, legacy `cabinet` text (vestigial), `cabinet_id` (FK →
  `location_cabinets`, `ON DELETE SET NULL`, `0015`). PK `(item_id, location_id)`.
  RLS via parent item.
- **`categories`** — practice-scoped managed category list (`0008`). `practice_id`,
  `name` (case-insensitive unique per practice), `sort_order`.
- **`distributors`** — practice directory (`0006` added contact fields):
  `practice_id`, `name`, `account_number`, `phone`, `order_email`, `website_url`,
  rep fields, `notes`.

### Operations
- **`checks`** — one persistent row per (item, location) — the on-hand state, not
  a new row per month. `practice_id`, `item_id`, `location_id`, `counted_qty`,
  `status` (Good/Low/Need to Order for good_low items), `notes`, `performed_by`,
  `checked_at`. `unique (item_id, location_id)`.
- **`shipments`** — logged orders. `practice_id`, `item_id`, `distributor`,
  `po_ref`, `ship_to_location_id`, `total_qty`, `date_ordered`, `status`
  (Ordered / Partially Received / Received), `date_received`, `transfers_created`,
  `performed_by`, `notes`, `created_at`.
- **`shipment_locations`** — per-location split of a shipment. PK
  `(shipment_id, location_id)`, `qty`. A table (not fixed columns) so it scales to
  N locations. RLS via parent shipment.
- **`transfers`** — supplies moving between locations after a shipment lands.
  `practice_id`, `shipment_id` (FK, `ON DELETE SET NULL`), `item_id`,
  `from_location_id`, `to_location_id`, `qty`, `status`, `date_created`,
  `date_received`, `performed_by`.
- **`queue_entries`** — the ordering queue. `practice_id`, `item_id`,
  `date_flagged`, `distributor`, `status` (Pending / Ordered / …), `date_ordered`,
  `notes`, `qty_to_order`, `shipment_created`, `created_shipment_id`.
- **`queue_locations`** — which locations a queue entry targets. `queue_entry_id`,
  `location_id`, `qty`, `reason`. RLS via parent entry.

### Audit
- **`activity_log`** — durable audit trail (`0002`). `practice_id`, `actor_id`
  (FK → `profiles`, `ON DELETE SET NULL` via `0009`), `action`, `entity_type`,
  `entity_id`, `detail jsonb`, `created_at`. Written inside the compound-write RPCs
  so it can't drift from what happened. Not yet surfaced in any view (backs V2
  reporting).

### Legacy
- **`staff_members`** — pre-rebuild table from the single-practice era. The
  free-text "who did this" staff dropdown was **retired** in favor of
  `performed_by = auth.uid()`. Retained but unused; a candidate for removal once
  confirmed no code references it.

## Naming conventions
- snake_case tables and columns; singular concept, plural table (`items`,
  `shipments`).
- `*_id` for foreign keys; `date_*` for `date` columns (business dates in the
  practice's timezone), `*_at` for `timestamptz` (event stamps).
- Accountability is `performed_by` / `actor_id` = `auth.uid()`.
- Managed-list uniqueness is enforced case-insensitively via
  `unique index … (scope, lower(name/label))`.

## Referential-integrity choices worth knowing
- Tenant tables cascade on `practices` delete (removing a practice removes its
  data). **Caveat (resolved by `0017`):** `profiles.practice_id` is
  `ON DELETE CASCADE`, so a *hard*-delete still deletes members' profiles and
  orphans them. As of the lifecycle model (ADR
  [`0007`](decisions/0007-practice-lifecycle.md)) the app no longer hard-deletes —
  removal is `status = 'offboarded'` (data retained, members not orphaned), and hard
  delete is an out-of-band operator action only. As defensive depth, the onboarding
  RPCs now **upsert** the profile, so even a manual hard-delete can't strand a
  returning user. This closes finding M3.
- `performed_by` / `actor_id` back-references are `ON DELETE SET NULL` (`0009`) so a
  departed staff member can be removed without blocking on their history.
- Managed-list links (`category_id`, `cabinet_id`) are `ON DELETE SET NULL` —
  deleting a category/cabinet unsets it on items rather than deleting the items.
- **Role-gated deletes (`0016`):** `DELETE` on the top-level managed entities
  (`locations`, `items`, `categories`, `distributors`, `location_cabinets`) is
  restricted to `owner`/`admin` — the role check is ANDed onto each policy's tenant
  scope. `INSERT`/`UPDATE` and child/join-table deletes are unchanged. Interim fix;
  full role model deferred (ADR [`0006`](decisions/0006-role-model-deferred.md)).

See also: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md),
[`SECURITY.md`](SECURITY.md), and ADR
[`0003`](decisions/0003-location-identity-boundary.md) (DB is id-keyed, UI is
name-keyed, translated at the data-access boundary).
