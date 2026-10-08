-- FiscoSim P0 Stage3J: quarantine UNMAPPED legacy studio family.
-- LAB ONLY. Explicitly disables browser access to the six legacy tables.
-- NOTE: this intentionally makes legacy F24/IVA browser UIs unavailable.
-- No data row updates, no backfills, no assumed relation to public.societa.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

DO $guard$
DECLARE t text; n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3j_approval',true)
    IS DISTINCT FROM 'local-legacy-six-table-quarantine' THEN
  RAISE EXCEPTION 'Stage3J LAB-only approval missing';
 END IF;
 FOREACH t IN ARRAY ARRAY[
   'studios','users','clients','f24_scadenze','f24_righe','liquidazioni_iva'
 ] LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relname=t
      AND c.relkind IN ('r','p') AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Stage3J expected legacy RLS table missing: %',t;
  END IF;
  IF NOT has_table_privilege('authenticated',format('public.%I',t),'SELECT')
      OR NOT has_table_privilege('authenticated',format('public.%I',t),'INSERT')
      OR NOT has_table_privilege('authenticated',format('public.%I',t),'UPDATE')
      OR NOT has_table_privilege('authenticated',format('public.%I',t),'DELETE')
  THEN
    RAISE EXCEPTION 'Stage3J baseline privilege mismatch: %',t;
  END IF;
  IF NOT has_table_privilege('service_role',format('public.%I',t),'SELECT')
      OR NOT has_table_privilege('service_role',format('public.%I',t),'INSERT')
      OR NOT has_table_privilege('service_role',format('public.%I',t),'UPDATE')
      OR NOT has_table_privilege('service_role',format('public.%I',t),'DELETE')
  THEN
    RAISE EXCEPTION 'Stage3J server role must retain DML: %',t;
  END IF;
 END LOOP;
 SELECT count(*) INTO n FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN (
  'f24_scadenze','f24_righe','liquidazioni_iva'
 ) AND column_name='studio_id' AND is_nullable='YES';
 IF n<>3 THEN
  RAISE EXCEPTION 'Stage3J legacy nullable studio_id prerequisites changed';
 END IF;
 SELECT count(*) INTO n FROM pg_constraint co
 JOIN pg_class c ON co.conrelid=c.oid
 JOIN pg_class parent ON co.confrelid=parent.oid
 JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND co.contype='f'
 AND c.relname IN ('f24_scadenze','f24_righe','liquidazioni_iva')
 AND parent.relname='studios' AND
     pg_get_constraintdef(co.oid) LIKE 'FOREIGN KEY (studio_id)%';
 IF n<>3 THEN
  RAISE EXCEPTION 'Stage3J unexpected legacy foreign-key mapping';
 END IF;
END $guard$;

REVOKE ALL PRIVILEGES ON TABLE
 public.studios, public.users, public.clients,
 public.f24_scadenze, public.f24_righe, public.liquidazioni_iva
 FROM authenticated, anon, PUBLIC;

DO $verify$
DECLARE t text; op text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
   'studios','users','clients','f24_scadenze','f24_righe','liquidazioni_iva'
 ] LOOP
  FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
   IF has_table_privilege('authenticated',format('public.%I',t),op)
      OR has_table_privilege('anon',format('public.%I',t),op) THEN
    RAISE EXCEPTION 'Stage3J browser privilege remains on %.%',t,op;
   END IF;
  END LOOP;
  FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
   IF NOT has_table_privilege('service_role',format('public.%I',t),op) THEN
    RAISE EXCEPTION 'Stage3J server privilege lost on %.%',t,op;
   END IF;
  END LOOP;
 END LOOP;
END $verify$;
COMMIT;
