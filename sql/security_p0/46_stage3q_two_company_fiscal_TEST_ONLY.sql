-- Stage3Q Real PostgreSQL RLS matrix. LAB ONLY, test code not signed JWT.
-- Synthetic 2 companies, owner A/B, 3 customers (one shared), 3 notices,
-- 2 revisions. All test records inside one transaction -> ROLLBACK.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='50s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3q_test_approval',true)
  IS DISTINCT FROM 'local-fiscal-ownership-matrix-rollback-only' THEN
  RAISE EXCEPTION 'Stage3Q isolated test opt-in required';
 END IF;
 IF (SELECT count(*) FROM public.clienti)<>0
 OR (SELECT count(*) FROM public.avvisi_ade)<>0
 OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0
 OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>0 THEN
  RAISE EXCEPTION 'Stage3Q fixture needs an empty dedicated LAB';
 END IF;
END $gate$;

INSERT INTO public.societa (id,codice,denominazione) VALUES
 ('60000000-0000-4000-8000-000000000901','P0-3Q-A','Stage3Q synthetic A'),
 ('60000000-0000-4000-8000-000000000902','P0-3Q-B','Stage3Q synthetic B');
INSERT INTO auth.users (id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('60000000-0000-4000-8000-000000000903','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3q-owner-a@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000904','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3q-owner-b@example.invalid',now(),now()),
 ('60000000-0000-4000-8000-000000000916','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3q-collab-b@example.invalid',now(),now());
INSERT INTO public.utenti_studio (id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('60000000-0000-4000-8000-000000000905','Stage3Q Owner A','stage3q-owner-a@example.invalid','owner',true,'60000000-0000-4000-8000-000000000903'),
 ('60000000-0000-4000-8000-000000000906','Stage3Q Owner B','stage3q-owner-b@example.invalid','owner',true,'60000000-0000-4000-8000-000000000904'),
 ('60000000-0000-4000-8000-000000000917','Stage3Q Collab B','stage3q-collab-b@example.invalid','collaboratore',true,'60000000-0000-4000-8000-000000000916');
INSERT INTO public.utenti_studio_societa
 (utente_id,auth_user_id,societa_id,ruolo,is_default) VALUES
 ('60000000-0000-4000-8000-000000000905','60000000-0000-4000-8000-000000000903','60000000-0000-4000-8000-000000000901','owner',true),
 ('60000000-0000-4000-8000-000000000906','60000000-0000-4000-8000-000000000904','60000000-0000-4000-8000-000000000902','owner',true),
 ('60000000-0000-4000-8000-000000000917','60000000-0000-4000-8000-000000000916','60000000-0000-4000-8000-000000000902','collaboratore',true);
INSERT INTO public.clienti (id,nome) VALUES
 ('60000000-0000-4000-8000-000000000907','Stage3Q CRM A'),
 ('60000000-0000-4000-8000-000000000908','Stage3Q CRM B'),
 ('60000000-0000-4000-8000-000000000909','Stage3Q CRM shared');
INSERT INTO public.crm_cliente_societa_link
 (cliente_id,societa_id,assigned_by,decision_reason) VALUES
 ('60000000-0000-4000-8000-000000000907','60000000-0000-4000-8000-000000000901','60000000-0000-4000-8000-000000000903','Explicit synthetic A-only company assignment'),
 ('60000000-0000-4000-8000-000000000908','60000000-0000-4000-8000-000000000902','60000000-0000-4000-8000-000000000904','Explicit synthetic B-only company assignment'),
 ('60000000-0000-4000-8000-000000000909','60000000-0000-4000-8000-000000000901','60000000-0000-4000-8000-000000000903','Explicit synthetic shared company A assignment'),
 ('60000000-0000-4000-8000-000000000909','60000000-0000-4000-8000-000000000902','60000000-0000-4000-8000-000000000904','Explicit synthetic shared company B assignment');

INSERT INTO public.avvisi_ade (id,cliente_id,societa_id,tipo_avviso) VALUES
 ('60000000-0000-4000-8000-000000000910','60000000-0000-4000-8000-000000000907','60000000-0000-4000-8000-000000000901','36-bis'),
 ('60000000-0000-4000-8000-000000000911','60000000-0000-4000-8000-000000000908','60000000-0000-4000-8000-000000000902','36-bis'),
 ('60000000-0000-4000-8000-000000000912','60000000-0000-4000-8000-000000000909','60000000-0000-4000-8000-000000000901','36-ter');
INSERT INTO public.revisioni_dichiarativi (id,cliente_id,societa_id) VALUES
 ('60000000-0000-4000-8000-000000000913','60000000-0000-4000-8000-000000000909','60000000-0000-4000-8000-000000000901'),
 ('60000000-0000-4000-8000-000000000914',NULL,'60000000-0000-4000-8000-000000000902');

-- Negative composite-FK: a B-only CRM customer cannot be used by company A.
DO $fk$
BEGIN
 BEGIN
  INSERT INTO public.avvisi_ade (cliente_id,societa_id,tipo_avviso)
   VALUES ('60000000-0000-4000-8000-000000000908',
           '60000000-0000-4000-8000-000000000901','36-bis');
  RAISE EXCEPTION 'SECURITY FAILURE: wrong-company CRM link inserted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
END $fk$;

-- Real PostgreSQL role-negative check: each table must reject anonymous SELECT
-- even when legacy Supabase had granted table/column SELECT by default.
SET LOCAL ROLE anon;
DO $anon_deny$
BEGIN
 BEGIN
  PERFORM id FROM public.clienti LIMIT 1;
  RAISE EXCEPTION 'SECURITY FAILURE: anon could read CRM customer';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM id FROM public.avvisi_ade LIMIT 1;
  RAISE EXCEPTION 'SECURITY FAILURE: anon could read fiscal notice';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM id FROM public.revisioni_dichiarativi LIMIT 1;
  RAISE EXCEPTION 'SECURITY FAILURE: anon could read declaration';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $anon_deny$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000903';
DO $owner_a$
DECLARE n bigint;
BEGIN
 IF public.current_utente_ruolo()<>'owner'
 OR (SELECT count(*) FROM public.clienti)<>2
 OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>2
 OR (SELECT count(*) FROM public.avvisi_ade)<>2
 OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>1
 OR EXISTS(SELECT 1 FROM public.avvisi_ade
    WHERE id='60000000-0000-4000-8000-000000000911')
 OR NOT public.user_can_access_cliente('60000000-0000-4000-8000-000000000907')
 OR public.user_can_access_cliente('60000000-0000-4000-8000-000000000908') THEN
  RAISE EXCEPTION 'SECURITY FAILURE: Owner A CRM/fiscal scope';
 END IF;
 BEGIN
  UPDATE public.avvisi_ade SET esito='irrelevant'
   WHERE id='60000000-0000-4000-8000-000000000911';
  RAISE EXCEPTION 'SECURITY FAILURE: direct fiscal browser write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.avvisi_ade SET esito='verificato'
   WHERE id='60000000-0000-4000-8000-000000000910';
  RAISE EXCEPTION 'SECURITY FAILURE: direct owner browser write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $owner_a$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000904';
DO $owner_b$
DECLARE n bigint;
BEGIN
 IF public.current_utente_ruolo()<>'owner'
 OR (SELECT count(*) FROM public.clienti)<>2
 OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>2
 OR (SELECT count(*) FROM public.avvisi_ade)<>1
 OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>1
 OR EXISTS (SELECT 1 FROM public.avvisi_ade
   WHERE id='60000000-0000-4000-8000-000000000912') THEN
   RAISE EXCEPTION 'SECURITY FAILURE: Owner B sees shared A fiscal notice';
 END IF;
 BEGIN
  UPDATE public.revisioni_dichiarativi SET anno_imposta=2026
   WHERE id='60000000-0000-4000-8000-000000000913';
  RAISE EXCEPTION 'SECURITY FAILURE: declaration browser write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.avvisi_ade SET societa_id='60000000-0000-4000-8000-000000000901'
  WHERE id='60000000-0000-4000-8000-000000000911';
  RAISE EXCEPTION 'SECURITY FAILURE: fiscal owner override allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $owner_b$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000916';
DO $collaborator_b$
BEGIN
 IF public.current_utente_ruolo()<>'collaboratore'
 OR (SELECT count(*) FROM public.clienti)<>2
 OR (SELECT count(*) FROM public.avvisi_ade)<>1
 OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0 THEN
  RAISE EXCEPTION 'SECURITY FAILURE: collaborator B saw orphan/clientless declaration';
 END IF;
END $collaborator_b$;

SET LOCAL "request.jwt.claim.sub"='60000000-0000-4000-8000-000000000915';
DO $outsider$
BEGIN
 IF (SELECT count(*) FROM public.clienti)<>0
 OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>0
 OR (SELECT count(*) FROM public.avvisi_ade)<>0
 OR (SELECT count(*) FROM public.revisioni_dichiarativi)<>0 THEN
  RAISE EXCEPTION 'SECURITY FAILURE: outsider visible fiscal data';
 END IF;
END $outsider$;
ROLLBACK;
