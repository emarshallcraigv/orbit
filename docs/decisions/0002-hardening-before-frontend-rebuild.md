# 0002 — Hardening pass before the Supabase frontend rewiring begins

**Context:** the project was renamed/reframed from a single orthodontic practice's
internal tool to PracticeOS, a multi-tenant SaaS for dental practices generally. Before
letting Claude Code build the frontend on top of the schema in `0001_init.sql`, that
schema was reviewed against the actual commitments already made (every staff member
gets a real login; this is being sold to other businesses) rather than assumed correct
by default.

## What was found, and the decision made for each

**1. Free-text "who did this" fields.** `checks.staff_name`, `shipments.received_by`,
`transfers.received_by`, and `queue_entries.staff_name` were all plain text, dating
from a version with no login system. Since every staff member now has a real account,
letting "who did this" remain an arbitrary typed string throws away accountability the
system could otherwise have for free.
**Decision:** add `performed_by uuid references profiles(id)` alongside each; mark the
old text columns deprecated rather than dropping them immediately, since real data may
exist by the time this runs. Drop them in a later migration once the frontend writes
`performed_by` exclusively.

**2. `staff_members` table duplicates `profiles`.** It was a simple name-picklist for
a no-login system. It now overlaps with `profiles` (which already has practice_id and
role) and would drift out of sync with real accounts if kept.
**Decision:** drop it. No frontend code touches Supabase yet, so nothing depends on it.

**3. No room to add a per-practice setting without a migration.** Every future toggle
(a feature flag, a UI preference, a custom split-weighting config) would otherwise mean
a schema change.
**Decision:** add `practices.settings jsonb default '{}'`.

**4. Dates computed against the database server's clock, not the practice's own.** A
practice outside the server's timezone could see a checkin logged as the wrong day near
midnight. Minor today, a real bug once this serves practices across timezones.
**Decision:** add `practices.timezone`, defaulting to `America/New_York` (matches the
first real practice this will run for). The frontend/queries should use this instead of
raw `current_date` once that wiring happens.

**5. No audit trail.** `checks` intentionally overwrites in place - that's correct, it's
what makes "one persistent row per item+location" work instead of duplicating a tab
every month. But it means history is lost, and "why does this number look wrong" /
"who changed this" are real support questions for a paid product.
**Decision:** add a generic `activity_log` table (practice_id, actor, action,
entity_type, entity_id, detail jsonb) rather than a bespoke history table per entity.
Insert-only by policy - deliberately no update/delete policy, since an editable audit
log isn't one.

**6. Join codes can't target a specific person or be revoked individually.** Fine for
an MVP. Not fine for "self-serve signup, sell to strangers" - anyone with the code can
join as staff, and revoking access means regenerating the whole practice's code.
**Decision:** add an `invitations` table (specific email, specific role, a token,
expiry, revocable status) plus an `accept_invitation()` function. Join codes aren't
removed - they're still the simplest path for an owner onboarding their own staff in
person. Invitations are the upgrade path for inviting someone by email, once Resend is
wired in.

## Explicitly deferred, and why

- **Billing/subscriptions** - no pricing model or requirements defined yet; building
  tables for it now would be speculative.
- **Actually sending invitation emails** - the `invitations` table and
  `accept_invitation()` function are ready; wiring real delivery needs Resend, which is
  intentionally a later phase.
- **Per-practice custom shipment-split weighting** - `practices.settings` can hold this
  once the frontend rewrite reaches that point; no need to design the exact shape of
  that config before the UI that would use it exists.
