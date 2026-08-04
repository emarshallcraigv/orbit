# System Architecture

The actual current stack and structure. This is a description of what is built,
not an aspiration.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 (single-page app) |
| Backend | Supabase — Postgres + Auth + Storage |
| Tenant isolation | Postgres Row-Level Security (not application-level filtering) |
| Hosting | Netlify |
| Source control | GitHub (`emarshallcraigv/orbit`) |
| Not yet wired | Resend (email), PostHog (analytics), Sentry (errors), Stripe (billing) |

The product is **Baybridge**, a multi-tenant SaaS rebuilt from a single-practice
tool for Mann Orthodontics. Practices sign up independently; each sees its own
branding, with a "Powered by Baybridge" strip.

## Where business logic lives

**In Postgres, deliberately.** The rule of thumb: anything that must be atomic,
must be tenant-safe, or is a real invariant lives in the database as an RLS policy
or a `SECURITY INVOKER` function — not in the React client, which is treated as
untrusted.

- **Multi-table / atomic writes are Postgres functions** (one function = one
  transaction), so they can't half-apply:
  - `create_shipment` — a shipment + its per-location split rows.
  - `create_shipment_from_queue` — even-split a queue entry → shipment, then flag
    the entry.
  - `receive_shipment` — mark received **and** create the pending transfers for
    every non-ship-to location, together.
  - `bulk_import_items` — CSV import: many items + cabinets + one audit row.
  - `copy_location_cabinets` — copy one location's label list to another.
- **Single-entity, single-table writes stay client-side** (via the data-access
  modules), because RLS already makes them safe and atomic on their own.
- This split is why the product can plausibly expand beyond dental practices
  later: the rules are in the data layer, so a different industry's UI can sit on
  top without re-implementing them.

## Frontend structure (`src/`)

- **`App.jsx`** — the signed-in application: all views (Dashboard, Check-in,
  Shipments, Queue, Inventory, Manage Items, Locations, Categories, Distributors,
  Branding), the `MainApp` shell, and the styling.
- **`Root.jsx` / `lib/auth.jsx`** — the auth/tenancy gate: decides between
  loading / password-recovery / signed-out / onboarding / the app, and provides
  `session` / `profile` / `practice` / `refresh`.
- **`AuthScreens.jsx`** — signed-out screens (sign in, sign up, forgot/reset,
  onboarding: create a practice or join by code).
- **`lib/*.js`** — one data-access module per entity (`locations`, `items`,
  `distributors`, `shipments`, `transfers`, `categories`, `queue`, `checks`,
  `branding`, `locationCabinets`, `importItems`, `hitlist`). Each translates the
  **id-keyed DB** to the **name-keyed UI** at the boundary (ADR
  [`0003`](decisions/0003-location-identity-boundary.md)) and is the only place
  that talks to Supabase for that entity.
- **`lib/supabase.js`** — the single Supabase client (URL + anon key from
  `.env.local`).

Pure, testable logic is isolated so it can be unit-tested in plain Node without a
browser or DB: e.g. `lib/hitlist.js` (dashboard urgency ranking),
`lib/importItems.js` (`validateRows`), `lib/logoColors.js`
(`suggestColorsFromPixels`).

## Key runtime conventions

- **Timezone-aware dates.** Business "today" is the practice's own timezone
  (`practices.timezone`) via the `practice_today()` SQL function; the client parses
  `YYYY-MM-DD` as *local*, not UTC, so displayed dates don't shift a day.
- **Per-practice theming at runtime.** `practiceBrandCss()` injects the practice's
  `primary_color` / `accent_color` as CSS variables scoped to `.app-root`; a
  practice with `null` colors renders the Baybridge default. Logo is a signed URL
  from private Storage, resolved on load.
- **Accountability + audit.** Writes stamp `performed_by = auth.uid()`; the
  compound RPCs write an `activity_log` row in the same transaction.

## Environments

Local dev points at the single Supabase project (currently "staging" by
convention). A staging/production split is documented in
[`../STAGING.md`](../STAGING.md) but **not yet stood up** — to be triggered once V1
is complete, before the first real practice. Claude Code's local environment only
ever points at staging; production is only ever touched by hand.

See also: [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md),
[`SECURITY.md`](SECURITY.md), [`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md).
