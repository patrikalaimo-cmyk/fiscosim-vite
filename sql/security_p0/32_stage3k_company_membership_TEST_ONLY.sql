-- FiscoSim P0 Stage3K — PostgreSQL A/B membership matrix.
-- LAB ONLY. Synthetic fixtures and SQL role / auth.uid simulation.
-- NOT a signed JWT or application E2E test. All fixtures ROLLBACK.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3k_test_approval',true)
  IS DISTINCT FROM 'local-company-membership-matrix-only' THEN
  RAISE EXCEPTION 'Stage3K test requires explicit LAB approval';
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='user_has_societa_access'
    AND NOT p.prosecdef
    AND pg_get_functiondef(p.oid) ~ 'uss[.]auth_user_id[[:space:]]*=[[:space:]]*requester')<>1 THEN
  RAISE EXCEPTION 'Stage3K patched company helper missing';
 END IF;
END $guard$;

INSERT INTO public.societa (id,codice,denominazione) VALUES
 ('60000000-0000-4000-8000-000000000101','P0-3K-ONLY-A','QA Stage3K synthetic company A'),
 ('60000000-0000-4000-8000-000000000102','P0-3K-ONLY-B','QA Stage3K synthetic company B');

INSERT INTO auth.users
 (id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('60000000-0000-4000-8000-000000000201','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3k-owner@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000202','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3k-admin@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000203','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3k-collab@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000204','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3k-disabled@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000205','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3k-outsider@example.invalid',now(),now());

INSERT INTO public.utenti_studio
 (id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('60000000-0000-4000-8000-000000000301','QA Owner','stage3k-owner@example.invalid','owner',true,'60000000-0000-4000-8000-000000000201'),
 ('60000000-0000-4000-8000-000000000302','QA Admin','stage3k-admin@example.invalid','admin',true,'60000000-0000-4000-8000-000000000202'),
 ('60000000-0000-4000-8000-000000000303','QA Collaborator','stage3k-collab@example.invalid','collaboratore',true,'60000000-0000-4000-8000-000000000203'),
 ('60000000-0000-4000-8000-000000000304','QA Disabled','stage3k-disabled@example.invalid','owner',false,'60000000-0000-4000-8000-000000000204');

INSERT INTO public.utenti_studio_societa
 (id,utente_id,auth_user_id,societa_id,ruolo,is_default) VALUES
 ('60000000-0000-4000-8000-000000000401','60000000-0000-4000-8000-000000000301','60000000-0000-4000-8000-000000000201','60000000-0000-4000-8000-000000000101','owner',true),
 ('60000000-0000-4000-8000-000000000402','60000000-0000-4000-8000-000000000302','60000000-0000-4000-8000-000000000202','60000000-0000-4000-8000-000000000101','admin',true),
 ('60000000-0000-4000-8000-000000000403','60000000-0000-4000-8000-000000000303','60000000-0000-4000-8000-000000000203','60000000-0000-4000-8000-000000000101','collaboratore',true),
 ('60000000-0000-4000-8000-000000000404','60000000-0000-4000-8000-000000000304','60000000-0000-4000-8000-000000000204','60000000-0000-4000-8000-000000000101','owner',true);

INSERT INTO public.corrispettivi_giornalieri
 (id,societa_id,data,incasso_totale) VALUES
 ('60000000-0000-4000-8000-000000000501','60000000-0000-4000-8000-000000000101','2026-10-08',121.00),
 ('60000000-0000-4000-8000-000000000502','60000000-0000-4000-8000-000000000102','2026-10-08',242.00);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000201';

DO $owner$
DECLARE a uuid:='60000000-0000-4000-8000-000000000101';
        b uuid:='60000000-0000-4000-8000-000000000102';
        n bigint;
BEGIN
 IF current_user<>'authenticated' OR public.current_utente_ruolo()<>'owner'
  OR NOT public.user_has_societa_access(a) OR public.user_has_societa_access(b)
  OR public.user_has_societa_access(NULL::uuid)
  OR (SELECT count(*) FROM public.societa WHERE id IN (a,b))<>1
  OR (SELECT count(*) FROM public.corrispettivi_giornalieri WHERE societa_id IN (a,b))<>1 THEN
   RAISE EXCEPTION 'SECURITY FAILURE: owner company A/B visibility';
 END IF;
 UPDATE public.corrispettivi_giornalieri SET incasso_totale=100
 WHERE societa_id=b;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: owner updated company B'; END IF;
 UPDATE public.corrispettivi_giornalieri SET incasso_totale=122
 WHERE id='60000000-0000-4000-8000-000000000501';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Owner own-company UPDATE blocked'; END IF;
 RAISE NOTICE 'PASS: owner A granted B denied';
END $owner$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000202';
DO $admin$
DECLARE a uuid:='60000000-0000-4000-8000-000000000101';
        b uuid:='60000000-0000-4000-8000-000000000102';
        n bigint;
BEGIN
 IF public.current_utente_ruolo()<>'admin'
   OR NOT public.user_has_societa_access(a)
   OR public.user_has_societa_access(b)
   OR (SELECT count(*) FROM public.corrispettivi_giornalieri WHERE societa_id IN (a,b))<>1
 THEN RAISE EXCEPTION 'SECURITY FAILURE: admin company A/B visibility'; END IF;
 UPDATE public.corrispettivi_giornalieri SET incasso_totale=999
 WHERE societa_id=b;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: admin updated company B'; END IF;
 RAISE NOTICE 'PASS: admin A granted B denied';
END $admin$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000203';
DO $collab$
DECLARE a uuid:='60000000-0000-4000-8000-000000000101';
        b uuid:='60000000-0000-4000-8000-000000000102';
BEGIN
 IF public.current_utente_ruolo()<>'collaboratore'
  OR NOT public.user_has_societa_access(a) OR public.user_has_societa_access(b)
  OR (SELECT count(*) FROM public.corrispettivi_giornalieri WHERE societa_id IN (a,b))<>1 THEN
   RAISE EXCEPTION 'SECURITY FAILURE: collaborator A/B visibility';
 END IF;
 RAISE NOTICE 'PASS: collaborator A granted B denied';
END $collab$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000204';
DO $disabled$
BEGIN
 IF public.user_has_societa_access('60000000-0000-4000-8000-000000000101') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: disabled owner may access company';
 END IF;
 RAISE NOTICE 'PASS: disabled membership denied';
END $disabled$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000205';
DO $outsider$
BEGIN
 IF public.user_has_societa_access('60000000-0000-4000-8000-000000000101')
 OR public.user_has_societa_access('60000000-0000-4000-8000-000000000102') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: outsider may access companies';
 END IF;
 RAISE NOTICE 'PASS: outsider denied';
END $outsider$;
ROLLBACK;
