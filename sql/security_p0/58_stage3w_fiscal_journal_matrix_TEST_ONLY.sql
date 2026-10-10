-- Stage3W SQL matrix (NOT JWT). Synthetic fixtures + permission toggles ROLLBACK.
-- Requires Stage3W 57 installed in isolated LAB. Independent expected amounts:
-- FA22: imponibile 1000, IVA 220, totale 1220; PAY partial 500 -> residual 720.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3w_test_approval',true)
   IS DISTINCT FROM 'local-fiscal-journal-matrix-rollback-only' THEN
  RAISE EXCEPTION 'Stage3W matrix requires local test opt-in';
 END IF;
 IF to_regprocedure(
   'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
  ) IS NULL
  OR to_regclass('public.fiscosim_fiscal_journal_claim') IS NULL
 THEN RAISE EXCEPTION 'Stage3W matrix requires installed fiscal RPC'; END IF;
END $guard$;

INSERT INTO public.societa(id,codice,denominazione) VALUES
 ('71000000-0000-4000-8000-000000000001','SGW-A','Stage3W fiscal A'),
 ('71000000-0000-4000-8000-000000000002','SGW-B','Stage3W fiscal B');
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
 ('71000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3w-a@example.invalid',now(),now()),
 ('71000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage3w-b@example.invalid',now(),now());
INSERT INTO public.utenti_studio(id,nome,email,ruolo,attivo,auth_user_id) VALUES
 ('71000000-0000-4000-8000-000000000005','Stage3W owner A','stage3w-a@example.invalid','owner',true,'71000000-0000-4000-8000-000000000003'),
 ('71000000-0000-4000-8000-000000000006','Stage3W owner B','stage3w-b@example.invalid','owner',true,'71000000-0000-4000-8000-000000000004');
INSERT INTO public.utenti_studio_societa(utente_id,auth_user_id,societa_id,ruolo,is_default) VALUES
 ('71000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','owner',true),
 ('71000000-0000-4000-8000-000000000006','71000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000002','owner',true);
INSERT INTO public.piano_conti(id,societa_id,codice,descrizione,tipo,attivo) VALUES
 ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000001','1.01','Cliente A','patrimoniale',true),
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000001','4.01','Ricavi A','economico',true),
 ('71000000-0000-4000-8000-000000000012','71000000-0000-4000-8000-000000000001','2.01','IVA debito A','patrimoniale',true),
 ('71000000-0000-4000-8000-000000000013','71000000-0000-4000-8000-000000000001','1.10','Banca A','patrimoniale',true),
 ('71000000-0000-4000-8000-000000000014','71000000-0000-4000-8000-000000000001','5.01','Costi A','economico',true),
 ('71000000-0000-4000-8000-000000000015','71000000-0000-4000-8000-000000000001','2.02','IVA credito A','patrimoniale',true),
 ('71000000-0000-4000-8000-000000000016','71000000-0000-4000-8000-000000000001','2.10','Fornitore A','patrimoniale',true),
 ('71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000002','1.01','Cliente B','patrimoniale',true);

SET LOCAL ROLE anon;
DO $anon_acl$
BEGIN
 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   NULL::uuid,NULL::uuid,NULL::uuid,NULL::text,NULL::text,
   NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::text);
  RAISE EXCEPTION 'SECURITY FAILURE: anon fiscal RPC execution permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM request_id FROM public.fiscosim_fiscal_journal_claim LIMIT 1;
  RAISE EXCEPTION 'SECURITY FAILURE: anon fiscal claim readable';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $anon_acl$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $authenticated_acl$
BEGIN
 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   NULL::uuid,NULL::uuid,NULL::uuid,NULL::text,NULL::text,
   NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::text);
  RAISE EXCEPTION 'SECURITY FAILURE: authenticated fiscal RPC execution permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $authenticated_acl$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $test$
DECLARE
 a constant uuid:='71000000-0000-4000-8000-000000000001';
 ua constant uuid:='71000000-0000-4000-8000-000000000003';
 ub constant uuid:='71000000-0000-4000-8000-000000000004';
 key_fa constant uuid:='71000000-0000-4000-8000-000000000099';
 key_pay constant uuid:='71000000-0000-4000-8000-000000000098';
 key_fail constant uuid:='71000000-0000-4000-8000-000000000097';
 header jsonb:='{"data_registrazione":"2026-03-15","data_documento":"2026-03-15","numero_documento":"FT-A-001","descrizione":"Fattura attiva ordinaria 22 percento"}';
 rows_fa jsonb:='[
  {"conto_id":"71000000-0000-4000-8000-000000000010","dare":1220,"avere":0},
  {"conto_id":"71000000-0000-4000-8000-000000000011","dare":0,"avere":1000},
  {"conto_id":"71000000-0000-4000-8000-000000000012","dare":0,"avere":220}
 ]';
 vat_fa jsonb:='{"rows":[{"tipo":"vendita","imponibile":1000,"iva":220,"aliquota":22,"esigibilita":"immediata","split_payment":false,"documento_id":"FT-A-001","riga_idx":0}]}';
 ledger_fa jsonb:='{"mode":"open","openings":[{"tipo":"cliente","conto_id":"71000000-0000-4000-8000-000000000010","numero_documento":"FT-A-001","data_documento":"2026-03-15","importo_originale":1220}],"closures":[]}';
 wh_none jsonb:='{"eventType":"none","inserts":[],"updates":[]}';
 id_first uuid; id_same uuid; partita_id uuid; n integer; residuo numeric;
 header_pay jsonb; rows_pay jsonb; ledger_pay jsonb;
BEGIN
 id_first:=public.fiscosim_post_fiscal_journal(
  a,ua,key_fa,'fattura_attiva','registrazione_manual',
  header,rows_fa,vat_fa,ledger_fa,wh_none,
  'Verified active invoice twenty two percent lab case');
 id_same:=public.fiscosim_post_fiscal_journal(
  a,ua,key_fa,'fattura_attiva','registrazione_manual',
  header,rows_fa,vat_fa,ledger_fa,wh_none,
  'Verified active invoice twenty two percent lab case');
 IF id_first IS NULL OR id_first IS DISTINCT FROM id_same THEN
  RAISE EXCEPTION 'Stage3W exact fiscal replay did not return same PN ID';
 END IF;

 SELECT count(*) INTO n FROM public.prima_nota WHERE id=id_first AND societa_id=a;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W fattura missing PN header'; END IF;
 SELECT count(*) INTO n FROM public.prima_nota_righe WHERE prima_nota_id=id_first;
 IF n<>3 THEN RAISE EXCEPTION 'Stage3W fattura expected 3 journal lines'; END IF;
 SELECT count(*) INTO n FROM public.registri_iva WHERE prima_nota_id=id_first AND iva=220 AND imponibile=1000;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W fattura VAT row mismatch'; END IF;
 SELECT id,importo_residuo INTO partita_id,residuo FROM public.partitario
  WHERE prima_nota_id=id_first AND societa_id=a;
 IF partita_id IS NULL OR residuo IS DISTINCT FROM 1220 THEN
  RAISE EXCEPTION 'Stage3W fattura partita residual expected 1220';
 END IF;
 SELECT count(*) INTO n FROM public.audit_contabile WHERE entity_id=id_first;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W audit must occur once on replay'; END IF;

 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   a,ua,key_fa,'fattura_attiva','registrazione_manual',
   header,
   '[{"conto_id":"71000000-0000-4000-8000-000000000010","dare":2000,"avere":0},{"conto_id":"71000000-0000-4000-8000-000000000011","dare":0,"avere":2000}]'::jsonb,
   vat_fa,ledger_fa,wh_none,
   'Verified active invoice twenty two percent lab case');
  RAISE EXCEPTION 'SECURITY FAILURE: reused fiscal key accepted changed payload';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3W idempotency key reused%' THEN RAISE; END IF;
 END;

 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   a,ub,key_pay,'fattura_attiva','registrazione_manual',
   header,rows_fa,vat_fa,ledger_fa,wh_none,
   'Cross-company actor fiscal request must always fail');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign actor posted fiscal PN';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3W actor lacks%' THEN RAISE; END IF;
 END;

 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   a,ua,'71000000-0000-4000-8000-000000000096','fattura_attiva','registrazione_manual',
   header,
   '[{"conto_id":"71000000-0000-4000-8000-000000000020","dare":1220,"avere":0},{"conto_id":"71000000-0000-4000-8000-000000000011","dare":0,"avere":1000},{"conto_id":"71000000-0000-4000-8000-000000000012","dare":0,"avere":220}]'::jsonb,
   vat_fa,ledger_fa,wh_none,
   'Foreign chart account fiscal request must always fail');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign chart account posted fiscal PN';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3W invalid amount or out-of-company%' THEN RAISE; END IF;
 END;

 -- Partial payment 500 against residual 1220 -> residual 720
 header_pay:='{"data_registrazione":"2026-03-20","descrizione":"Incasso parziale cliente fattura FT-A-001"}';
 rows_pay:=format(
  '[{"conto_id":"71000000-0000-4000-8000-000000000013","dare":500,"avere":0},{"conto_id":"71000000-0000-4000-8000-000000000010","dare":0,"avere":500}]'
 )::jsonb;
 ledger_pay:=jsonb_build_object(
  'mode','close',
  'openings','[]'::jsonb,
  'closures',jsonb_build_array(jsonb_build_object('partita_id',partita_id,'importo_chiuso',500))
 );
 PERFORM public.fiscosim_post_fiscal_journal(
  a,ua,key_pay,'pagamento','registrazione_manual',
  header_pay,rows_pay,NULL,ledger_pay,wh_none,
  'Verified partial customer collection five hundred euro');
 SELECT importo_residuo INTO residuo FROM public.partitario WHERE id=partita_id;
 IF residuo IS DISTINCT FROM 720 THEN
  RAISE EXCEPTION 'Stage3W partial payment residual expected 720 got %',residuo;
 END IF;

 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   a,ua,'71000000-0000-4000-8000-000000000095','pagamento','registrazione_manual',
   header_pay,rows_pay,NULL,
   jsonb_build_object(
    'mode','close','openings','[]'::jsonb,
    'closures',jsonb_build_array(jsonb_build_object('partita_id',partita_id,'importo_chiuso',9999))
   ),
   wh_none,
   'Overpay closure must be rejected by residual lock');
  RAISE EXCEPTION 'SECURITY FAILURE: overpay closure accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Stage3W closure exceeds residual%' THEN RAISE; END IF;
 END;

 -- Late audit failure after PN/VAT/partite inserts must leave zero residual for the failed key
 REVOKE INSERT ON public.audit_contabile FROM service_role;
 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   a,ua,key_fail,'fattura_passiva','registrazione_manual',
   '{"data_registrazione":"2026-03-16","numero_documento":"FT-P-001","descrizione":"Fattura passiva ordinaria 22 percento"}'::jsonb,
   '[
     {"conto_id":"71000000-0000-4000-8000-000000000014","dare":1000,"avere":0},
     {"conto_id":"71000000-0000-4000-8000-000000000015","dare":220,"avere":0},
     {"conto_id":"71000000-0000-4000-8000-000000000016","dare":0,"avere":1220}
   ]'::jsonb,
   '{"rows":[{"tipo":"acquisto","imponibile":1000,"iva":220,"aliquota":22,"documento_id":"FT-P-001","riga_idx":0}]}'::jsonb,
   '{"mode":"open","openings":[{"tipo":"fornitore","conto_id":"71000000-0000-4000-8000-000000000016","numero_documento":"FT-P-001","importo_originale":1220}],"closures":[]}'::jsonb,
   wh_none,
   'Forced late audit failure for fiscal rollback proof');
  RAISE EXCEPTION 'SECURITY FAILURE: fiscal post succeeded without audit privilege';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 GRANT INSERT ON public.audit_contabile TO service_role;

 IF EXISTS(SELECT 1 FROM public.fiscosim_fiscal_journal_claim WHERE request_id=key_fail) THEN
  RAISE EXCEPTION 'failed audit left fiscal idempotency claim';
 END IF;
 IF EXISTS(SELECT 1 FROM public.prima_nota WHERE numero_documento='FT-P-001') THEN
  RAISE EXCEPTION 'failed audit left a posted fiscal PN';
 END IF;
 IF EXISTS(SELECT 1 FROM public.registri_iva WHERE documento_id='FT-P-001') THEN
  RAISE EXCEPTION 'failed audit left VAT rows';
 END IF;
 IF EXISTS(SELECT 1 FROM public.partitario WHERE numero_documento='FT-P-001') THEN
  RAISE EXCEPTION 'failed audit left partita rows';
 END IF;

 RAISE NOTICE 'Stage3W fiscal journal balance / ownership / idempotency / residual matrix PASS';
END $test$;

RESET ROLE;
DO $done$
BEGIN
 RAISE NOTICE 'STAGE3W_LAB_MATRIX|PASS|FIXTURE_ROLLBACK';
END $done$;
ROLLBACK;
