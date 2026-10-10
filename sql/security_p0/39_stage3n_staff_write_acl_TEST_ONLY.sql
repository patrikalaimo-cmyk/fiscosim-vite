-- Stage3N test: SQL role must not bypass /api/auth/users with direct staff DML.
-- ISOLATED LAB ONLY. Zero-row statements, all inside a ROLLBACK transaction.
BEGIN;
SET LOCAL statement_timeout='20s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3n_test_approval',true)
    IS DISTINCT FROM 'local-staff-browser-dml-negative-qa' THEN
  RAISE EXCEPTION 'Stage3N test requires LAB-only approval';
 END IF;
END $gate$;
SET LOCAL ROLE authenticated;
DO $probe$
DECLARE c text; stmt text;
BEGIN
 IF current_user<>'authenticated' THEN
  RAISE EXCEPTION 'Stage3N auth SQL role not selected';
 END IF;
 EXECUTE 'SELECT id,nome,ruolo,auth_user_id FROM public.utenti_studio LIMIT 0';
 FOR c IN
   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='utenti_studio'
 LOOP
  IF has_column_privilege('authenticated','public.utenti_studio',c,'INSERT')
    OR has_column_privilege('authenticated','public.utenti_studio',c,'UPDATE') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: writable staff column %',c;
  END IF;
 END LOOP;

 FOREACH stmt IN ARRAY ARRAY[
  'INSERT INTO public.utenti_studio (nome) SELECT ''no-write'' WHERE false',
  'UPDATE public.utenti_studio SET ruolo=''owner'' WHERE false',
  'UPDATE public.utenti_studio SET permessi=''{}''::jsonb WHERE false',
  'UPDATE public.utenti_studio SET clienti_assegnati=''{}''::uuid[] WHERE false',
  'DELETE FROM public.utenti_studio WHERE false'
 ] LOOP
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'SECURITY FAILURE: browser staff DML allowed: %',stmt;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;

 IF has_column_privilege('authenticated','public.utenti_studio','password_hash','SELECT') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: password read privilege returned';
 END IF;
 RAISE NOTICE 'PASS: staff reads remain projected; all direct browser staff writes denied';
END $probe$;
ROLLBACK;
