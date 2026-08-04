# Mann Supply → Baybridge — multi-tenant supply platform

This app started as a single-practice tool for Mann Orthodontics and has been rebuilt
into **Baybridge**, a multi-tenant SaaS other practices sign up for independently.

**The multi-tenant data-layer rebuild (the original steps 1–3 below) is complete.**
Every entity lives in Supabase with Row-Level Security tenant isolation — there is no
localStorage/blob layer left. For **what's next**, see **[ROADMAP.md](ROADMAP.md)**,
which is the current source of truth (versioned V1–V4). This README documents the
stack and the current state; it is no longer a step-by-step build plan.

## Stack

- **Frontend:** React + Vite
- **Backend:** Supabase — Postgres + Auth + Storage, using Row-Level Security for
  tenant isolation (not application-level filtering)
- **Hosting:** Netlify
- **Source control:** GitHub
- **Later:** Resend (email), PostHog (analytics) — not wired yet, don't block on
  these. **Sentry** (error monitoring) is wired but **dormant** — it activates only
  when `VITE_SENTRY_DSN` is set (added at launch).

  > ⚠️ **Deferred, must not be forgotten:** Supabase Auth's "Confirm email"
  > setting is currently turned **OFF** so development signups work without a
  > mail provider. It **must be turned back ON before any real practice signs
  > up** — otherwise anyone can register with an email they don't control. This
  > is deferred alongside Resend, since real confirmation emails need an email
  > provider wired up first.

## Current state — what's built

**Steps 1–3 of the original rebuild (done):**
1. **Auth + practice onboarding** — sign up (create a practice *or* join via code),
   log in, log out, password reset; `create_practice_for_new_user` /
   `join_practice_by_code` (+ `accept_invitation`) run onboarding atomically.
2. **Dynamic per-practice locations** — the old hardcoded 4-location constant is gone;
   locations come from the practice's `locations` table (1..N), and the shipment split
   defaults to an **even** split (the Mann-specific weighting is gone). A practice can
   never have zero locations (seeded default + app guard).
3. **Full Supabase data layer** — items (+ per-location cabinets), categories, item
   reference cost, distributor directory, checks, the ordering queue, shipments
   (+ splits), and transfers all read/write Supabase. Accountability is `performed_by`
   = `auth.uid()` (the old staff-name dropdown is retired); dates are timezone-aware
   (`practices.timezone`); an `activity_log` audit trail is written; and the
   multi-table compound flows are atomic Postgres RPCs (`create_shipment`,
   `create_shipment_from_queue`, `receive_shipment`).

**Also built:**
- **Baybridge branding, applied at runtime.** The platform default *is* Baybridge's
  own look — navy `#14263D` / teal `#4089A2` + the Baybridge icon. A practice that
  sets its own `logo_url` / `primary_color` / `accent_color` overrides it; a practice
  that hasn't sees Baybridge, never another tenant's branding. "Powered by Baybridge"
  strip throughout. (Mann keeps its own blue/green + logo via its stored row values.)
- **A persistent top-right account menu.**
- **Visual design refresh + dashboard-as-hitlist.** The dashboard is an urgency-ranked
  action list — order / transfer / receive rows interleaved by a (never-displayed)
  urgency score, with severity accents and tints, real SVG icons, accent-colored
  primary buttons, input focus rings, and consistent hover states.

**Not yet built (see ROADMAP.md):** owner-facing branding *editing* (a Branding
settings screen — logo upload via Supabase Storage + color pickers, with color
auto-suggest from the uploaded logo; the read/apply side is done, the edit UI isn't);
UI role-gating (owner/admin vs staff — RLS already enforces the DB side); CSV bulk
item import; and cross-location rebalancing (design brief in `docs/decisions/0004`).

## Tests

Committed and re-runnable (Node's built-in `node --test`):

```bash
npm test              # unit: pure logic, no DB — offline-safe
npm run test:integration   # live-Supabase isolation tests (needs .env.local)
```

Unit tests live in `tests/unit/`; the tenant/role/status isolation tests live in
`tests/integration/` and skip cleanly when the Supabase env vars are absent. See
[`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md).

## Migrations & decision docs

- `supabase/migrations/0001_init.sql` … `0010_*.sql` — apply in order against a fresh
  Supabase project. 0001 = schema + RLS; 0002 = hardening; 0003–0010 = the fixes and
  RPCs added during the rebuild (search_path/grant hardening, dynamic-location
  defaults, distributor fields, categories + item cost, the shipment/transfer RPCs,
  `on delete set null` on the profiles back-references, and audit-log dedup).
- `docs/decisions/` — 0002 (pre-rebuild hardening), 0003 (location identity boundary:
  DB canonical by id, UI keyed by name), 0004 (cross-location rebalancing brief).
- `.env.example` — copy to `.env.local` and fill in the Supabase URL + anon key.

## A note on risk

This is sold to other businesses, so a bug in tenant isolation is a real liability. RLS
is the enforcement layer. A two-practice isolation test (two practices, two users,
confirm neither can see the other's rows — via the app *and* direct queries) was run
against shipments/transfers and passed; re-run that class of test for any new
tenant-owned table before it goes near a paying customer, independent of whatever the
frontend filters.
