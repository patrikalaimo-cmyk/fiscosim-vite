-- INSECURE rollback of Stage3E; ONLY detached local P0 QA Docker.
-- Restores former public TRUE policies. NEVER use in real Supabase.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3e_rollback_approval',true)
   IS DISTINCT FROM 'unsafe-p0-lab-rollback-only' THEN
  RAISE EXCEPTION 'Stage3E rollback local-only approval missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename='fatture_xml'
  AND policyname='p0_xml_company_member_all_lab_only')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename='coda_import_fatture'
  AND policyname='p0_import_queue_company_member_all_lab_only') THEN
  RAISE EXCEPTION 'Stage3E expected policies not installed';
 END IF;
END $gate$;
DROP POLICY p0_xml_company_member_all_lab_only ON public.fatture_xml;
DROP POLICY p0_import_queue_company_member_all_lab_only ON public.coda_import_fatture;
CREATE POLICY allow_all_fatture_xml ON public.fatture_xml
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_coda ON public.coda_import_fatture
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY allow_all_coda_import ON public.coda_import_fatture
 FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
COMMIT;
