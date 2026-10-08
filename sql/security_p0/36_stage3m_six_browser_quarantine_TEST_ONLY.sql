-- Stage3M negative ACL tests on six isolated legacy/test tables.
-- LAB ONLY. Performs only LIMIT 0 and WHERE false under browser SQL roles.
-- Outer transaction always ROLLBACK; no row data is touched or returned.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3m_test_approval',true)
   IS DISTINCT FROM 'local-six-browser-negative-test-only' THEN
  RAISE EXCEPTION 'Stage3M test LAB approval missing';
 END IF;
END $gate$;

SET LOCAL ROLE authenticated;
DO $authenticated$
DECLARE t text; stmt text;
BEGIN
 IF current_user<>'authenticated' THEN
  RAISE EXCEPTION 'Stage3M incorrect test role';
 END IF;
 FOREACH t IN ARRAY ARRAY[
  'client_modules','client_responsabili','invii_log',
  'test_cases','test_datasets','test_runs'
 ] LOOP
  FOREACH stmt IN ARRAY ARRAY[
   format('SELECT id FROM public.%I LIMIT 0',t),
   format('INSERT INTO public.%I (id) SELECT NULL::uuid WHERE false',t),
   format('UPDATE public.%I SET id=id WHERE false',t),
   format('DELETE FROM public.%I WHERE false',t)
  ] LOOP
   BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'SECURITY FAILURE authenticated allowed operation: %',stmt;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS: authenticated denied SELECT/INSERT/UPDATE/DELETE across six tables';
END $authenticated$;

SET LOCAL ROLE anon;
DO $anonymous$
DECLARE t text; stmt text;
BEGIN
 IF current_user<>'anon' THEN
  RAISE EXCEPTION 'Stage3M incorrect anonymous role';
 END IF;
 FOREACH t IN ARRAY ARRAY[
  'client_modules','client_responsabili','invii_log',
  'test_cases','test_datasets','test_runs'
 ] LOOP
  FOREACH stmt IN ARRAY ARRAY[
   format('SELECT id FROM public.%I LIMIT 0',t),
   format('INSERT INTO public.%I (id) SELECT NULL::uuid WHERE false',t),
   format('UPDATE public.%I SET id=id WHERE false',t),
   format('DELETE FROM public.%I WHERE false',t)
  ] LOOP
   BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'SECURITY FAILURE anon allowed operation: %',stmt;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS: anon denied SELECT/INSERT/UPDATE/DELETE across six tables';
END $anonymous$;
ROLLBACK;
