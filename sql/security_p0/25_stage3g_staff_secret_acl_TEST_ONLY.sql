-- FiscoSim P0 Stage3G privilege and SQL role test. LAB ONLY.
-- No synthetic user data required. Everything checked under transaction.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3g_test_approval',true)
    IS DISTINCT FROM 'local-staff-acl-test-only' THEN
  RAISE EXCEPTION 'Stage3G test approval required';
 END IF;
END $gate$;
SET LOCAL ROLE authenticated;
DO $check$
DECLARE op text;
BEGIN
 IF current_user<>'authenticated' THEN
  RAISE EXCEPTION 'Stage3G role assumption failed';
 END IF;
 -- Non-secret column projection must remain usable via real SQL role.
 EXECUTE 'SELECT id,nome,cognome,email,ruolo,attivo,created_at,permessi,
   clienti_assegnati,auth_user_id FROM public.utenti_studio LIMIT 0';
 FOR op IN SELECT unnest(ARRAY['SELECT','INSERT','UPDATE']::text[]) LOOP
  IF has_column_privilege('authenticated','public.utenti_studio',
    'password_hash',op) THEN
   RAISE EXCEPTION 'SECURITY FAILURE: staff password_hash % allowed',op;
  END IF;
 END LOOP;
 IF has_column_privilege('authenticated','public.utenti_studio','auth_user_id','UPDATE')
  OR has_column_privilege('authenticated','public.utenti_studio','auth_user_id','INSERT') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: auth user link writable';
 END IF;
 IF has_table_privilege('authenticated','public.utenti_studio','TRUNCATE') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: TRUNCATE still granted';
 END IF;
 -- A SQL SELECT of the sensitive column MUST fail even with zero rows.
 BEGIN
  EXECUTE 'SELECT password_hash FROM public.utenti_studio LIMIT 0';
  RAISE EXCEPTION 'SECURITY FAILURE: direct credential read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  EXECUTE 'SELECT * FROM public.utenti_studio LIMIT 0';
  RAISE EXCEPTION 'SECURITY FAILURE: credential exposed by SELECT star';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: authenticated role sees explicit profile projection only; secret, * and TRUNCATE blocked';
END $check$;
ROLLBACK;
