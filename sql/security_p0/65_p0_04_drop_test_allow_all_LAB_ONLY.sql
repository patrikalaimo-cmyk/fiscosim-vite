-- SG-P0-04 LAB ONLY: drop allow_all on test_* tables (class D).
-- Never run on LIVE without explicit authorization + backup.
-- Container: supabase_db_FiscoSim-P0-LAB-20261008-164658

BEGIN;

DO $$
BEGIN
  IF current_setting('server_version_num', true) IS NULL THEN
    RAISE EXCEPTION 'unexpected session';
  END IF;
END $$;

DROP POLICY IF EXISTS allow_all_test_cases ON public.test_cases;
DROP POLICY IF EXISTS allow_all_test_datasets ON public.test_datasets;
DROP POLICY IF EXISTS allow_all_test_runs ON public.test_runs;

-- Deny-by-default for authenticated if table exists; keep service_role via bypass.
DO $$
BEGIN
  IF to_regclass('public.test_cases') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY test_cases_deny_authenticated ON public.test_cases FOR ALL TO authenticated USING (false) WITH CHECK (false)';
  END IF;
  IF to_regclass('public.test_datasets') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY test_datasets_deny_authenticated ON public.test_datasets FOR ALL TO authenticated USING (false) WITH CHECK (false)';
  END IF;
  IF to_regclass('public.test_runs') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY test_runs_deny_authenticated ON public.test_runs FOR ALL TO authenticated USING (false) WITH CHECK (false)';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('test_cases', 'test_datasets', 'test_runs')
    AND (lower(btrim(coalesce(qual, ''))) = 'true' OR lower(btrim(coalesce(with_check, ''))) = 'true');
  IF bad > 0 THEN
    RAISE EXCEPTION 'P0-04 LAB class D failed: % true policies remain on test_*', bad;
  END IF;
END $$;

COMMIT;
