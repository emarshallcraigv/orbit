# Mann Supply — multi-tenant rebuild

This app started as a single-practice tool for Mann Orthodontics. It's being rebuilt
into a multi-tenant SaaS product other orthodontic practices can sign up for
independently. This README is written as a handoff brief for Claude Code picking up
the work from here.

## Stack

- **Frontend:** React + Vite (existing)
- **Backend:** Supabase — Postgres + Auth + Storage, using Row-Level Security for
  tenant isolation (not application-level filtering)
- **Hosting:** Netlify
- **Source control:** GitHub
- **Later:** Resend (email), PostHog (analytics), Sentry (error monitoring) — not
  needed for the initial multi-tenant rebuild, don't block on these

## What's already done

- `supabase/migrations/0001_init.sql` — full schema + RLS policies. Every tenant-owned
  table has a `practice_id` and policies scoping access to `current_practice_id()` (a
  SQL function reading the caller's own `profiles.practice_id`).
- `supabase/migrations/0002_practiceos_hardening.sql` — a review pass done before any
  frontend wiring started: replaces free-text "who did this" fields with real
  `profiles` references, drops a redundant staff table, adds room for per-practice
  settings and timezone, adds a generic audit log, and adds a proper invitations
  table as an upgrade path from join-codes-only. Full reasoning in
  `docs/decisions/0002-hardening-before-frontend-rebuild.md` — worth reading before
  building the auth/onboarding UI, since it explains *why* the tables look the way
  they do.
- Run both migrations, in order, against a fresh Supabase project to get the database
  side fully set up.
- Two Postgres functions, `create_practice_for_new_user` and `join_practice_by_code`,
  handle onboarding atomically — a client can't end up in a half-created state (a
  practice with no owner, or a user with no practice). A third, `accept_invitation`,
  handles the targeted-invite path added in the hardening migration.
- A trigger auto-creates a blank `profiles` row on signup, so there's always something
  to attach a `practice_id` to right after.
- `.env.example` — copy to `.env.local` and fill in your Supabase project URL + anon key
- `src/lib/supabase.js` — client init, reads those env vars
- `package.json` already points at `@supabase/supabase-js` instead of firebase

## What's NOT done yet — this is the actual work

**The entire existing `src/App.jsx` (~1,700 lines) still assumes one hardcoded
practice.** Specifically:

1. **No auth UI exists yet.** Need: sign up (create practice OR join via code — see
   the two Postgres functions above), log in, log out, password reset. Supabase Auth
   handles the mechanics; this is mostly UI + calling those functions.

2. **`LOCATIONS = ["Tampa", "Palmetto", "St. Pete", "Largo"]` is a hardcoded JS
   constant used throughout the app** — in the dashboard cards, check-in tabs, the
   shipment location-split fields, the weighted auto-split math, inventory snapshot
   columns, basically everywhere. All of that needs to read from the practice's own
   `locations` table instead, and every UI that assumes exactly 4 fixed named
   locations needs to work for however many a practice actually has (could be 1,
   could be 15).

3. **The weighted shipment auto-split (Palmetto > Tampa > St. Pete > Largo) was
   tuned to Mann's specific real-world ordering pattern.** For a generic multi-tenant
   product this shouldn't be a hardcoded global default — suggest an even split
   across a practice's configured locations as the default, with per-practice custom
   weighting as an optional settings feature later, not a requirement for v1.

4. **All data currently lives in one big JSON blob per key** (items, checks,
   shipments, transfers, queue, staff, distributors), previously stored in Firestore,
   now needs to be read from/written to the new normalized Postgres tables instead.
   This is the biggest chunk of work — every handler in `App.jsx` that currently does
   `saveItems([...items, newItem])` on an in-memory array needs to become a real
   Supabase insert/update/delete against the right table, and the initial load needs
   to fetch from Postgres instead of one blob get.

5. **Branding (logo, colors) is hardcoded** — `LOGO_SRC`, the CSS custom properties in
   `STYLES`. Needs to read from `practices.logo_url` / `practices.primary_color` /
   `practices.accent_color` and apply them at runtime, plus a way for an owner to
   change them (Supabase Storage for the logo upload).

6. **The 224-item starter catalog is Mann-specific** and shouldn't be forced on every
   new practice. Simplest v1: new practices start with an empty item list and add
   their own via the existing "Manage items" screen. A "starter template" or CSV
   import is a reasonable v2, not required now.

7. **The old "Staff" dropdown pattern needs to go away.** It existed because there
   were no real logins — someone picked their name from a list before saving a
   check-in. Now that every staff member has a real account, the app should just use
   `auth.uid()` / the current session automatically for `performed_by` — no dropdown,
   no room for someone to select a coworker's name by mistake (or on purpose).

## Suggested order of attack

1. Auth screens + practice creation/join flow (gets you a working `practice_id` and
   `profiles.role` to build everything else against)
2. Locations become dynamic — this unblocks almost everything else, since so much
   downstream logic depends on iterating over "the practice's locations" instead of
   the fixed 4
3. Swap the blob-based data layer for real Supabase queries against the new tables
4. Branding (logo/colors) read from and editable via the practice record
5. Role-gating in the UI (owner/admin vs staff) to match what RLS already allows

## A note on risk

This is being sold to other businesses, so a bug in tenant isolation is a real
liability, not just an inconvenience. The RLS policies in the migration file are the
enforcement layer — test them directly in the Supabase SQL editor or dashboard (create
two fake practices, two fake users, confirm one can never see the other's rows) before
this goes anywhere near a paying customer, independent of whatever the frontend does or
doesn't correctly filter.
