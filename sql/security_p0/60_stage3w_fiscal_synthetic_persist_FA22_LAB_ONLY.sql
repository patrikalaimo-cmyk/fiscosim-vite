-- Stage3W: persistent synthetic FA22 commit on empty LAB (NOT JWT, NOT UI).
-- Seeds only SG-E2E-* fixtures, posts one fattura_attiva 22%, verifies PN/IVA/partita/audit/claim.
-- Requires opt-in GUC. Idempotent seed (ON CONFLICT DO NOTHING). Replay claim must return same PN.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3w_persist_approval',true)
   IS DISTINCT FROM 'local-fiscal-synthetic-persist-fa22-only' THEN
  RAISE EXCEPTION 'Stage3W synthetic persist requires local opt-in';
 END IF;
 IF to_regprocedure(
   'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
  ) IS NULL
  OR to_regclass('public.fiscosim_fiscal_journal_claim') IS NULL
 THEN RAISE EXCEPTION 'Stage3W synthetic persist requires installed fiscal RPC'; END IF;
END $guard$;

INSERT INTO public.societa(id,codice,denominazione,attiva)
VALUES ('72000000-0000-4000-8000-000000000001','SG-E2E-A','SG E2E synthetic company A',true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.societa(id,codice,denominazione,attiva)
VALUES ('72000000-0000-4000-8000-000000000002','SG-E2E-B','SG E2E synthetic company B',true)
ON CONFLICT (id) DO NOTHING;

-- Auth rows are identity stubs for membership checks (not UI login credentials).
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
VALUES
 ('72000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sg-e2e-a@example.invalid',now(),now()),
 ('72000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'sg-e2e-b@example.invalid',now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id)
VALUES
 ('72000000-0000-4000-8000-000000000005','SG E2E owner A','sg-e2e-a@example.invalid','owner',true,'72000000-0000-4000-8000-000000000003'),
 ('72000000-0000-4000-8000-000000000006','SG E2E owner B','sg-e2e-b@example.invalid','owner',true,'72000000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.utenti_studio_societa(utente_id,auth_user_id,societa_id,ruolo,is_default)
SELECT v.utente_id,v.auth_user_id,v.societa_id,v.ruolo,v.is_default
FROM (VALUES
 ('72000000-0000-4000-8000-000000000005'::uuid,'72000000-0000-4000-8000-000000000003'::uuid,'72000000-0000-4000-8000-000000000001'::uuid,'owner',true),
 ('72000000-0000-4000-8000-000000000006'::uuid,'72000000-0000-4000-8000-000000000004'::uuid,'72000000-0000-4000-8000-000000000002'::uuid,'owner',true)
) AS v(utente_id,auth_user_id,societa_id,ruolo,is_default)
WHERE NOT EXISTS (
 SELECT 1 FROM public.utenti_studio_societa m
 WHERE m.utente_id=v.utente_id AND m.societa_id=v.societa_id
);

INSERT INTO public.piano_conti(id,societa_id,codice,descrizione,tipo,attivo) VALUES
 ('72000000-0000-4000-8000-000000000010','72000000-0000-4000-8000-000000000001','1.01','Cliente SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000001','4.01','Ricavi SG-E2E-A','economico',true),
 ('72000000-0000-4000-8000-000000000012','72000000-0000-4000-8000-000000000001','2.01','IVA debito SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000020','72000000-0000-4000-8000-000000000002','1.01','Cliente SG-E2E-B','patrimoniale',true)
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE service_role;
DO $persist$
DECLARE
 a constant uuid:='72000000-0000-4000-8000-000000000001';
 b constant uuid:='72000000-0000-4000-8000-000000000002';
 ua constant uuid:='72000000-0000-4000-8000-000000000003';
 ub constant uuid:='72000000-0000-4000-8000-000000000004';
 key_fa constant uuid:='72000000-0000-4000-8000-000000000099';
 header jsonb:='{"data_registrazione":"2026-03-15","data_documento":"2026-03-15","numero_documento":"SG-E2E-FA22-001","descrizione":"[SG-E2E] Fattura attiva ordinaria 22 percento"}';
 rows_fa jsonb:='[
  {"conto_id":"72000000-0000-4000-8000-000000000010","dare":1220,"avere":0},
  {"conto_id":"72000000-0000-4000-8000-000000000011","dare":0,"avere":1000},
  {"conto_id":"72000000-0000-4000-8000-000000000012","dare":0,"avere":220}
 ]';
 vat_fa jsonb:='{"rows":[{"tipo":"vendita","imponibile":1000,"iva":220,"aliquota":22,"esigibilita":"immediata","split_payment":false,"documento_id":"SG-E2E-FA22-001","riga_idx":0}]}';
 ledger_fa jsonb:='{"mode":"open","openings":[{"tipo":"cliente","conto_id":"72000000-0000-4000-8000-000000000010","numero_documento":"SG-E2E-FA22-001","data_documento":"2026-03-15","importo_originale":1220}],"closures":[]}';
 wh_none jsonb:='{"eventType":"none","inserts":[],"updates":[]}';
 id_first uuid; id_same uuid; n integer; residuo numeric; dare numeric; avere numeric;
BEGIN
 -- Cross-company must fail
 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   b,ua,gen_random_uuid(),'fattura_attiva','registrazione_manual',
   header,rows_fa,vat_fa,ledger_fa,wh_none,'cross company must fail');
  RAISE EXCEPTION 'SECURITY FAILURE: cross-company fiscal post accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'SECURITY FAILURE%' THEN RAISE; END IF;
 END;

 id_first:=public.fiscosim_post_fiscal_journal(
  a,ua,key_fa,'fattura_attiva','registrazione_manual',
  header,rows_fa,vat_fa,ledger_fa,wh_none,
  'SG-E2E persistent FA22 synthetic');
 id_same:=public.fiscosim_post_fiscal_journal(
  a,ua,key_fa,'fattura_attiva','registrazione_manual',
  header,rows_fa,vat_fa,ledger_fa,wh_none,
  'SG-E2E persistent FA22 synthetic');
 IF id_first IS NULL OR id_first IS DISTINCT FROM id_same THEN
  RAISE EXCEPTION 'Stage3W persist FA22 replay mismatch';
 END IF;

 SELECT count(*) INTO n FROM public.prima_nota WHERE id=id_first AND societa_id=a;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W persist FA22 missing PN'; END IF;
 SELECT totale_dare,totale_avere INTO dare,avere FROM public.prima_nota WHERE id=id_first;
 IF dare IS DISTINCT FROM 1220 OR avere IS DISTINCT FROM 1220 THEN
  RAISE EXCEPTION 'Stage3W persist FA22 unbalanced totals';
 END IF;
 SELECT count(*) INTO n FROM public.prima_nota_righe WHERE prima_nota_id=id_first;
 IF n<>3 THEN RAISE EXCEPTION 'Stage3W persist FA22 expected 3 rows'; END IF;
 SELECT count(*) INTO n FROM public.registri_iva
  WHERE prima_nota_id=id_first AND societa_id=a AND imponibile=1000 AND iva=220 AND aliquota=22;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W persist FA22 VAT mismatch'; END IF;
 SELECT importo_residuo INTO residuo FROM public.partitario
  WHERE prima_nota_id=id_first AND societa_id=a AND tipo='cliente';
 IF residuo IS DISTINCT FROM 1220 THEN
  RAISE EXCEPTION 'Stage3W persist FA22 partita residual expected 1220';
 END IF;
 SELECT count(*) INTO n FROM public.audit_contabile WHERE entity_id=id_first AND societa_id=a;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W persist FA22 audit missing'; END IF;
 SELECT count(*) INTO n FROM public.fiscosim_fiscal_journal_claim
  WHERE societa_id=a AND request_id=key_fa AND prima_nota_id=id_first;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W persist FA22 claim missing'; END IF;

 -- B company must still have zero PN
 SELECT count(*) INTO n FROM public.prima_nota WHERE societa_id=b;
 IF n<>0 THEN RAISE EXCEPTION 'Stage3W persist leaked rows into company B'; END IF;

 RAISE NOTICE 'STAGE3W_SYNTHETIC_PERSIST_FA22|PASS|PN=%|RESIDUO=1220|REPLAY_OK', id_first;
END $persist$;
RESET ROLE;

SELECT 'STAGE3W_SYNTHETIC_PERSIST_FA22|PASS|COMMIT_READY' AS result;
COMMIT;
