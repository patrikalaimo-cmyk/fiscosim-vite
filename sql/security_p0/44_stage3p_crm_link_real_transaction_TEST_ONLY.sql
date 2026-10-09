-- Stage3P-3 / SQL integration on the REAL isolated PostgreSQL lab.
-- Synthetic users + clients + companies, always ROLLBACK. No mocks.
-- This validates constraints and privilege boundaries of the link foundation,
-- NOT JWT/Auth API tenancy and NOT existing fiscal-record ownership.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3p_fixture_approval',true)
  IS DISTINCT FROM 'isolated-transactional-crm-link-fixtures-only' THEN
  RAISE EXCEPTION 'Stage3P fixtures require explicit isolated LAB approval';
 END IF;
 IF to_regclass('public.crm_cliente_societa_link') IS NULL
   OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>0 THEN
  RAISE EXCEPTION 'Stage3P fixture expects an empty installed binding table';
 END IF;
 IF (SELECT count(*) FROM public.clienti)<>0
   OR (SELECT count(*) FROM public.avvisi_ade)<>0
   OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0 THEN
  RAISE EXCEPTION 'Stage3P fixture refuses nonempty accounting/CRM records';
 END IF;
END $gate$;

INSERT INTO auth.users (id,instance_id,aud,role,email,created_at,updated_at)
VALUES ('60000000-0000-4000-8000-000000000881',
        '00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated',
        'stage3p-operator@example.invalid',now(),now());

INSERT INTO public.societa (id,codice,denominazione)
VALUES
 ('60000000-0000-4000-8000-000000000882','P0-3P-LAB-A','Stage3P QA company A'),
 ('60000000-0000-4000-8000-000000000883','P0-3P-LAB-B','Stage3P QA company B');

INSERT INTO public.clienti (id,nome)
VALUES ('60000000-0000-4000-8000-000000000884','Stage3P QA synthetic customer');

SET LOCAL ROLE service_role;
INSERT INTO public.crm_cliente_societa_link
 (cliente_id,societa_id,assigned_by,decision_reason)
VALUES
 ('60000000-0000-4000-8000-000000000884',
  '60000000-0000-4000-8000-000000000882',
  '60000000-0000-4000-8000-000000000881',
  'Explicit QA assignment in isolated Docker lab');

DO $verify_server$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.crm_cliente_societa_link
 WHERE societa_id='60000000-0000-4000-8000-000000000882';
 IF n<>1 THEN
  RAISE EXCEPTION 'Stage3P QA service insert SELECT failed';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.crm_cliente_societa_link
  WHERE societa_id='60000000-0000-4000-8000-000000000883'
 ) THEN
  RAISE EXCEPTION 'Stage3P QA invented a second company assignment';
 END IF;
 BEGIN
  INSERT INTO public.crm_cliente_societa_link
   (cliente_id,societa_id,assigned_by,decision_reason)
  VALUES
   ('60000000-0000-4000-8000-000000000884',
    '60000000-0000-4000-8000-000000000883',
    '60000000-0000-4000-8000-000000000881',
    'short');
  RAISE EXCEPTION 'SECURITY FAILURE: unreasoned company assignment';
 EXCEPTION WHEN check_violation THEN NULL;
 END;

 BEGIN
  UPDATE public.crm_cliente_societa_link SET decision_reason='Changed without audit';
  RAISE EXCEPTION 'SECURITY FAILURE: service update was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  DELETE FROM public.crm_cliente_societa_link;
  RAISE EXCEPTION 'SECURITY FAILURE: service delete was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $verify_server$;

SET LOCAL ROLE authenticated;
DO $deny_browser$
BEGIN
 BEGIN
  EXECUTE 'SELECT count(*) FROM public.crm_cliente_societa_link';
  RAISE EXCEPTION 'SECURITY FAILURE: browser read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  EXECUTE 'INSERT INTO public.crm_cliente_societa_link (cliente_id,societa_id,assigned_by,decision_reason) VALUES (''60000000-0000-4000-8000-000000000884'',''60000000-0000-4000-8000-000000000883'',''60000000-0000-4000-8000-000000000881'',''Unapproved browser write to company B'')';
  RAISE EXCEPTION 'SECURITY FAILURE: browser insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $deny_browser$;

RESET ROLE;
DO $assert$
BEGIN
 IF (SELECT count(*) FROM public.crm_cliente_societa_link)<>1 THEN
  RAISE EXCEPTION 'Stage3P transaction fixture did not preserve exactly one temporary link';
 END IF;
 RAISE NOTICE 'PASS Stage3P transactional CRM links: owner explicit, constraints and ACL';
END $assert$;
ROLLBACK;
