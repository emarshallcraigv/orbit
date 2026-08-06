# Current Status

**Last updated:** August 5, 2026

> The operational heartbeat — a dashboard, not a journal. Read the whole company's
> current state in under 60 seconds. This document gets **more concise over time,
> never longer**; historical detail lives in [`../ROADMAP.md`](../ROADMAP.md),
> [`DECISIONS.md`](DECISIONS.md), and git history, never duplicated here.

## Executive Summary
- **Platform:** Multi-tenant SaaS Operations Platform
- **Stage:** Alpha
- **Current Milestone:** Complete Version 1
- **Current Objective:** Close consistency-report findings, then finish remaining V1 features
- **Project Health:** 🟢 On Track — consistency-report findings (H1/H2/M1) closed, and all three held engineering items delivered (test suite, Sentry, lifecycle model). Paused at founder's direction; one founder action open (apply `0018`). No blockers.

## Current Milestone
- **Objective:** Ship a feature-complete, real-customer-ready Version 1.
- **Current focus:** Held items and consistency findings done; paused before the remaining V1 features (invitations, rebalancing, notifications) pending founder go-ahead.
- **Estimated completion:** Several small/medium items remain; no fixed date yet.

## Current Priorities
_Paused at founder's direction — awaiting go-ahead before resuming feature work._
1. Invitation UI → cross-location rebalancing → assignments/reminders/notifications
2. Stand up staging/production separation ahead of real onboarding

_Consistency-report findings closed: H1 destructive-action gating ✓ (`0016`), H2 timezone ✓, M1 dead code ✓. Held-items batch delivered: permanent test suite ✓, Sentry (dormant) ✓, practice-lifecycle model ✓ (`0017` applied & verified; `0018` status-lockdown approved, awaiting apply)._

## Founder Decisions Needed
- **Pricing** — still undecided, still approaching relevance

## Design Partner
**Status:** Preparing initial onboarding. Not yet signed up — waiting on V1 completion and the staging/production split.

## Current Metrics
- **Practices:** 0 live (1 permanent internal test practice)
- **Design Partners:** 0
- **Active Users:** 0
- **Core V1 Completion:** ~88%
- **Production Incidents:** 0

## Currently In Progress
- **Nothing in flight — paused at founder's direction.** The one open action is on the founder: apply migration `0018` (tenant status-write lockdown); on apply, a quick probe confirms the lockdown is live. Then held for go-ahead before any new feature work.

## Next Planned Work
See [`../ROADMAP.md`](../ROADMAP.md). Headline: held items released as a batch → invitation UI → rebalancing → notifications → staging/production split.

## Current Blockers
No current blockers.

## Technical Stack
React · Supabase (Postgres/Auth/Storage) · GitHub · Netlify. Business logic lives in Postgres by design — see [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md).

## Planned Integrations
Stripe · PostHog · Sentry · Email service — see [`INTEGRATIONS.md`](INTEGRATIONS.md).

## Important Decisions
See [`DECISIONS.md`](DECISIONS.md). Newest: practice-lifecycle status model (ADR [`0007`](decisions/0007-practice-lifecycle.md)) — `status` gate via `current_practice_id()`, full-freeze suspension (read-only deferred), offboarding replaces hard-delete (resolves M3), new practices default to `active`. Prior: full-repository consistency report completed ([`CONSISTENCY_REPORT.md`](CONSISTENCY_REPORT.md)) — zero critical findings, tenant isolation confirmed intact; role model stays deferred (ADR [`0006`](decisions/0006-role-model-deferred.md)) with an interim destructive-action gate now applied and verified (migration `0016`, role-dimension isolation test passed).

## Next Recommended Founder Review
Pricing.
