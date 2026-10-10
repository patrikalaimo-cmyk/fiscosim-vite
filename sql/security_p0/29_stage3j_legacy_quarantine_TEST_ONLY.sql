-- FiscoSim Stage3J LAB ONLY -- transactional negative SQL probes.
-- Zero row read/write statements; must never touch business data.
BEGIN;
SET LOCAL statement_timeout='20s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3j_test_approval',true)
     IS DISTINCT FROM 'local-legacy-quarantine-test-only' THEN
  RAISE EXCEPTION 'Stage3J test approval required';
 END IF;
END $gate$;
SET LOCAL ROLE authenticated;
DO $tests$
DECLARE t text; stmt text;
BEGIN
 IF current_user<>'authenticated' THEN
  RAISE EXCEPTION 'Stage3J invalid SQL test role';
 END IF;
 FOREACH t IN ARRAY ARRAY[
   'studios','users','clients','f24_scadenze','f24_righe','liquidazioni_iva'
 ] LOOP
  IF has_table_privilege('authenticated',format('public.%I',t),'SELECT')
     OR has_table_privilege('authenticated',format('public.%I',t),'INSERT')
     OR has_table_privilege('authenticated',format('public.%I',t),'UPDATE')
     OR has_table_privilege('authenticated',format('public.%I',t),'DELETE') THEN
   RAISE EXCEPTION 'Stage3J authenticated bypass: %',t;
  END IF;
  FOR stmt IN SELECT unnest(ARRAY[
    format('SELECT id FROM public.%I LIMIT 0',t),
    format('INSERT INTO public.%I (id) SELECT NULL::uuid WHERE false',t),
    format('UPDATE public.%I SET id=id WHERE false',t),
    format('DELETE FROM public.%I WHERE false',t)
  ]) LOOP
   BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'SECURITY FAILURE: legacy authenticated DML allowed: %',stmt;
   EXCEPTION WHEN insufficient_privilege THEN
     NULL;
   END;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS: authenticated zero-row read/insert/update/delete blocked on all six legacy tables';
END $tests$;
ROLLBACK;
