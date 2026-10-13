-- SG-P0-04 LIVE class D — authorized 2026-10-13 (operator: approvo continua)
-- Drop allow_all on test_* only; deny authenticated. No fiscal tables.
BEGIN;

DROP POLICY IF EXISTS allow_all_test_cases ON public.test_cases;
DROP POLICY IF EXISTS allow_all_test_datasets ON public.test_datasets;
DROP POLICY IF EXISTS allow_all_test_runs ON public.test_runs;

DO $body$
BEGIN
  IF to_regclass('public.test_cases') IS NOT NULL THEN
    BEGIN
      CREATE POLICY test_cases_deny_authenticated ON public.test_cases
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.test_datasets') IS NOT NULL THEN
    BEGIN
      CREATE POLICY test_datasets_deny_authenticated ON public.test_datasets
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.test_runs') IS NOT NULL THEN
    BEGIN
      CREATE POLICY test_runs_deny_authenticated ON public.test_runs
        FOR ALL TO authenticated USING (false) WITH CHECK (false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$body$;

DO $v$
DECLARE bad int;
BEGIN
  SELECT count(*)::int INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('test_cases', 'test_datasets', 'test_runs')
    AND (lower(btrim(coalesce(qual, ''))) = 'true' OR lower(btrim(coalesce(with_check, ''))) = 'true');
  IF bad > 0 THEN
    RAISE EXCEPTION 'class D LIVE failed: % true policies remain on test_*', bad;
  END IF;
END
$v$;

COMMIT;
