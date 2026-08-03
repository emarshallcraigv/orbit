# Staging / Production split

**Status: not yet done — queued.** This is the plan for splitting the single
current environment into Staging + Production. Nothing here happens until the
trigger below.

## Trigger

Do this **once V1 is fully complete** — all ROADMAP near-term items done,
including cross-location rebalancing and the full Branding screen — **and before
the real Mann Orthodontics account is created.**

## What this is

The **current Supabase project + Netlify site become "Staging."** Nothing about
them changes; all ongoing feature work continues here exactly as it does now.

A brand-new, **separate "Production"** is stood up alongside it, and only ever
receives code/migrations **after they're proven on Staging.**

## Setup steps (when triggered)

1. Create a second Supabase project (`baybridge-production` or similar).
2. Run **`supabase/setup_production_from_scratch.sql`** — the single consolidated
   file containing all migrations (0001 onward) concatenated in order. It is
   maintained as new migrations are added, so standing up a fresh environment is
   always one paste, not a manually-tracked sequence.
3. Get the new project's URL + anon key; turn **"Confirm email" ON from the
   start** (unlike staging, where it's fine to leave off for testing).
4. Create a second Netlify site, deploying from a new `production` branch, with
   environment variables pointed at the new Supabase project.
5. Create the `production` branch from `main` in GitHub.
6. **Smoke-test with one throwaway signup on production** before creating the
   real Mann account there.

## Going forward, once this exists

- **Every migration gets applied twice**: staging first (reviewed, tested — same
  as always), then the **identical SQL on production once proven.**
- **Code promotion is deliberate**: merge `main` into `production` on purpose —
  not an automatic deploy.
- **Claude Code's local environment only ever points at staging.** Production is
  only ever touched manually, by Marshall, applying what's already been reviewed.

## Maintenance note (now)

`supabase/setup_production_from_scratch.sql` already exists and must stay in
lockstep with `supabase/migrations/`: **every new numbered migration is appended
to that file too**, in order. This is the one piece set up ahead of the trigger,
so a fresh production DB is always a single paste.
