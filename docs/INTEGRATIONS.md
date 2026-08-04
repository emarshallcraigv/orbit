# Integrations

Third-party services — what's connected now, what's planned, and a recommended
sequencing that avoids taking on integrations before the data they need exists.

## Current (in use)

| Service | Role | Notes |
|---|---|---|
| **Supabase** | Postgres DB, Auth, Storage | The backend. RLS is the isolation layer; Storage holds practice logos (private bucket). |
| **GitHub** | Source control | Repo `emarshallcraigv/orbit`. |
| **Netlify** | Hosting | Deploys the SPA. Staging/prod split planned (`../STAGING.md`). |

## Planned (not yet wired)

| Service | Role | Depends on / unlocks |
|---|---|---|
| **Resend** | Transactional email | Unblocks email confirmation + targeted invitations. Highest-leverage next integration. |
| **PostHog** | Product analytics | Understand real usage before building Phase 2/4. |
| **Sentry** | Error monitoring | Catch client/prod errors once there are real users. |
| **Stripe** | Billing/subscriptions | When the product is charged for. |
| **Distributor APIs** | Direct ordering + product/SKU/pricing data | The core of Phase 3; large scope; needs per-distributor catalog modeling. |

## Recommended sequencing

1. **Resend first.** It's the shared dependency for two concrete gaps —
   email confirmation (a hard launch blocker) and the invitation-send UI. Small
   integration, immediate onboarding payoff.
2. **Sentry + PostHog around first real users.** Once real practices are on, you
   want error visibility (Sentry) and usage signal (PostHog) before deciding what
   Phase 2/4 work matters most. Both are light to add and inform everything after.
3. **Stripe when there's something to bill for** — after the product is proven with
   early practices; billing before value is premature.
4. **Distributor APIs last (Phase 3).** By far the largest and most external
   integration; it needs real product data (images, SKUs, pricing) and a
   per-distributor catalog structure. Do not start until cost tracking (Phase 2)
   has established the data model around real purchases.

## Integration principles
- Keep secrets out of the client and the repo (service keys operator-only; see
  [`SECURITY.md`](SECURITY.md)).
- Interactively-authenticated or externally-hosted services must degrade
  gracefully when absent (the app already runs fully without Resend/PostHog/Sentry).
- Prefer integrations that keep business logic in our data layer rather than
  handing it to a third party.
