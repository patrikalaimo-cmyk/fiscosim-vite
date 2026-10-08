-- FiscoSim P0 Stage3M: six-table browser privilege quarantine.
-- LAB ONLY, never production. No row changes, no policy deletion.
-- Scope: legacy clients linkage (2), unused direct-send log (1),
-- and public SQL testing framework tables (3).
-- Operational avvisi_ade and revisioni_dichiarativi are NOT modified.
-- Existing policies stay in the catalog for auditable rollback;
-- revoked table+column ACL makes them unreachable via browser roles.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

DO $gate$
DECLARE
 t text;
 pname text;
 condition text;
 target_role text;
 n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3m_approval',true)
   IS DISTINCT FROM 'isolated-six-table-browser-quarantine-only' THEN
  RAISE EXCEPTION 'Stage3M LAB opt-in missing';
 END IF;

 FOR t,pname,condition,target_role IN
  SELECT * FROM (VALUES
   ('client_modules','Allow authenticated','auth','public'),
   ('client_responsabili','Allow authenticated','auth','public'),
   ('invii_log','allow_all_log','true','public'),
   ('test_cases','allow_all_test_cases','true','public'),
   ('test_datasets','allow_all_test_datasets','true','public'),
   ('test_runs','allow_all_test_runs','true','public')
  ) x(t,pname,condition,target_role)
 LOOP
  IF NOT EXISTS(
   SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relname=t
     AND c.relkind IN ('r','p') AND c.relrowsecurity
  ) THEN
   RAISE EXCEPTION 'Stage3M missing RLS table: %',t;
  END IF;
  SELECT count(*) INTO n FROM pg_policies p WHERE p.schemaname='public'
   AND p.tablename=t AND p.policyname=pname AND p.cmd='ALL'
   AND p.permissive='PERMISSIVE' AND target_role=ANY(p.roles)
   AND (
      (condition='auth' AND p.qual LIKE '%auth.role()%')
      OR
      (condition='true' AND lower(btrim(p.qual))='true'
          AND lower(btrim(p.with_check))='true')
   );
  IF n<>1 THEN
   RAISE EXCEPTION 'Stage3M unexpected policy baseline: % (% matches)',t,n;
  END IF;
  IF NOT has_table_privilege('authenticated',format('public.%I',t),'SELECT')
    OR NOT has_table_privilege('authenticated',format('public.%I',t),'INSERT')
    OR NOT has_table_privilege('authenticated',format('public.%I',t),'UPDATE')
    OR NOT has_table_privilege('authenticated',format('public.%I',t),'DELETE') THEN
   RAISE EXCEPTION 'Stage3M authenticated baseline already changed: %',t;
  END IF;
  IF NOT has_table_privilege('service_role',format('public.%I',t),'SELECT')
    OR NOT has_table_privilege('service_role',format('public.%I',t),'INSERT')
    OR NOT has_table_privilege('service_role',format('public.%I',t),'UPDATE')
    OR NOT has_table_privilege('service_role',format('public.%I',t),'DELETE') THEN
   RAISE EXCEPTION 'Stage3M service_role DML baseline missing: %',t;
  END IF;
 END LOOP;
 IF NOT has_table_privilege('anon','public.client_modules','SELECT')
   OR NOT has_table_privilege('anon','public.client_responsabili','SELECT') THEN
   RAISE EXCEPTION 'Stage3M expected two legacy anonymous ACLs missing';
 END IF;

 -- Ensure operational modules retain their pre-patch browser ACL.
 IF NOT has_table_privilege('authenticated','public.avvisi_ade','SELECT')
   OR NOT has_table_privilege('authenticated','public.revisioni_dichiarativi','SELECT')
   OR NOT has_table_privilege('authenticated','public.avvisi_ade','INSERT')
   OR NOT has_table_privilege('authenticated','public.revisioni_dichiarativi','INSERT') THEN
    RAISE EXCEPTION 'Stage3M main operational module baseline mismatch';
 END IF;
END $gate$;

REVOKE ALL PRIVILEGES ON TABLE
 public.client_modules,
 public.client_responsabili,
 public.invii_log,
 public.test_cases,
 public.test_datasets,
 public.test_runs
FROM authenticated, anon, PUBLIC;

DO $verify$
DECLARE t text; operation text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'client_modules','client_responsabili','invii_log',
  'test_cases','test_datasets','test_runs'
 ] LOOP
  FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
   IF has_table_privilege('authenticated',format('public.%I',t),operation)
      OR has_table_privilege('anon',format('public.%I',t),operation) THEN
    RAISE EXCEPTION 'Stage3M browser table ACL remains: % %',t,operation;
   END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=t AND
    (
      has_column_privilege('authenticated',format('public.%I',t),c.column_name,'SELECT')
      OR has_column_privilege('authenticated',format('public.%I',t),c.column_name,'INSERT')
      OR has_column_privilege('authenticated',format('public.%I',t),c.column_name,'UPDATE')
      OR has_column_privilege('anon',format('public.%I',t),c.column_name,'SELECT')
      OR has_column_privilege('anon',format('public.%I',t),c.column_name,'INSERT')
      OR has_column_privilege('anon',format('public.%I',t),c.column_name,'UPDATE')
    )
  ) THEN
    RAISE EXCEPTION 'Stage3M browser column ACL remains: %',t;
  END IF;
  FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
   IF NOT has_table_privilege('service_role',format('public.%I',t),operation) THEN
    RAISE EXCEPTION 'Stage3M service_role privilege lost: % %',t,operation;
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_table_privilege('authenticated','public.avvisi_ade','SELECT')
   OR NOT has_table_privilege('authenticated','public.revisioni_dichiarativi','SELECT')
   OR NOT has_table_privilege('authenticated','public.avvisi_ade','INSERT')
   OR NOT has_table_privilege('authenticated','public.revisioni_dichiarativi','INSERT') THEN
   RAISE EXCEPTION 'Stage3M AgeCon/revision browser grants changed';
 END IF;
END $verify$;
COMMIT;
