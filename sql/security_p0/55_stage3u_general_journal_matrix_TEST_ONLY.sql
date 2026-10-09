-- Stage3U SQL matrix, NOT JWT: the real PostgreSQL roles are simulated.
-- All synthetic fixture rows and temporary permission changes ROLLBACK.
-- RUN ONLY after Stage3U 54 is manually installed in the isolated LAB.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3u_test_approval',true)
   IS DISTINCT FROM 'local-general-journal-matrix-rollback-only' THEN
  RAISE EXCEPTION 'Stage3U matrix requires local test opt-in';
 END IF;
 IF to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NULL
  OR to_regclass('public.fiscosim_general_journal_claim') IS NULL
  OR (SELECT count(*) FROM public.prima_nota)<>0
  OR (SELECT count(*) FROM public.prima_nota_righe)<>0
  OR (SELECT count(*) FROM public.audit_contabile)<>0
  OR (SELECT count(*) FROM public.piano_conti)<>0 THEN
  RAISE EXCEPTION 'Stage3U matrix requires installed RPC and empty journal LAB tables';
 END IF;
END $guard$;
INSERT INTO public.societa(id,codice,denominazione) VALUES
 ('61000000-0000-4000-8000-000000000001','S3U-A','Stage3U accounting A'),
 ('61000000-0000-4000-8000-000000000002','S3U-B','Stage3U accounting B');
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('61000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3u-a@example.invalid',now(),now()),
 ('61000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3u-b@example.invalid',now(),now());
INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('61000000-0000-4000-8000-000000000005','Stage3U owner A','stage3u-a@example.invalid','owner',true,'61000000-0000-4000-8000-000000000003'),
 ('61000000-0000-4000-8000-000000000006','Stage3U owner B','stage3u-b@example.invalid','owner',true,'61000000-0000-4000-8000-000000000004');
INSERT INTO public.utenti_studio_societa(utente_id,auth_user_id,societa_id,ruolo,is_default) VALUES
 ('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000001','owner',true),
 ('61000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000002','owner',true);
INSERT INTO public.piano_conti(id,societa_id,codice,descrizione,tipo,attivo) VALUES
 ('61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000001','1.01','Cash A','patrimoniale',true),
 ('61000000-0000-4000-8000-000000000011','61000000-0000-4000-8000-000000000001','1.02','Bank A','patrimoniale',true),
 ('61000000-0000-4000-8000-000000000012','61000000-0000-4000-8000-000000000002','1.01','Cash B','patrimoniale',true);

SET LOCAL ROLE service_role;
DO $test$
DECLARE
 a constant uuid:='61000000-0000-4000-8000-000000000001';
 ua constant uuid:='61000000-0000-4000-8000-000000000003';
 ub constant uuid:='61000000-0000-4000-8000-000000000004';
 key_a constant uuid:='61000000-0000-4000-8000-000000000099';
 header jsonb:='{"data_registrazione":"2026-10-09","descrizione":"Transfer between cash and bank"}';
 balanced jsonb:='[
 {"conto_id":"61000000-0000-4000-8000-000000000010","dare":100,"avere":0},
 {"conto_id":"61000000-0000-4000-8000-000000000011","dare":0,"avere":100}
 ]';
 id_first uuid; id_same uuid; n integer;
BEGIN
 id_first:=public.fiscosim_post_general_journal(a,ua,key_a,header,balanced,
 'Verified generic transfer for the accounting lab');
 id_same:=public.fiscosim_post_general_journal(a,ua,key_a,header,balanced,
 'Verified generic transfer for the accounting lab');
 IF id_first IS NULL OR id_first IS DISTINCT FROM id_same THEN
  RAISE EXCEPTION 'Stage3U exact request replay did not return same PN ID';
 END IF;
 BEGIN
  PERFORM public.fiscosim_post_general_journal(a,ua,key_a,header,
   '[{"conto_id":"61000000-0000-4000-8000-000000000010","dare":200,"avere":0},{"conto_id":"61000000-0000-4000-8000-000000000011","dare":0,"avere":200}]'::jsonb,
   'Verified generic transfer for the accounting lab');
  RAISE EXCEPTION 'SECURITY FAILURE: reused key accepted changed payload';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3U idempotency key reused%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.fiscosim_post_general_journal(a,ub,
   '61000000-0000-4000-8000-000000000100',header,balanced,
   'Cross-company actor request must always fail');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign actor posted PN';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3U actor lacks company journal permission%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.fiscosim_post_general_journal(a,ua,
   '61000000-0000-4000-8000-000000000101',header,
   '[{"conto_id":"61000000-0000-4000-8000-000000000010","dare":100,"avere":0},{"conto_id":"61000000-0000-4000-8000-000000000012","dare":0,"avere":100}]'::jsonb,
   'Foreign chart account must not be accepted');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign chart account posted PN';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3U invalid amount or out-of-company ledger account%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.fiscosim_post_general_journal(a,ua,
   '61000000-0000-4000-8000-000000000102',header,
   '[{"conto_id":"61000000-0000-4000-8000-000000000010","dare":100,"avere":0},{"conto_id":"61000000-0000-4000-8000-000000000011","dare":0,"avere":99.99}]'::jsonb,
   'Unbalanced request must rollback all rows');
  RAISE EXCEPTION 'SECURITY FAILURE: unbalanced journal saved';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3U unbalanced general journal%' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO n FROM public.prima_nota
  WHERE societa_id=a AND id=id_first;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3U header persisted count mismatch'; END IF;
 SELECT count(*) INTO n FROM public.prima_nota_righe
  WHERE societa_id=a AND prima_nota_id=id_first;
 IF n<>2 THEN RAISE EXCEPTION 'Stage3U persisted journal lines mismatch'; END IF;
 SELECT count(*) INTO n FROM public.audit_contabile
  WHERE societa_id=a AND entity_id=id_first AND operation_type='INSERT';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3U audit must occur once on replay'; END IF;
 SELECT count(*) INTO n FROM public.fiscosim_general_journal_claim WHERE societa_id=a;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3U rejected attempts left idempotency residue'; END IF;
 RAISE NOTICE 'Stage3U general journal balance / owner / idempotency matrix PASS';
END $test$;
RESET ROLE;

-- Force a LATE FAILURE after INSERTing the header and both lines. The
-- exception subtransaction must roll back header, lines AND idempotency.
REVOKE INSERT ON public.audit_contabile FROM service_role;
SET LOCAL ROLE service_role;
DO $audit_failure$
DECLARE
 a constant uuid:='61000000-0000-4000-8000-000000000001';
 ua constant uuid:='61000000-0000-4000-8000-000000000003';
 key_bad constant uuid:='61000000-0000-4000-8000-000000000103';
 n integer;
BEGIN
 BEGIN
  PERFORM public.fiscosim_post_general_journal(a,ua,key_bad,
   '{"data_registrazione":"2026-10-09","descrizione":"Must rollback on audit insert"}'::jsonb,
   '[{"conto_id":"61000000-0000-4000-8000-000000000010","dare":50,"avere":0},{"conto_id":"61000000-0000-4000-8000-000000000011","dare":0,"avere":50}]'::jsonb,
   'Mandatory audit failure injection check');
  RAISE EXCEPTION 'SECURITY FAILURE: operation succeeded without audit INSERT permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT count(*) INTO n FROM public.fiscosim_general_journal_claim WHERE request_id=key_bad;
 IF n<>0 THEN RAISE EXCEPTION 'Stage3U failed audit left idempotency claim'; END IF;
 SELECT count(*) INTO n FROM public.prima_nota
  WHERE societa_id=a AND descrizione='Must rollback on audit insert';
 IF n<>0 THEN RAISE EXCEPTION 'Stage3U failed audit left a posted PN'; END IF;
 RAISE NOTICE 'Stage3U late failure rollback PASS';
END $audit_failure$;
RESET ROLE;
GRANT INSERT ON public.audit_contabile TO service_role;
SELECT 'STAGE3U_LAB_MATRIX|PASS|FIXTURE_ROLLBACK' AS result;
ROLLBACK;
