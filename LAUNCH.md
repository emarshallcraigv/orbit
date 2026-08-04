# Launch Runbook

The go-live checklist for taking **Production** live for the first real practice
(Mann Orthodontics). This is distinct from [`STAGING.md`](STAGING.md) (which covers
*standing up* the separate production environment); this file is the ordered
sequence for actually flipping it on for a real customer.

> **Authoritative on one thing in particular:** the Supabase Auth **"Confirm
> email"** toggle. See the hard rule below. Other docs that mention it
> (`README.md`, `docs/SECURITY.md`, `docs/MVP_REQUIREMENTS.md`,
> `docs/CUSTOMER_ONBOARDING.md`) defer to this file for *when* it flips.

## The "Confirm email" rule (do not get this wrong)

- **"Confirm email" stays OFF for the entire development and testing period.**
  Every feature in this build is verified with rapid, throwaway signups
  (create-account → create-practice → exercise the feature → discard), which only
  works with confirmation off. Turning it on early adds real friction to exactly
  the testing still ahead (rebalancing, the assignments/reminders/notifications
  system) for no benefit.
- **It is flipped ON exactly once: as the very last step before Mann's real
  signup** — after everything below is done, immediately before the first real
  account is created on Production. Not before. Not "while we're in there."
- Wiring **Resend** (transactional email) can and should happen earlier — it is
  decoupled from this toggle. Resend being wired does **not** mean flip the toggle;
  the toggle is its own deliberate final action.

## Pre-launch checklist (in order)

1. **V1 is feature-complete** — all ROADMAP near-term items done (timestamp/freshness
   surfacing → cross-location rebalancing → assignments/reminders/notifications),
   plus Resend + the invitation UI.
2. **Tenant isolation re-verified** — the two-practice isolation test passes for
   every tenant-owned table and RLS-touching function (see
   [`docs/SECURITY.md`](docs/SECURITY.md)).
3. **Production environment stood up** per [`STAGING.md`](STAGING.md): second
   Supabase project, `supabase/setup_production_from_scratch.sql` run (and
   previously smoke-tested against a fresh scratch project), second Netlify site on
   the `production` branch, env vars pointed at the new project.
4. **Resend wired on Production** (API key set as a server-side secret; send path
   verified with a test address).
5. **Smoke test on Production** — one throwaway signup end-to-end (with confirm
   still OFF), then remove it.
6. **→ Flip "Confirm email" ON** on the Production Supabase project. *(This is the
   step gated by the rule above — the final action before real use.)*
7. **Create Mann's real account** on Production and complete onboarding →
   catalog setup → daily loop.

## Rollback / safety notes

- Claude Code's local environment only ever points at **staging**; Production is
  only ever touched by hand (per [`STAGING.md`](STAGING.md)).
- Every migration reaches Production only after being proven on staging — same SQL,
  applied deliberately (see [`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md)).
- If confirmation email delivery misbehaves after step 6, the fastest safe recovery
  is to flip the toggle back OFF, fix Resend, and re-verify — not to bypass it.
