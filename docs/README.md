# Baybridge Documentation

The documentation system. Product/vision docs describe intent; technical docs
describe what is **actually built**; process docs codify how we work.

**Start here:** [`CURRENT_STATUS.md`](CURRENT_STATUS.md) — the operational heartbeat;
the whole company's current state in under 60 seconds.

## Product & vision
- [`FOUNDER.md`](FOUNDER.md) — founder context. ⚠️ *placeholder — awaiting verbatim content.*
- [`PRODUCT_VISION.md`](PRODUCT_VISION.md) — canonical vision. ⚠️ *placeholder — awaiting verbatim content.*
- [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md) — customer-value phases (1–5).
- [`MVP_REQUIREMENTS.md`](MVP_REQUIREMENTS.md) — MVP scope, launch & success criteria.
- [`CUSTOMER_PROBLEMS.md`](CUSTOMER_PROBLEMS.md) — real problems, seeded from this project's history.
- [`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) — mission (working), voice, tone, identity.

## Technical (as built)
- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) — stack, structure, where logic lives.
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — the schema across 15 migrations.
- [`SECURITY.md`](SECURITY.md) — RLS, invoker/definer, Storage, secrets.

## Process & operations
- [`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md) — review, testing, cadence discipline.
- [`UI_UX_GUIDELINES.md`](UI_UX_GUIDELINES.md) — the design system.
- [`DECISIONS.md`](DECISIONS.md) — ADR template + index ([`decisions/`](decisions/)).
- [`CHANGELOG.md`](CHANGELOG.md) — release-log template (pre-1.0).
- [`CUSTOMER_ONBOARDING.md`](CUSTOMER_ONBOARDING.md) — the funnel, built vs gaps.
- [`INTEGRATIONS.md`](INTEGRATIONS.md) — current + future services, sequencing.
- [`ADMIN_PLATFORM.md`](ADMIN_PLATFORM.md) — platform console (design only).

## Review output
- [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md) — project vs. this doc set (what's *missing*); next three sprints.
- [`CONSISTENCY_REPORT.md`](CONSISTENCY_REPORT.md) — what's *built that contradicts* a documented principle (Critical/High/Medium/Low); reconciled with the gap analysis.

## Related (repo root)
- [`../ROADMAP.md`](../ROADMAP.md) — the live, granular engineering sequence (V1–V4).
- [`../STAGING.md`](../STAGING.md) — staging/production split plan.
- `../supabase/migrations/` — the source of truth for the schema.
