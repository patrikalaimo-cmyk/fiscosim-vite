-- FiscoSim P0 Stage3E SQL integration QA, isolated Docker clone ONLY.
-- Two fake companies, two fake collaborators, one outsider, NULL-scope rows.
-- All writes are synthetic and ALL ROLLBACK. No real JWT/API auth is tested.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
DO $guard$
DECLARE n integer;
BEGIN
 IF current_setting('fiscosim.p0_stage3e_test_approval',true)
   IS DISTINCT FROM 'p0-local-two-company-fixtures-only' THEN
  RAISE EXCEPTION 'Stage3E fixture opt-in missing';
 END IF;
 SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname='public'
   AND ((tablename='fatture_xml'
         AND policyname='p0_xml_company_member_all_lab_only')
     OR (tablename='coda_import_fatture'
         AND policyname='p0_import_queue_company_member_all_lab_only'));
 IF n<>2 THEN RAISE EXCEPTION 'Stage3E patch absent'; END IF;
END $guard$;

INSERT INTO public.societa(id,codice,denominazione) VALUES
 ('60000000-0000-4000-8000-000000000101','P0-STAGE3E-ONLY-A','P0 QA company A'),
 ('60000000-0000-4000-8000-000000000201','P0-STAGE3E-ONLY-B','P0 QA company B');
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
 VALUES
 ('60000000-0000-4000-8000-000000000301','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','p0-e-a@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000302','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','p0-e-b@example.invalid',now(),now());
INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id)
 VALUES
 ('60000000-0000-4000-8000-000000000401','QA A','p0-e-a@example.invalid',
  'collaboratore',true,'60000000-0000-4000-8000-000000000301'),
 ('60000000-0000-4000-8000-000000000402','QA B','p0-e-b@example.invalid',
  'collaboratore',true,'60000000-0000-4000-8000-000000000302');
INSERT INTO public.utenti_studio_societa
 (id,utente_id,auth_user_id,societa_id,ruolo,is_default)
 VALUES
 ('60000000-0000-4000-8000-000000000501',
  '60000000-0000-4000-8000-000000000401',
  '60000000-0000-4000-8000-000000000301',
  '60000000-0000-4000-8000-000000000101','collaboratore',true),
 ('60000000-0000-4000-8000-000000000502',
  '60000000-0000-4000-8000-000000000402',
  '60000000-0000-4000-8000-000000000302',
  '60000000-0000-4000-8000-000000000201','collaboratore',true);

-- Only fictitious invoice XML metadata.
INSERT INTO public.fatture_xml(id,filename,societa_id,xml_content) VALUES
 ('60000000-0000-4000-8000-000000000601','P0-QA-A.xml',
  '60000000-0000-4000-8000-000000000101','<QA company="A"/>'),
 ('60000000-0000-4000-8000-000000000602','P0-QA-B.xml',
  '60000000-0000-4000-8000-000000000201','<QA company="B"/>'),
 ('60000000-0000-4000-8000-000000000603','P0-QA-NULL.xml',
  NULL,'<QA company="none"/>');
INSERT INTO public.coda_import_fatture(id,filename,societa_id) VALUES
 ('60000000-0000-4000-8000-000000000701','P0-QUEUE-A.xml',
  '60000000-0000-4000-8000-000000000101'),
 ('60000000-0000-4000-8000-000000000702','P0-QUEUE-B.xml',
  '60000000-0000-4000-8000-000000000201'),
 ('60000000-0000-4000-8000-000000000703','P0-QUEUE-NULL.xml',NULL);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000301';
DO $collab_a$
DECLARE n integer;
DECLARE a uuid := '60000000-0000-4000-8000-000000000101';
DECLARE b uuid := '60000000-0000-4000-8000-000000000201';
BEGIN
 IF current_user<>'authenticated'
  OR auth.uid() IS DISTINCT FROM '60000000-0000-4000-8000-000000000301'::uuid
  OR NOT public.user_has_societa_access(a)
  OR public.user_has_societa_access(b) THEN
  RAISE EXCEPTION 'Stage3E A identity/membership incorrect';
 END IF;
 IF (SELECT count(*) FROM public.fatture_xml
   WHERE id IN ('60000000-0000-4000-8000-000000000601'::uuid,
                '60000000-0000-4000-8000-000000000602'::uuid,
                '60000000-0000-4000-8000-000000000603'::uuid))<>1
  OR (SELECT count(*) FROM public.coda_import_fatture
   WHERE id IN ('60000000-0000-4000-8000-000000000701'::uuid,
                '60000000-0000-4000-8000-000000000702'::uuid,
                '60000000-0000-4000-8000-000000000703'::uuid))<>1 THEN
   RAISE EXCEPTION 'SECURITY FAILURE: company A must see ONLY own 2 rows';
 END IF;
 UPDATE public.fatture_xml SET note='QA A updated'
  WHERE id='60000000-0000-4000-8000-000000000601'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'SECURITY FAILURE: A update own XML denied'; END IF;
 UPDATE public.coda_import_fatture SET note_operatore='QA A updated'
  WHERE id='60000000-0000-4000-8000-000000000701'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'SECURITY FAILURE: A update own queue denied'; END IF;
 UPDATE public.fatture_xml SET note='cross'
  WHERE id='60000000-0000-4000-8000-000000000602'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: B XML UPDATE possible'; END IF;
 UPDATE public.coda_import_fatture SET note_operatore='cross'
  WHERE id='60000000-0000-4000-8000-000000000702'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: B queue UPDATE possible'; END IF;
 BEGIN
  INSERT INTO public.fatture_xml(filename,societa_id)
   VALUES('P0-FORBIDDEN-B.xml',b);
  RAISE EXCEPTION 'SECURITY FAILURE: cross-company XML INSERT allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO public.coda_import_fatture(filename,societa_id)
   VALUES('P0-FORBIDDEN-B-QUEUE.xml',b);
  RAISE EXCEPTION 'SECURITY FAILURE: cross-company queue INSERT allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO public.fatture_xml(filename,societa_id)
   VALUES('P0-FORBIDDEN-NULL.xml',NULL);
  RAISE EXCEPTION 'SECURITY FAILURE: null-scope XML INSERT allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO public.coda_import_fatture(filename,societa_id)
   VALUES('P0-FORBIDDEN-NULL-QUEUE.xml',NULL);
  RAISE EXCEPTION 'SECURITY FAILURE: null-scope queue INSERT allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RAISE NOTICE 'PASS: A reads/writes own XML+queue, cannot read/write B or NULL company';
END $collab_a$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000302';
DO $collab_b$
BEGIN
 IF (SELECT count(*) FROM public.fatture_xml
  WHERE id IN ('60000000-0000-4000-8000-000000000601'::uuid,
               '60000000-0000-4000-8000-000000000602'::uuid,
               '60000000-0000-4000-8000-000000000603'::uuid))<>1
 OR (SELECT count(*) FROM public.coda_import_fatture
  WHERE id IN ('60000000-0000-4000-8000-000000000701'::uuid,
               '60000000-0000-4000-8000-000000000702'::uuid,
               '60000000-0000-4000-8000-000000000703'::uuid))<>1
 OR NOT EXISTS (SELECT 1 FROM public.fatture_xml
      WHERE id='60000000-0000-4000-8000-000000000602'::uuid)
 OR NOT EXISTS (SELECT 1 FROM public.coda_import_fatture
      WHERE id='60000000-0000-4000-8000-000000000702'::uuid) THEN
    RAISE EXCEPTION 'SECURITY FAILURE: B cannot see exactly B company rows';
 END IF;
 RAISE NOTICE 'PASS: B reads only B company XML and queue';
END $collab_b$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000999';
DO $outsider$
BEGIN
 IF EXISTS (SELECT 1 FROM public.fatture_xml
  WHERE id IN ('60000000-0000-4000-8000-000000000601'::uuid,
               '60000000-0000-4000-8000-000000000602'::uuid,
               '60000000-0000-4000-8000-000000000603'::uuid))
 OR EXISTS (SELECT 1 FROM public.coda_import_fatture
  WHERE id IN ('60000000-0000-4000-8000-000000000701'::uuid,
               '60000000-0000-4000-8000-000000000702'::uuid,
               '60000000-0000-4000-8000-000000000703'::uuid)) THEN
  RAISE EXCEPTION 'SECURITY FAILURE: unaffiliated user sees XML/queue';
 END IF;
 RAISE NOTICE 'PASS: unaffiliated authenticated identity sees no XML or queue';
END $outsider$;
ROLLBACK;
