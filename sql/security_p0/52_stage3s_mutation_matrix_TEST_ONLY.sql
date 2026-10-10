-- Stage3S integration test (real PostgreSQL, simulated roles; no signed JWT).
-- Dedicated isolated LAB ONLY. Fixture rows rollback; AgeCon PostgreSQL sequence
-- MAY still advance even when ROLLBACK executes (sequence semantics).
BEGIN;
SET LOCAL statement_timeout='50s';
SET LOCAL lock_timeout='3s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3s_mutation_test_approval',true)
  IS DISTINCT FROM 'local-stage3s-fiscal-mutations-rollback-only' THEN
  RAISE EXCEPTION 'Stage3S isolated mutation test opt-in missing';
 END IF;
 IF to_regprocedure('public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)') IS NULL
  OR to_regprocedure('public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)') IS NULL
  OR to_regprocedure('public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)') IS NULL
  OR (SELECT count(*) FROM public.clienti)<>0
  OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>0
  OR (SELECT count(*) FROM public.avvisi_ade)<>0
  OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0 THEN
  RAISE EXCEPTION 'Stage3S mutation fixture requires initialized empty LAB schema';
 END IF;
END $gate$;

INSERT INTO public.societa(id,codice,denominazione) VALUES
 ('72000000-0000-4000-8000-000000000001','S3S-A','Stage3S A'),
 ('72000000-0000-4000-8000-000000000002','S3S-B','Stage3S B');
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('72000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3s-a@example.invalid',now(),now()),
 ('72000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3s-b@example.invalid',now(),now());
INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('72000000-0000-4000-8000-000000000005','Stage3S Owner A','stage3s-a@example.invalid','owner',true,'72000000-0000-4000-8000-000000000003'),
 ('72000000-0000-4000-8000-000000000006','Stage3S Owner B','stage3s-b@example.invalid','owner',true,'72000000-0000-4000-8000-000000000004');
INSERT INTO public.utenti_studio_societa(utente_id,auth_user_id,societa_id,ruolo,is_default) VALUES
 ('72000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001','owner',true),
 ('72000000-0000-4000-8000-000000000006','72000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000002','owner',true);

SET LOCAL ROLE service_role;
DO $matrix$
DECLARE c uuid; av uuid; rv uuid; n integer;
BEGIN
 c:=public.fiscosim_studio_create_cliente(
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000003',
  '{"nome":"Stage3S shared client","tipo_cliente":"ordinario"}'::jsonb,
  'Manually checked test-company ownership');
 IF c IS NULL THEN RAISE EXCEPTION 'Stage3S new CRM customer not created'; END IF;

 -- Deliberately share CRM customer between A and B by an explicit audit link.
 INSERT INTO public.crm_cliente_societa_link
 (cliente_id,societa_id,assigned_by,decision_reason)
 VALUES (c,'72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000004','Explicitly approved shared customer in lab');
 BEGIN
  PERFORM public.fiscosim_studio_update_cliente(
   c,'72000000-0000-4000-8000-000000000003','edit',
   '{"note":"attempt by only-A owner"}'::jsonb,'Not approved by both companies');
  RAISE EXCEPTION 'SECURITY FAILURE: one-company actor edited shared client';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'CRM operation requires all linked company memberships%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.fiscosim_studio_update_cliente(
   c,'72000000-0000-4000-8000-000000000004','deactivate',
   '{}'::jsonb,'Not approved by both companies');
  RAISE EXCEPTION 'SECURITY FAILURE: one-company actor deactivated shared client';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'CRM operation requires all linked company memberships%' THEN RAISE; END IF;
 END;

 -- Grant the A manager an explicit B membership for the subsequent positive.
 INSERT INTO public.utenti_studio_societa(utente_id,auth_user_id,societa_id,ruolo,is_default)
 VALUES ('72000000-0000-4000-8000-000000000005',
 '72000000-0000-4000-8000-000000000003',
 '72000000-0000-4000-8000-000000000002','owner',false);
 PERFORM public.fiscosim_studio_update_cliente(
  c,'72000000-0000-4000-8000-000000000003','edit',
  '{"note":"All associations checked"}'::jsonb,'Authorized by A and B owners');
 PERFORM public.fiscosim_studio_update_cliente(
  c,'72000000-0000-4000-8000-000000000003','modules',
  '{"moduli_attivi":["iva","f24"]}'::jsonb,'Client modules explicitly confirmed');
 SELECT count(*) INTO n FROM public.fiscosim_operational_audit
  WHERE entity_kind='cliente' AND entity_id=c;
 IF n<>4 THEN RAISE EXCEPTION 'Stage3S CRM update audit expected two company rows per action'; END IF;

 -- Single-company fiscal record for the shared CRM customer.
 av:=public.fiscosim_studio_write_avviso(
  'create',NULL,'72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000004',
  jsonb_build_object('cliente_id',c,'tipo_avviso','Avviso bonario','importo','110.25','esito',''),
  'AgeCon registration for company B');
 IF av IS NULL THEN RAISE EXCEPTION 'Stage3S AgeCon create failed'; END IF;
 PERFORM public.fiscosim_studio_write_avviso(
  'update',av,'72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000004',
  '{"esito":"confermato","attivita":"CIVIS da verificare"}'::jsonb,
  'Office verified the communication');
 PERFORM public.fiscosim_studio_write_avviso(
  'close',av,'72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000004',
  '{}'::jsonb,'Communication closed with audit');
 IF (SELECT esito FROM public.avvisi_ade WHERE id=av)<>'chiuso' THEN
  RAISE EXCEPTION 'Stage3S closed notice was physically deleted or not closed';
 END IF;
 BEGIN
  PERFORM public.fiscosim_studio_write_avviso(
   'update',av,'72000000-0000-4000-8000-000000000001',
   '72000000-0000-4000-8000-000000000003',
   '{"esito":"confermato"}'::jsonb,'Cross-company notice update refused');
  RAISE EXCEPTION 'SECURITY FAILURE: notice owner was overwritten';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'AgeCon notice not owned by requested company%' THEN RAISE; END IF;
 END;

 -- Archive existing linked CRM customer under A, then a newly created one.
 rv:=public.fiscosim_studio_archive_revisione(
  '72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000001',
  c,NULL,NULL,
  '{"anno_imposta":2025,"tipo_dichiarativo":"RED","contribuente":"QA","codice_fiscale":"QA123"}'::jsonb,
  2,'Operator confirmed this declaration');
 IF rv IS NULL THEN RAISE EXCEPTION 'Stage3S linked declaration archive failed'; END IF;
 PERFORM public.fiscosim_studio_archive_revisione(
  '72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000001',
  NULL,'{"nome":"New declaration customer"}'::jsonb,
  'New client verified before filing',
  '{"anno_imposta":2026,"tipo_dichiarativo":"RED"}'::jsonb,
  1,'New customer and review archived');
 SELECT count(*) INTO n FROM public.clienti;
 IF n<>2 THEN RAISE EXCEPTION 'Stage3S customer+declaration two-phase atomic save failed'; END IF;

 BEGIN
  PERFORM public.fiscosim_studio_archive_revisione(
   '72000000-0000-4000-8000-000000000003',
   '72000000-0000-4000-8000-000000000001',
   NULL,'{"nome":"Must rollback"}'::jsonb,
   'Temporary client expected rollback',
   '{"anno_imposta":"invalid"}'::jsonb,
   1,'This declaration must fail completely');
  RAISE EXCEPTION 'SECURITY FAILURE: invalid revision committed';
 EXCEPTION WHEN invalid_text_representation THEN NULL;
 END;
 IF (SELECT count(*) FROM public.clienti)<>2
  OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>2
  OR (SELECT count(*) FROM public.fiscosim_operational_audit
    WHERE entity_kind='avviso_ade' AND entity_id=av)<>3 THEN
  RAISE EXCEPTION 'Stage3S rollback or write audit failed';
 END IF;
 RAISE NOTICE 'Stage3S SQL transactional write matrix PASS';
END $matrix$;
RESET ROLE;
ROLLBACK;
