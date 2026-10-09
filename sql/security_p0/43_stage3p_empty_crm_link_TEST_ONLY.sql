-- Stage3P isolated PostgreSQL negative tests for the proposed link foundation.
-- Outer ROLLBACK, no legacy fiscal rows touched, no company/client backfill.
BEGIN;
SET LOCAL statement_timeout='25s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3p_test_approval',true)
     IS DISTINCT FROM 'local-crm-link-role-qa-only' THEN
  RAISE EXCEPTION 'Stage3P SQL TEST requires explicit LAB approval';
 END IF;
 IF to_regclass('public.crm_cliente_societa_link') IS NULL THEN
  RAISE EXCEPTION 'Stage3P CRM link not installed';
 END IF;
 IF (SELECT count(*) FROM pg_constraint
   WHERE conrelid='public.crm_cliente_societa_link'::regclass AND contype='f')<>3 THEN
  RAISE EXCEPTION 'Stage3P requires 3 verified FK constraints';
 END IF;
 IF (SELECT count(*) FROM public.crm_cliente_societa_link)<>0 THEN
  RAISE EXCEPTION 'Stage3P TEST refuses to run if link already holds assignments';
 END IF;
END $guard$;

SET LOCAL ROLE authenticated;
DO $authenticated$
DECLARE stmt text;
BEGIN
 FOR stmt IN SELECT unnest(ARRAY[
  'SELECT cliente_id FROM public.crm_cliente_societa_link LIMIT 0',
  'INSERT INTO public.crm_cliente_societa_link (cliente_id,societa_id,assigned_by,decision_reason) SELECT NULL::uuid,NULL::uuid,NULL::uuid,''test-only'' WHERE false',
  'UPDATE public.crm_cliente_societa_link SET decision_reason=decision_reason WHERE false',
  'DELETE FROM public.crm_cliente_societa_link WHERE false'
 ]) LOOP
  BEGIN
   EXECUTE stmt;
   RAISE EXCEPTION 'SECURITY FAILURE: authenticated browser access allowed: %',stmt;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
END $authenticated$;

SET LOCAL ROLE anon;
DO $anon$
DECLARE stmt text;
BEGIN
 FOR stmt IN SELECT unnest(ARRAY[
  'SELECT cliente_id FROM public.crm_cliente_societa_link LIMIT 0',
  'INSERT INTO public.crm_cliente_societa_link (cliente_id,societa_id,assigned_by,decision_reason) SELECT NULL::uuid,NULL::uuid,NULL::uuid,''test-only'' WHERE false',
  'UPDATE public.crm_cliente_societa_link SET decision_reason=decision_reason WHERE false',
  'DELETE FROM public.crm_cliente_societa_link WHERE false'
 ]) LOOP
  BEGIN
   EXECUTE stmt;
   RAISE EXCEPTION 'SECURITY FAILURE: anonymous browser access allowed: %',stmt;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
END $anon$;

SET LOCAL ROLE service_role;
DO $service$
BEGIN
 IF NOT has_table_privilege('service_role','public.crm_cliente_societa_link','INSERT')
    OR NOT has_table_privilege('service_role','public.crm_cliente_societa_link','SELECT')
    OR has_table_privilege('service_role','public.crm_cliente_societa_link','UPDATE')
    OR has_table_privilege('service_role','public.crm_cliente_societa_link','DELETE') THEN
  RAISE EXCEPTION 'Stage3P incorrect service-only INSERT/SELECT privileges';
 END IF;
 EXECUTE 'SELECT cliente_id FROM public.crm_cliente_societa_link LIMIT 0';
 EXECUTE 'INSERT INTO public.crm_cliente_societa_link (cliente_id,societa_id,assigned_by,decision_reason) SELECT NULL::uuid,NULL::uuid,NULL::uuid,''test-only'' WHERE false';
END $service$;

RESET ROLE;
DO $no_change$
BEGIN
 IF (SELECT count(*) FROM public.crm_cliente_societa_link)<>0 THEN
   RAISE EXCEPTION 'Stage3P QA unexpectedly wrote CRM bindings';
 END IF;
END $no_change$;
ROLLBACK;
