-- DANGEROUS P0 Stage3M rollback: reopens the old unscoped browser DML!
-- TEST ONLY in isolated Docker lab. Never apply to production.
-- Restores the observed Stage3L table grants, not corrected RLS policies.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $gate$
DECLARE t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3m_rollback_approval',true)
    IS DISTINCT FROM 'unsafe-lab-restore-six-browser-acls' THEN
  RAISE EXCEPTION 'Stage3M dangerous rollback not approved';
 END IF;
 FOREACH t IN ARRAY ARRAY[
  'client_modules','client_responsabili','invii_log',
  'test_cases','test_datasets','test_runs'
 ] LOOP
  IF has_table_privilege('authenticated',format('public.%I',t),'SELECT')
   OR has_table_privilege('anon',format('public.%I',t),'SELECT') THEN
   RAISE EXCEPTION 'Stage3M quarantine not active: %',t;
  END IF;
 END LOOP;
END $gate$;
GRANT ALL PRIVILEGES ON TABLE
 public.client_modules, public.client_responsabili, public.invii_log,
 public.test_cases, public.test_datasets, public.test_runs
 TO authenticated;
GRANT ALL PRIVILEGES ON TABLE
 public.client_modules, public.client_responsabili TO anon;
COMMIT;
