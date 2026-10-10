-- Stage3R REAL PostgreSQL atomic CRM creation QA. Isolated LAB ONLY.
-- Requires staged Stage3Q and Stage3R migrations; no signed JWT.
-- Synthetic actors and clients; all inside transaction ROLLBACK.
BEGIN;
SET LOCAL statement_timeout='35s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3r_test_approval',true)
    IS DISTINCT FROM 'local-atomic-client-rpc-rollback-fixture' THEN
  RAISE EXCEPTION 'Stage3R rollback test requires isolated LAB approval';
 END IF;
 IF to_regprocedure('public.fiscosim_studio_create_cliente(uuid,uuid,jsonb,text)') IS NULL
   OR (SELECT count(*) FROM public.clienti)<>0
   OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>0
   OR (SELECT count(*) FROM public.avvisi_ade)<>0 THEN
  RAISE EXCEPTION 'Stage3R SQL fixture refuses unexpected LAB baseline';
 END IF;
END $gate$;

INSERT INTO public.societa(id,codice,denominazione) VALUES
 ('70000000-0000-4000-8000-000000000101','STAGE3R-A','Stage3R company A'),
 ('70000000-0000-4000-8000-000000000102','STAGE3R-B','Stage3R company B');

INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('70000000-0000-4000-8000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3r-owner-a@example.invalid',now(),now()),
 ('70000000-0000-4000-8000-000000000104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3r-owner-b@example.invalid',now(),now());

INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('70000000-0000-4000-8000-000000000105','Stage3R Owner A','stage3r-owner-a@example.invalid','owner',true,'70000000-0000-4000-8000-000000000103'),
 ('70000000-0000-4000-8000-000000000106','Stage3R Owner B','stage3r-owner-b@example.invalid','owner',true,'70000000-0000-4000-8000-000000000104');

INSERT INTO public.utenti_studio_societa
 (utente_id,auth_user_id,societa_id,ruolo,is_default) VALUES
 ('70000000-0000-4000-8000-000000000105','70000000-0000-4000-8000-000000000103','70000000-0000-4000-8000-000000000101','owner',true),
 ('70000000-0000-4000-8000-000000000106','70000000-0000-4000-8000-000000000104','70000000-0000-4000-8000-000000000102','owner',true);

SET LOCAL ROLE service_role;
DO $rpc$
DECLARE v_client_id uuid; n bigint;
BEGIN
 v_client_id:=public.fiscosim_studio_create_cliente(
  '70000000-0000-4000-8000-000000000101',
  '70000000-0000-4000-8000-000000000103',
  '{"nome":"Cliente sintetico A","codice_fiscale":"STAGE3R-CF","telefono":"000","moduli_attivi":["iva","f24"]}'::jsonb,
  'Manual verification of test company A');
 IF v_client_id IS NULL THEN RAISE EXCEPTION 'Stage3R atomic RPC did not return client id'; END IF;
 IF (SELECT count(*) FROM public.clienti c WHERE c.id=v_client_id)<>1 THEN
   RAISE EXCEPTION 'Stage3R source customer not created';
 END IF;
 IF (SELECT count(*) FROM public.crm_cliente_societa_link
  WHERE cliente_id=v_client_id AND societa_id='70000000-0000-4000-8000-000000000101')<>1 THEN
  RAISE EXCEPTION 'Stage3R source + link not created together';
 END IF;

 BEGIN
  PERFORM public.fiscosim_studio_create_cliente(
   '70000000-0000-4000-8000-000000000101',
   '70000000-0000-4000-8000-000000000104',
   '{"nome":"Cross-company bad request"}'::jsonb,
   'Attempted cross-company assignment');
  RAISE EXCEPTION 'SECURITY FAILURE: nonmember created A client';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Customer actor lacks verified company membership%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.fiscosim_studio_create_cliente(
   '70000000-0000-4000-8000-000000000101',
   '70000000-0000-4000-8000-000000000103',
   '{"nome":"Bad keys","societa_id":"70000000-0000-4000-8000-000000000102"}'::jsonb,
   'Forbidden untrusted ownership override');
  RAISE EXCEPTION 'SECURITY FAILURE: customer payload changed scope';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Unsupported CRM fields%' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO n FROM public.clienti;
 IF n<>1 OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>1 THEN
  RAISE EXCEPTION 'Stage3R failed RPC left extra orphan/linked clients';
 END IF;
END $rpc$;
RESET ROLE;
ROLLBACK;
