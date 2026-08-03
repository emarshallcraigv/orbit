-- ============================================================================
-- PracticeOS — architecture hardening pass, before the Supabase frontend wiring
-- begins. See docs/decisions/0002-hardening-before-frontend-rebuild.md for the
-- full reasoning. Summary of what changes and why:
--
--   1. staff_name / received_by (free text) -> performed_by (real profiles.id)
--      Every staff member now has a real login, so "who did this" should be a
--      real fact, not a typed string.
--   2. staff_members table dropped - superseded by profiles + practice_id.
--   3. practices.settings jsonb added - room for per-practice config without
--      a migration for every new toggle.
--   4. practices.timezone added - so "what day is this" is computed against
--      the practice's own clock, not the database server's.
--   5. activity_log table added - a generic, append-only audit trail.
--   6. invitations table added - targeted, revocable, role-specific invites,
--      as an upgrade path from the join-code-only model (join codes still work
--      for the simple case; invitations are for "invite this specific person").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 & 2: real accountability instead of free-text names
-- ---------------------------------------------------------------------------
alter table checks add column performed_by uuid references profiles(id);
alter table shipments add column performed_by uuid references profiles(id);
alter table transfers add column performed_by uuid references profiles(id);
alter table queue_entries add column performed_by uuid references profiles(id);

comment on column checks.staff_name is 'Deprecated - use performed_by. Kept temporarily for any in-flight data during the frontend rewiring; drop once the app writes performed_by exclusively.';
comment on column shipments.received_by is 'Deprecated - use performed_by. See checks.staff_name comment.';
comment on column transfers.received_by is 'Deprecated - use performed_by. See checks.staff_name comment.';
comment on column queue_entries.staff_name is 'Deprecated - use performed_by. See checks.staff_name comment.';

drop policy if exists "select own practice rows" on staff_members;
drop policy if exists "insert own practice rows" on staff_members;
drop policy if exists "update own practice rows" on staff_members;
drop policy if exists "delete own practice rows" on staff_members;
drop table if exists staff_members;

-- ---------------------------------------------------------------------------
-- 3 & 4: room to grow without a migration per setting, and timezone-aware dates
-- ---------------------------------------------------------------------------
alter table practices add column settings jsonb not null default '{}'::jsonb;
alter table practices add column timezone text not null default 'America/New_York';

-- ---------------------------------------------------------------------------
-- 5: generic audit trail. One table instead of a bespoke history table per
-- entity - "what happened, who did it, when" for support and compliance.
-- ---------------------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  actor_id uuid references profiles(id),
  action text not null,        -- e.g. 'check.updated', 'shipment.received', 'transfer.confirmed'
  entity_type text not null,   -- e.g. 'item', 'shipment', 'transfer', 'queue_entry'
  entity_id uuid,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table activity_log enable row level security;

create policy "select own practice activity" on activity_log
  for select using (practice_id = current_practice_id());
create policy "insert own practice activity" on activity_log
  for insert with check (practice_id = current_practice_id());
-- No update/delete policy on purpose - an audit log that can be edited after
-- the fact isn't much of an audit log.

-- ---------------------------------------------------------------------------
-- 6: targeted, revocable invitations (upgrade path from join-code-only)
-- ---------------------------------------------------------------------------
create table invitations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references practices(id) on delete cascade not null,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  invited_by uuid references profiles(id),
  token uuid not null default gen_random_uuid(),
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Revoked', 'Expired')),
  expires_at timestamptz default (now() + interval '14 days'),
  created_at timestamptz default now()
);

alter table invitations enable row level security;

create policy "select own practice invitations" on invitations
  for select using (practice_id = current_practice_id());
create policy "owner/admin manage invitations" on invitations
  for insert with check (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));
create policy "owner/admin update invitations" on invitations
  for update using (practice_id = current_practice_id() and current_user_role() in ('owner', 'admin'));

-- Accepting an invite: given a valid token, attach the caller's profile to that
-- practice/role and mark the invite used. Security-definer so a brand new user
-- (who isn't a practice member yet) can still call it.
create or replace function accept_invitation(invite_token uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  inv record;
begin
  select * into inv from invitations
    where token = invite_token and status = 'Pending' and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  update profiles set practice_id = inv.practice_id, role = inv.role where id = auth.uid();
  update invitations set status = 'Accepted' where id = inv.id;

  return inv.practice_id;
end;
$$;
