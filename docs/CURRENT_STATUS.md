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
- **Project Health:** 🟢 On Track — working through three founder-approved batches (small UI items; permission-tightening; a foundation table). No blockers; a few migrations await founder apply.

## Current Milestone
- **Objective:** Ship a feature-complete, real-customer-ready Version 1.
- **Current focus:** Three batches — Batch 1 (UI polish + frozen-join guard), Batch 2 (owner/admin permission-tightening + role management), Batch 3 (`user_locations` foundation).
- **Estimated completion:** Several small/medium items remain; no fixed date yet.

## Current Priorities
1. **Batch 3** — `user_locations` foundation table (deliberately inert) + ADR.
2. Then: invitation UI → cross-location rebalancing → notifications → staging/production split.

_Delivered: consistency findings H1/H2/M1 ✓; held-items batch (test suite, Sentry, lifecycle model) ✓; Batch 1 UI items ✓ (`9b052e8`); Batch 2 permission-tightening ✓ (`0020` live + verified). Migrations `0018`/`0019`/`0020` all confirmed applied on the live DB._

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
- **Batch 3** — `user_locations` foundation table + ADR: next.
- **Batch 2 delivered & verified LIVE:** `0020` confirmed applied (direct 9/9 probe of all four pieces), `role_management` integration test passes live, staff read-only view verified in-browser, cascade-ordering test wired as a local-Postgres harness (`tests/local-pg`, 3/3). `0018`/`0019`/`0020` all confirmed live on the DB.
- Open thread: `accept_invitation`'s frozen-path is inferred-live (same `0019` apply as the confirmed join guard) — to be probed directly at the first natural opportunity.

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
