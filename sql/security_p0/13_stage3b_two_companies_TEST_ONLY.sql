-- FiscoSim P0 — Stage 3B positive/negative tenant integration QA, LOCAL LAB ONLY.
-- READ this entire script before executing. It INSERTS ONLY SYNTHETIC fixtures
-- within one SQL transaction and ROLLBACKS all data (including auth.users row).
-- Requires already applied Stages 1,2,3A and recursion helper fix.
-- No live database or customer data permitted.
-- Simulated request.jwt.claim.sub intentionally tests database policy behavior,
-- NOT an end-to-end signed JWT/API request. Positive+negative RLS verification.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';

DO $guard$
DECLARE n integer;
BEGIN
  IF current_setting('fiscosim.p0_stage3b_test_approval',true)
     IS DISTINCT FROM 'local-two-companies-qa-only' THEN
    RAISE EXCEPTION 'Stage3B blocked: local fixture approval missing';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relkind IN ('r','p')) <> 73 THEN
    RAISE EXCEPTION 'Stage3B unexpected P0 schema';
  END IF;
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename IN
      ('corrispettivi_giornalieri','intrastat_operazioni','liquidazioni_iva_societa')
      AND policyname='p0_societa_member_all_lab_only';
  IF n <> 3 THEN
    RAISE EXCEPTION 'Stage3B policy baseline mismatch: %',n;
  END IF;
  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public'
      AND p.proname IN ('current_utente_ruolo','current_utente_studio_id')
      AND p.prosecdef;
  IF n <> 2 THEN RAISE EXCEPTION 'Role helper fix missing'; END IF;
END
$guard$;

-- Fictitious company A, company B and a user assigned ONLY to company A.
-- Explicit IDs and emails deliberately cannot collide with real client data
-- because this must only run in the separate empty local schema clone.
INSERT INTO public.societa (id,codice,denominazione) VALUES
 ('30000000-0000-4000-8000-000000000101','P0-STAGE3B-ONLY-A','P0 QA synthetic company A'),
 ('30000000-0000-4000-8000-000000000201','P0-STAGE3B-ONLY-B','P0 QA synthetic company B');
INSERT INTO auth.users
  (id,instance_id,aud,role,email,created_at,updated_at)
VALUES
  ('30000000-0000-4000-8000-000000000301',
   '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated',
   'p0-stage3b-fixture@example.invalid',now(),now());
INSERT INTO public.utenti_studio
 (id,nome,cognome,email,ruolo,attivo,auth_user_id)
VALUES
 ('30000000-0000-4000-8000-000000000302','Tester','P0',
  'p0-stage3b-fixture@example.invalid','collaboratore',true,
  '30000000-0000-4000-8000-000000000301');
INSERT INTO public.utenti_studio_societa
 (id,utente_id,auth_user_id,societa_id,ruolo,is_default)
VALUES
 ('30000000-0000-4000-8000-000000000303',
  '30000000-0000-4000-8000-000000000302',
  '30000000-0000-4000-8000-000000000301',
  '30000000-0000-4000-8000-000000000101',
  'collaboratore',true);

-- Four fiscal tables, one synthetic row per company.
INSERT INTO public.corrispettivi_giornalieri(id,societa_id,data,incasso_totale)
 VALUES
 ('30000000-0000-4000-8000-000000000104',
  '30000000-0000-4000-8000-000000000101','2026-10-08',121.00),
 ('30000000-0000-4000-8000-000000000204',
  '30000000-0000-4000-8000-000000000201','2026-10-08',242.00);
INSERT INTO public.intrastat_operazioni(id,societa_id,data,valore)
 VALUES
 ('30000000-0000-4000-8000-000000000105',
  '30000000-0000-4000-8000-000000000101','2026-10-08',100.00),
 ('30000000-0000-4000-8000-000000000205',
  '30000000-0000-4000-8000-000000000201','2026-10-08',200.00);
INSERT INTO public.liquidazioni_iva_societa(id,societa_id,anno,periodo)
 VALUES
 ('30000000-0000-4000-8000-000000000106',
  '30000000-0000-4000-8000-000000000101',2026,3),
 ('30000000-0000-4000-8000-000000000206',
  '30000000-0000-4000-8000-000000000201',2026,3);
INSERT INTO public.ritenute_dacconto(id,societa_id,percipiente_denominazione,ritenuta)
 VALUES
 ('30000000-0000-4000-8000-000000000107',
  '30000000-0000-4000-8000-000000000101','P0 Synthetic Payee A',20.00),
 ('30000000-0000-4000-8000-000000000207',
  '30000000-0000-4000-8000-000000000201','P0 Synthetic Payee B',40.00);

-- Tenant-scoped role simulation; no production JWT, no service_role bypass.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='30000000-0000-4000-8000-000000000301';
SET LOCAL "request.jwt.claim.role"='authenticated';

DO $assert$
DECLARE
 a uuid:='30000000-0000-4000-8000-000000000101';
 b uuid:='30000000-0000-4000-8000-000000000201';
 affected bigint;
BEGIN
 IF current_user <> 'authenticated'
    OR auth.uid() IS DISTINCT FROM '30000000-0000-4000-8000-000000000301'::uuid THEN
   RAISE EXCEPTION 'QA request identity not effective';
 END IF;
 IF public.current_utente_studio_id() IS DISTINCT FROM
    '30000000-0000-4000-8000-000000000302'::uuid
    OR public.current_utente_ruolo() IS DISTINCT FROM 'collaboratore' THEN
   RAISE EXCEPTION 'QA studio identity resolution incorrect';
 END IF;
 IF NOT public.user_has_societa_access(a) OR public.user_has_societa_access(b) THEN
   RAISE EXCEPTION 'SECURITY FAILURE: company membership mismatch';
 END IF;

 IF (SELECT count(*) FROM public.corrispettivi_giornalieri
       WHERE id IN ('30000000-0000-4000-8000-000000000104'::uuid,
                    '30000000-0000-4000-8000-000000000204'::uuid))<>1
 OR (SELECT count(*) FROM public.intrastat_operazioni
       WHERE id IN ('30000000-0000-4000-8000-000000000105'::uuid,
                    '30000000-0000-4000-8000-000000000205'::uuid))<>1
 OR (SELECT count(*) FROM public.liquidazioni_iva_societa
       WHERE id IN ('30000000-0000-4000-8000-000000000106'::uuid,
                    '30000000-0000-4000-8000-000000000206'::uuid))<>1
 OR (SELECT count(*) FROM public.ritenute_dacconto
       WHERE id IN ('30000000-0000-4000-8000-000000000107'::uuid,
                    '30000000-0000-4000-8000-000000000207'::uuid))<>1 THEN
   RAISE EXCEPTION 'SECURITY FAILURE: A/B table visibility';
 END IF;

 IF NOT EXISTS(SELECT 1 FROM public.corrispettivi_giornalieri
        WHERE id='30000000-0000-4000-8000-000000000104'::uuid)
 OR EXISTS(SELECT 1 FROM public.corrispettivi_giornalieri
        WHERE id='30000000-0000-4000-8000-000000000204'::uuid) THEN
   RAISE EXCEPTION 'SECURITY FAILURE: own/other company record distinction';
 END IF;

 -- Cross-company UPDATE must affect zero rows due to USING RLS.
 UPDATE public.corrispettivi_giornalieri SET incasso_totale=999.00
 WHERE id='30000000-0000-4000-8000-000000000204'::uuid;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'SECURITY FAILURE: cross-company update'; END IF;

 -- Authorized write to company A must persist within this test transaction.
 UPDATE public.corrispettivi_giornalieri SET incasso_totale=122.00
 WHERE id='30000000-0000-4000-8000-000000000104'::uuid;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'SECURITY FAILURE: own-company write blocked'; END IF;

 -- Cross-company INSERT must be rejected by the WITH CHECK policy.
 BEGIN
  INSERT INTO public.corrispettivi_giornalieri(id,societa_id,data,incasso_totale)
   VALUES ('30000000-0000-4000-8000-000000000304',b,'2026-10-08',111.00);
  RAISE EXCEPTION 'SECURITY FAILURE: cross-company INSERT allowed';
 EXCEPTION WHEN insufficient_privilege THEN
  NULL; -- expected PostgreSQL row-level security denial
 END;

 RAISE NOTICE 'PASS: collaborator can read/write company A, cannot access B (4 tables)';
END
$assert$;

-- If any assertion above fails, psql ON_ERROR_STOP=1 and transaction rollback
-- prevent the user from treating this QA run as successful.
ROLLBACK;
