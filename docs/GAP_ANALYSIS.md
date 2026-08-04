# Gap Analysis

The current project measured against everything in this documentation set.
Each area is **Already Complete / Partially Complete / Missing**, with a rough
effort estimate (**S**mall / **M**edium / **L**arge). Then: the recommended next
three engineering sprints.

> Reflects the codebase at **15 migrations**. Several items below are currently
> **on hold pending this review** (practice-lifecycle change, Sentry, test suite,
> timestamp fixes) — they're classified honestly here, but nothing proceeds until
> approved.

## Foundation & security

| Area | Status | Effort to close | Notes |
|---|---|---|---|
| Multi-tenant RLS on every tenant table | ✅ Complete | — | Enforced; isolation-tested repeatedly. |
| INVOKER/DEFINER convention + `search_path` + grants | ✅ Complete | — | See `SECURITY.md`. |
| Storage security (private logos bucket) | ✅ Complete | — | Per-practice, owner/admin writes, signed URLs. |
| Compound-write atomic RPCs | ✅ Complete | — | shipments/queue/receive/import/copy. |
| Audit trail captured (`activity_log`) | ✅ Complete (capture) | — | Written everywhere; **not surfaced** (see below). |
| Email confirmation ON + Resend | ❌ Missing | **S** (once Resend) | Hard launch blocker; policy off for dev. |
| Practice hard-delete orphans a profile | ❌ Missing (bug) | **S** | Onboarding RPC should upsert the profile. On hold (practice-lifecycle). |
| Legacy `staff_members` table cleanup | ❌ Missing | **S** | Unused post-rebuild; remove once confirmed no refs. |

## Core product (Phase 1 / V1)

| Area | Status | Effort | Notes |
|---|---|---|---|
| Auth + onboarding (signup, create/join practice) | ✅ Complete | — | Modulo email-confirm gate. |
| Locations (+ addresses, + cabinet labels) | ✅ Complete | — | `0014`, `0015`. |
| Catalog (items, categories, distributors, cabinet assignment) | ✅ Complete | — | Managed lists, no free-text drift. |
| Check-ins, queue, shipments/receiving, transfers, inventory | ✅ Complete | — | Core daily loop works. |
| CSV bulk import | ✅ Complete | — | Validated preview + atomic RPC. |
| Branding (logo + colors + auto-suggest) | ✅ Complete | — | Full Branding screen. |
| Design system + per-practice theming | ✅ Complete | — | `UI_UX_GUIDELINES.md`. |
| Timestamp surfacing (inventory "last updated", queue ordered date) | 🟡 Partial | **S** | Dates exist + are mostly shown; inventory freshness + queue ordered date missing. Audit done; fix on hold. |
| Cross-location rebalancing | 🟡 Partial (design done) | **M** | ADR `0004`; build pending. |
| Assignments / reminders / notifications | ❌ Missing | **L** | Largest remaining V1 workstream; needs plan-first + shared detection fn. |
| UI role-gating (owner/admin vs staff) | 🟡 Partial | **M** | RLS enforces DB; UI gating only partial. Role *model* (3-enum vs the vision's 6 roles / a permissions model) is **deliberately deferred** — ADR [`0006`](decisions/0006-role-model-deferred.md); this row is only about gating today's three roles in the UI. |

## Onboarding & growth

| Area | Status | Effort | Notes |
|---|---|---|---|
| Signup + join-by-code | ✅ Complete | — | |
| Targeted invitations | 🟡 Partial (backend only) | **M** | `invitations` + `accept_invitation` exist; **no send-invite UI**. |
| First-run setup checklist / demo data | ❌ Missing | **M** | Optional, higher-value-later. |

## Beyond V1 (correctly deferred)

| Area | Status | Effort | Notes |
|---|---|---|---|
| Cost tracking + spend reporting (Phase 2) | ❌ Missing | **L** | Out of MVP scope by design. |
| Direct ordering + distributor APIs (Phase 3) | ❌ Missing | **L** | Deliberately deferred; needs product/SKU/pricing model. |
| Admin/platform console | ❌ Missing (design only) | **L** | `ADMIN_PLATFORM.md`. |
| Observability (Sentry, PostHog) | ❌ Missing | **S–M** | On hold (Sentry); recommend around first users. |
| Billing (Stripe) | ❌ Missing | **M** | When there's something to bill. |
| Automated test suite (CI) | ❌ Missing | **M** | Isolation/unit tests exist as scripts; no CI harness. On hold. |
| Staging/production split | 🟡 Partial (documented) | **M** | `STAGING.md`; not stood up. |

## Documentation (this pass)

| Doc | Status |
|---|---|
| All technical/product/process docs in `/docs` | ✅ Complete (this pass) |
| `FOUNDER.md`, `PRODUCT_VISION.md` | ❌ Missing content — placeholders awaiting your verbatim text |

---

## Recommended next three sprints

Optimized for **greatest long-term value with minimal added technical debt**, and
for getting to a real, launchable product. Note this front-loads one item
(onboarding/launch-readiness) that isn't in the agreed near-term engineering
sequence, because it's the actual gate to having any customers — flagged for your call.

### Sprint 1 — Launch-readiness & onboarding *(effort: M, debt: low)*
Wire **Resend**, turn on **email confirmation**, and build the **send-invitation
UI** on the existing `invitations`/`accept_invitation` backend.
- **Why:** email confirmation is the one hard blocker in the MVP launch criteria,
  and invitations are the clearest onboarding gap — both ride the same small
  dependency (Resend), so one sprint clears two blockers. Reuses existing backend;
  adds almost no debt.
- Optional tail: add **Sentry** while touching config, so first real users are
  observable.

### Sprint 2 — Complete the "trustworthy live inventory" promise *(effort: M, debt: low)*
Ship the **timestamp/freshness surfacing** (inventory "last updated" = most recent
check/receipt/confirmed-transfer; queue ordered date) **and build cross-location
rebalancing** per ADR `0004`.
- **Why:** these finish V1's core value proposition — *know what you truly have*
  (freshness) and *don't over-order* (rebalancing, with a direct cost-savings
  story). Both are already designed/mapped, so debt is minimal. Matches the agreed
  sequence (timestamp → rebalancing).

### Sprint 3 — Assignments / reminders / notifications *(effort: L, debt: contained by discipline)*
**Plan first (no code), then build**: the reusable Postgres **detection function**
(on-demand now, `pg_cron`-ready later), the notification center, and assignments —
with the **dashboard hitlist and notifications sharing one detection source** so
they can't drift.
- **Why:** the largest remaining V1 feature and the one that makes the daily loop
  *stick* (reminders drive recurring check-ins). The plan-first requirement and the
  shared-detection rule are exactly what keep this from becoming two divergent
  systems — i.e. debt is controlled by process, not luck.

**Deliberately not in the top three:** cost tracking, direct ordering, the admin
console, and billing — all correctly later-phase. The small hygiene items
(`staff_members` removal, the practice-hard-delete profile fix) are best folded
into whichever sprint touches nearby code, not their own sprint.
