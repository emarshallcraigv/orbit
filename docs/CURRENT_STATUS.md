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
1. **Batch 2** — owner/admin gating on locations/categories create/edit + member role management + never-zero-owners (`0020`, RLS text under review, awaiting apply).
2. **Batch 3** — `user_locations` foundation table (deliberately inert).
3. Then: invitation UI → cross-location rebalancing → notifications → staging/production split.

_Delivered: consistency findings H1/H2/M1 ✓; held-items batch (test suite, Sentry, lifecycle model) ✓; Batch 1 UI items ✓ (`9b052e8`). Migrations awaiting founder apply: `0018` (status lockdown), `0019` (frozen-join guard), `0020` (Batch 2)._

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
- **Batch 2** — code + docs + isolation test done and building clean; migration `0020` (RLS + role-management RPC + last-owner trigger + column lockdown) brought for review, awaiting founder apply. On apply: run `role_management` isolation test (staff blocked from create/edit + self-escalation, last-owner rule holds).
- **Batch 3** — `user_locations` foundation table + ADR: next.
- Founder apply queue: `0018`, `0019`, `0020`.

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
