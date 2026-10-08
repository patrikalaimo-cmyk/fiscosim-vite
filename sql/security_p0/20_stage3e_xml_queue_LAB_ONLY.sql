-- FiscoSim P0 Stage3E: XML invoice/import queue RLS; LOCAL LAB ONLY.
-- Never apply to live, including pending import records with NULL societa_id.
-- Blocks rows without a valid scoped societa; import pipeline must assign one.
-- AUTH users are scoped using existing public.user_has_societa_access(uuid).
-- Owner/admin global-societa fallback is outside scope, not certified multi-studio.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE v record; n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3e_approval',true)
    IS DISTINCT FROM 'p0-local-xml-queue-only' THEN
  RAISE EXCEPTION 'Stage3E requires local-only approval';
 END IF;
 SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles'
   AND policyname IN ('p0_user_roles_self_owner_select_lab_only',
                      'p0_user_roles_owner_manage_lab_only');
 IF n<>2 THEN RAISE EXCEPTION 'Stage3C prerequisite absent'; END IF;
 IF to_regprocedure('public.user_has_societa_access(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Stage3E authorization helper missing';
 END IF;
 FOR v IN SELECT * FROM (VALUES
   ('fatture_xml','allow_all_fatture_xml'),
   ('coda_import_fatture','allow_all_coda')
 ) AS x(tab,policy) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns
     ON ns.oid=c.relnamespace
     WHERE ns.nspname='public' AND c.relname=v.tab
       AND c.relkind='r' AND c.relrowsecurity) THEN
   RAISE EXCEPTION 'Stage3E RLS table missing %',v.tab;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v.tab
       AND column_name='societa_id' AND udt_name='uuid') THEN
   RAISE EXCEPTION 'Stage3E company scope missing %',v.tab;
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename=v.tab
     AND policyname=v.policy AND cmd='ALL'
     AND roles=ARRAY['public']::name[]
     AND lower(btrim(qual))='true' AND lower(btrim(with_check))='true';
  IF n<>1 THEN RAISE EXCEPTION 'Stage3E unexpected broad policy on %',v.tab; END IF;
  IF has_table_privilege('anon','public.'||v.tab,'SELECT') THEN
   RAISE EXCEPTION 'Stage1 anonymous grant still active on %',v.tab;
  END IF;
 END LOOP;
 SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname='public' AND tablename='coda_import_fatture'
    AND policyname='allow_all_coda_import' AND cmd='ALL'
    AND roles=ARRAY['public']::name[]
    AND lower(btrim(qual))='true' AND lower(btrim(with_check))='true';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3E second queue bypass mismatch'; END IF;
 SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname='public' AND tablename='coda_import_fatture';
 IF n<>2 THEN RAISE EXCEPTION 'Stage3E queue policy baseline drift %',n; END IF;
 SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname='public' AND tablename='fatture_xml';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3E XML policy baseline drift %',n; END IF;
END $guard$;

DROP POLICY allow_all_fatture_xml ON public.fatture_xml;
DROP POLICY allow_all_coda ON public.coda_import_fatture;
DROP POLICY allow_all_coda_import ON public.coda_import_fatture;

CREATE POLICY p0_xml_company_member_all_lab_only ON public.fatture_xml
 FOR ALL TO authenticated
 USING (societa_id IS NOT NULL AND public.user_has_societa_access(societa_id))
 WITH CHECK (societa_id IS NOT NULL AND public.user_has_societa_access(societa_id));

CREATE POLICY p0_import_queue_company_member_all_lab_only ON public.coda_import_fatture
 FOR ALL TO authenticated
 USING (societa_id IS NOT NULL AND public.user_has_societa_access(societa_id))
 WITH CHECK (societa_id IS NOT NULL AND public.user_has_societa_access(societa_id));

DO $assert$
DECLARE t text; n integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['fatture_xml','coda_import_fatture'] LOOP
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename=t
     AND (lower(btrim(coalesce(qual,'')))='true'
       OR lower(btrim(coalesce(with_check,'')))='true');
  IF n<>0 THEN RAISE EXCEPTION 'Stage3E broad policy remains on %',t; END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename=t
     AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
     AND qual LIKE '%user_has_societa_access%'
     AND with_check LIKE '%user_has_societa_access%';
  IF n<>1 THEN RAISE EXCEPTION 'Stage3E scoped policy missing on %',t; END IF;
 END LOOP;
END $assert$;
COMMIT;
