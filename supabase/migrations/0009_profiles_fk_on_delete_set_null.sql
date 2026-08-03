-- ============================================================================
-- 0009 — ON DELETE SET NULL on the profiles(id) back-references
-- ============================================================================
-- These columns reference profiles(id) with NO on-delete behavior specified
-- (default NO ACTION), so any row that references a profile BLOCKS deleting that
-- profile / user. A real "remove a departed staff member from an ongoing
-- practice" hits exactly this wall — proven live during test-data cleanup, where
-- shipments.performed_by blocked deleting a user until the whole practice was
-- deleted first. A departed staff member in a real practice has no such rescue.
-- This is the gap the 0002 hardening decision doc anticipated.
--
-- Fix: recreate each FK with ON DELETE SET NULL. All six columns are nullable,
-- so this is safe: deleting a profile nulls the attribution on those rows (the
-- rows and their history survive; that one action's actor simply becomes
-- unknown). The activity_log rows remain as the durable audit trail regardless.
--
-- Each constraint is DISCOVERED by (table, column -> profiles) rather than by an
-- assumed name, then dropped and re-added. Constraint names can't be verified
-- from the app layer, and assuming a name that turns out wrong would silently
-- no-op the drop and leave the old blocking FK in place — so we look it up.
-- ============================================================================

do $$
declare
  rec record;
begin
  for rec in
    select rel.relname   as tbl,
           att.attname   as col,
           con.conname   as current_name
    from pg_constraint con
    join pg_class      rel    on rel.oid = con.conrelid
    join pg_namespace  ns     on ns.oid = rel.relnamespace
    join pg_class      refrel on refrel.oid = con.confrelid
    join pg_namespace  refns  on refns.oid = refrel.relnamespace
    join pg_attribute  att    on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and array_length(con.conkey, 1) = 1            -- single-column FKs only
      and ns.nspname = 'public'
      and refns.nspname = 'public'
      and refrel.relname = 'profiles'
      and (rel.relname, att.attname) in (
        ('shipments',     'performed_by'),
        ('checks',        'performed_by'),
        ('transfers',     'performed_by'),
        ('queue_entries', 'performed_by'),
        ('activity_log',  'actor_id'),
        ('invitations',   'invited_by')
      )
  loop
    execute format('alter table public.%I drop constraint %I', rec.tbl, rec.current_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      rec.tbl, rec.tbl || '_' || rec.col || '_fkey', rec.col
    );
    raise notice 'Recreated FK on %.% (was %) with ON DELETE SET NULL', rec.tbl, rec.col, rec.current_name;
  end loop;
end $$;
