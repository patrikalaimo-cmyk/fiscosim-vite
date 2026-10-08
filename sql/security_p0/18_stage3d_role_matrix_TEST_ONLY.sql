-- Stage3D four-principal RLS test: LAB ONLY, synthetic rows, ROLLBACK.
-- PostgreSQL role/JWT-context simulation is not a browser/API E2E test.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
DECLARE t text; n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3d_test_approval',true)
   IS DISTINCT FROM 'local-role-matrix-fixtures-only' THEN
   RAISE EXCEPTION 'Stage3D test approval required';
 END IF;
 FOREACH t IN ARRAY ARRAY['adempimenti_clienti','adempimenti_template',
    'deleghe_uniche','impostazioni_studio','invii_schedulati',
    'richieste_fatture'] LOOP
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename=t
    AND (lower(btrim(coalesce(qual,'')))='true'
      OR lower(btrim(coalesce(with_check,'')))='true');
  IF n<>0 THEN RAISE EXCEPTION 'Stage3D TRUE bypass still present %',t; END IF;
 END LOOP;
END $gate$;
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
VALUES
 ('50000000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','p0d-owner@example.invalid',now(),now()),
 ('50000000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','p0d-admin@example.invalid',now(),now()),
 ('50000000-0000-4000-8000-000000000103','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','p0d-collab@example.invalid',now(),now());
INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id)
VALUES
 ('50000000-0000-4000-8000-000000000201','QA Owner','p0d-owner@example.invalid',
  'owner',true,'50000000-0000-4000-8000-000000000101'),
 ('50000000-0000-4000-8000-000000000202','QA Admin','p0d-admin@example.invalid',
  'admin',true,'50000000-0000-4000-8000-000000000102'),
 ('50000000-0000-4000-8000-000000000203','QA Collaborator','p0d-collab@example.invalid',
  'collaboratore',true,'50000000-0000-4000-8000-000000000103');
INSERT INTO public.adempimenti_template(id,nome,oggetto,corpo)
VALUES('50000000-0000-4000-8000-000000000301','P0 test template','QA','Synthetic');
INSERT INTO public.impostazioni_studio(id,chiave,valore)
VALUES('50000000-0000-4000-8000-000000000302','P0-STAGE3D-QA-ONLY','initial');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='50000000-0000-4000-8000-000000000101';
DO $owner$
DECLARE n integer;
BEGIN
 IF public.current_utente_ruolo()<>'owner'
  OR NOT EXISTS(SELECT 1 FROM public.adempimenti_template
     WHERE id='50000000-0000-4000-8000-000000000301')
  OR NOT EXISTS(SELECT 1 FROM public.impostazioni_studio
     WHERE id='50000000-0000-4000-8000-000000000302') THEN
   RAISE EXCEPTION 'Owner SELECT failed';
 END IF;
 UPDATE public.adempimenti_template SET oggetto='Owner edited'
  WHERE id='50000000-0000-4000-8000-000000000301';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Owner UPDATE failed'; END IF;
 RAISE NOTICE 'PASS: Owner reads and updates studio template';
END $owner$;
SET LOCAL "request.jwt.claim.sub"='50000000-0000-4000-8000-000000000102';
DO $admin$
DECLARE n integer;
BEGIN
 IF public.current_utente_ruolo()<>'admin' THEN
   RAISE EXCEPTION 'Admin identity incorrect';
 END IF;
 UPDATE public.impostazioni_studio SET valore='Admin edited'
  WHERE id='50000000-0000-4000-8000-000000000302';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Admin UPDATE failed'; END IF;
 RAISE NOTICE 'PASS: Admin may update studio setting';
END $admin$;
SET LOCAL "request.jwt.claim.sub"='50000000-0000-4000-8000-000000000103';
DO $collab$
DECLARE n integer;
BEGIN
 IF public.current_utente_ruolo()<>'collaboratore'
  OR NOT EXISTS(SELECT 1 FROM public.adempimenti_template
     WHERE id='50000000-0000-4000-8000-000000000301')
  OR NOT EXISTS(SELECT 1 FROM public.impostazioni_studio
     WHERE id='50000000-0000-4000-8000-000000000302') THEN
   RAISE EXCEPTION 'Collaborator SELECT failed';
 END IF;
 UPDATE public.impostazioni_studio SET valore='unauthorized'
  WHERE id='50000000-0000-4000-8000-000000000302';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: collaborator settings UPDATE'; END IF;
 UPDATE public.adempimenti_template SET oggetto='unauthorized'
  WHERE id='50000000-0000-4000-8000-000000000301';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: collaborator template UPDATE'; END IF;
 BEGIN
  INSERT INTO public.impostazioni_studio(id,chiave,valore)
  VALUES('50000000-0000-4000-8000-000000000399','P0D-QA-DENIED','no');
  RAISE EXCEPTION 'SECURITY FAILURE: collaborator INSERT granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: collaborator reads but cannot write studio tables';
END $collab$;
SET LOCAL "request.jwt.claim.sub"='50000000-0000-4000-8000-000000000999';
DO $outsider$
BEGIN
 IF EXISTS(SELECT 1 FROM public.adempimenti_template
  WHERE id='50000000-0000-4000-8000-000000000301')
 OR EXISTS(SELECT 1 FROM public.impostazioni_studio
  WHERE id='50000000-0000-4000-8000-000000000302') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: outsider SELECT granted';
 END IF;
 RAISE NOTICE 'PASS: outsider cannot read studio records';
END $outsider$;
ROLLBACK;
