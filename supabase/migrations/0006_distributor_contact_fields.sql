-- ============================================================================
-- 0006 — Distributor directory: contact + account fields
-- ============================================================================
-- The distributors table started as a bare pick-list (id, practice_id, name).
-- Practices need it to be a real directory: who to contact, the practice's own
-- account code with that vendor, the sales rep, where to send orders, etc.
--
-- All columns are nullable text — only the name is required, everything else is
-- optional detail a practice fills in over time. RLS already scopes distributors
-- per practice (0001), so no policy changes are needed. `if not exists` makes
-- this safe to re-run.
-- ============================================================================

alter table distributors add column if not exists phone          text;
alter table distributors add column if not exists account_number text;  -- the practice's customer/account # with this distributor
alter table distributors add column if not exists rep_name       text;
alter table distributors add column if not exists rep_phone      text;
alter table distributors add column if not exists rep_email      text;
alter table distributors add column if not exists order_email    text;  -- where this practice sends orders
alter table distributors add column if not exists website_url    text;
alter table distributors add column if not exists notes          text;
