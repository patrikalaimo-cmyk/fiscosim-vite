-- One-shot negative tenant test. ONLY local P0 Docker after Stage 3A.
-- Creates one fictitious company and transaction row, then ROLLBACK.
-- Checks unknown authenticated principal CANNOT see a row from that company.
-- Does NOT establish positive same-tenant access; that needs role fixtures.
BEGIN;
SET LOCAL statement_timeout = '15s';
DO $guard$ BEGIN
  IF current_setting('fiscosim.p0_stage3a_test_approval',true)
     IS DISTINCT FROM 'local-fixtures-only' THEN
    RAISE EXCEPTION 'Local QA fixtures not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='corrispettivi_giornalieri'
    AND policyname='p0_societa_member_all_lab_only') THEN
    RAISE EXCEPTION 'Stage3a policy missing; test aborted';
  END IF;
END $guard$;

INSERT INTO public.societa(id,codice,denominazione)
VALUES ('10000000-0000-4000-8000-000000000101','P0-ONLY-TEST-20261008','Studio QA Fittizio Societa A');
INSERT INTO public.corrispettivi_giornalieri(id,societa_id,data,incasso_totale)
VALUES ('10000000-0000-4000-8000-000000000102',
        '10000000-0000-4000-8000-000000000101',
        '2026-10-08',121.00);

DO $assert_fixture$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.corrispettivi_giornalieri
    WHERE id='10000000-0000-4000-8000-000000000102') THEN
    RAISE EXCEPTION 'Fixture not inserted';
  END IF;
END $assert_fixture$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000999';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
DO $assert_denied$
BEGIN
  IF EXISTS (SELECT 1 FROM public.corrispettivi_giornalieri
    WHERE id='10000000-0000-4000-8000-000000000102') THEN
    RAISE EXCEPTION 'SECURITY FAILURE: outsider sees company transaction';
  END IF;
  RAISE NOTICE 'PASS: unaffiliated authenticated principal cannot read company A';
END
$assert_denied$;
ROLLBACK;
