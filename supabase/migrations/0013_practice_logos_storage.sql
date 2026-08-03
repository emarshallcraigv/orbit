-- ============================================================================
-- 0013 — Practice logo storage: private bucket + per-practice access policies
-- ============================================================================
-- First use of Supabase Storage. Objects live in storage.objects and are
-- governed by RLS on that table exactly like our tenant tables, so a bad policy
-- here can leak/overwrite one practice's logo to another the same way a bad
-- table policy could leak data. This is designed and reviewed with the same
-- weight as any schema migration.
--
-- Model:
-- * Bucket 'practice-logos' is PRIVATE (public => false): there is no
--   unauthenticated read path at all; the app renders a logo via a short-lived
--   SIGNED URL, which itself goes through the read policy below.
-- * Object path is `{practice_id}/logo-<timestamp>.<ext>` — the practice_id is
--   the FIRST path segment, and every policy keys off (storage.foldername(name))[1].
--   An object not under a practice-id folder matches NO policy, so it can never
--   be created (the insert policy blocks it) and thus never exists to be read.
-- * Read: any signed-in member of the practice, own folder only.
-- * Insert/Update/Delete: own folder AND owner/admin only — mirrors the existing
--   practices-table UPDATE policy that already gates who may change
--   primary_color/accent_color, rather than inventing a new rule.
-- * Raster-only (png/jpeg/webp), 2 MB cap, enforced at the bucket. SVG is
--   excluded on purpose: inline SVG can carry <script> (stored-XSS vector).
--
-- practices.logo_path stores the object path (distinct from logo_url, which
-- stays for static/external logos like Mann's /logo.jpg). The app resolves the
-- header logo in order: signed(logo_path) -> logo_url -> Baybridge default.
-- ============================================================================

-- Private, raster-only, 2 MB bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-logos', 'practice-logos', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Read: signed-in member of the practice, own folder only.
drop policy if exists "logos: read own practice" on storage.objects;
create policy "logos: read own practice"
on storage.objects for select to authenticated
using ( bucket_id = 'practice-logos'
        and (storage.foldername(name))[1] = (current_practice_id())::text );

-- Insert: own folder, owner/admin only.
drop policy if exists "logos: insert own practice (owner/admin)" on storage.objects;
create policy "logos: insert own practice (owner/admin)"
on storage.objects for insert to authenticated
with check ( bucket_id = 'practice-logos'
             and (storage.foldername(name))[1] = (current_practice_id())::text
             and current_user_role() in ('owner', 'admin') );

-- Update: own folder, owner/admin only.
drop policy if exists "logos: update own practice (owner/admin)" on storage.objects;
create policy "logos: update own practice (owner/admin)"
on storage.objects for update to authenticated
using ( bucket_id = 'practice-logos'
        and (storage.foldername(name))[1] = (current_practice_id())::text
        and current_user_role() in ('owner', 'admin') );

-- Delete: own folder, owner/admin only.
drop policy if exists "logos: delete own practice (owner/admin)" on storage.objects;
create policy "logos: delete own practice (owner/admin)"
on storage.objects for delete to authenticated
using ( bucket_id = 'practice-logos'
        and (storage.foldername(name))[1] = (current_practice_id())::text
        and current_user_role() in ('owner', 'admin') );

-- Storage object path for the practice's uploaded logo (see resolution order above).
alter table practices add column if not exists logo_path text;
