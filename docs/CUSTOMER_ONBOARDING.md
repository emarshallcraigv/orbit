# Customer Onboarding

The funnel from "never heard of Baybridge" to "running the practice's day on it,"
with an honest marker on each step of **built** vs **gap**.

## The funnel

### 1. Sign up (BUILT)
A new user creates an account (name, email, password) via Supabase Auth.
`handle_new_user` auto-creates their `profiles` row.
- ⚠️ Gate: "Confirm email" is currently OFF for development and **must be ON before
  real signups** (with Resend wired). Until then, real onboarding is blocked by
  policy, not by missing product.

### 2. Create or join a practice (BUILT)
Immediately after signup the user either:
- **Creates a practice** (`create_practice_for_new_user`) — becomes its owner; a
  join code is generated; a default "Main Office" location is seeded so the app is
  never in a zero-location state.
- **Joins an existing practice by code** (`join_practice_by_code`) — becomes staff.

### 3. Set up the catalog (BUILT)
The owner defines the practice's world:
- Locations (+ addresses, + per-location cabinet labels, with copy-to-another-location).
- Categories.
- Distributors.
- Items — one at a time, **or** via **CSV bulk import** (BUILT): upload/paste →
  validated preview (matches categories/cabinets, flags duplicates and unmatched
  values, never creates managed labels implicitly) → atomic import.

### 4. Make it theirs (BUILT)
Branding: upload a logo and set primary/accent colors (with logo-based color
auto-suggest). Until customized, the practice shows the Baybridge default.

### 5. Run the daily loop (BUILT)
Check-ins flag what's low → the ordering queue → log/receive shipments → live
inventory updates, with rebalancing suggestions (rebalancing: designed, build
pending). The dashboard hitlist tells them what to do next.

### 6. Bring the team in (PARTIAL — the main gap)
- **Join-by-code** works today (share the code, staff self-join).
- **Targeted invitations are a gap:** the backend exists (`invitations` table with
  `expires_at`, and the `accept_invitation` RPC), but there is **no UI to send an
  invite** (enter an email + role → deliver a link). This is the clearest
  onboarding gap and depends on the same email provider (Resend) as the confirm-email
  gate.

## Gaps summary

| Step | Status | Missing piece |
|---|---|---|
| Email confirmation | Blocked by policy | Turn on + wire Resend |
| Send targeted invitations | Backend only | Send-invite UI + email delivery |
| Guided first-run / setup checklist | Not built | Optional: a "get started" checklist to walk a new owner through steps 3–5 |
| Sample/demo data | Not built | Optional: seed a demo practice so a prospect can try before setup |

## Recommended near-term onboarding priorities
1. Wire Resend + turn on email confirmation (unblocks real signups; shared
   dependency).
2. Build the send-invitation UI on top of the existing `invitations` /
   `accept_invitation` backend.
3. (Optional, higher-value-later) a first-run setup checklist for new owners.

See [`INTEGRATIONS.md`](INTEGRATIONS.md) (Resend), [`SECURITY.md`](SECURITY.md)
(the confirm-email gate).
