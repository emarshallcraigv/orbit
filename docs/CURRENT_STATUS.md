# Current Status

**Last updated:** August 6, 2026

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
1. Invitation UI → cross-location rebalancing → notifications → staging/production split.

_Delivered: consistency findings H1/H2/M1 ✓; held-items batch (test suite, Sentry, lifecycle model) ✓; Batches 1–3 ✓ (UI polish + frozen-join guard; permission-tightening + role management; `user_locations` foundation). Migrations `0018`–`0021` all confirmed applied and verified on the live DB._

## Founder Decisions Needed
- **Pricing** — still undecided, still approaching relevance

## Design Partner
**Status:** Preparing initial onboarding. Not yet signed up — waiting on V1 completion and the staging/production split.

## Current Metrics
- **Practices:** 0 live (1 permanent internal test practice)
- **Design Partners:** 0
- **Active Users:** 0
- **Core V1 Completion:** ~90%
- **Production Incidents:** 0

## Currently In Progress
- **Nothing in flight — Batches 1–3 all delivered and verified live.** Next workstream (invitation UI) not yet started; awaiting go-ahead.
- Integration suite (live): delete-gating, role-management, tenant isolation, `user_locations` all pass; lifecycle skips without a service key. Cascade-ordering covered by the local-Postgres harness (`tests/local-pg`).
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
