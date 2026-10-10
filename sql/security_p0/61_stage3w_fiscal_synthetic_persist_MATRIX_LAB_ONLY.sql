-- Stage3W: persistent synthetic matrix on SG-E2E-* (pay/NC/split/parcella/FP22).
-- Requires prior FA22 persist (SQL 60) so SG-E2E-FA22-001 partita exists with residual 1220 or 720.
-- NOT JWT/UI. Opt-in GUC required. Late-audit REVOKE proof stays in ROLLBACK matrix 58 only.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3w_persist_matrix_approval',true)
   IS DISTINCT FROM 'local-fiscal-synthetic-persist-matrix-only' THEN
  RAISE EXCEPTION 'Stage3W synthetic persist matrix requires local opt-in';
 END IF;
 IF to_regprocedure(
   'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
  ) IS NULL THEN
  RAISE EXCEPTION 'Stage3W synthetic persist matrix requires fiscal RPC';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.societa WHERE id='72000000-0000-4000-8000-000000000001' AND codice='SG-E2E-A'
 ) THEN
  RAISE EXCEPTION 'Stage3W synthetic persist matrix requires SG-E2E-A seed (run SQL 60 first)';
 END IF;
END $guard$;

INSERT INTO public.piano_conti(id,societa_id,codice,descrizione,tipo,attivo) VALUES
 ('72000000-0000-4000-8000-000000000013','72000000-0000-4000-8000-000000000001','1.10','Banca SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000014','72000000-0000-4000-8000-000000000001','5.01','Costi SG-E2E-A','economico',true),
 ('72000000-0000-4000-8000-000000000015','72000000-0000-4000-8000-000000000001','2.02','IVA credito SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000016','72000000-0000-4000-8000-000000000001','2.10','Fornitore SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000017','72000000-0000-4000-8000-000000000001','2.03','IVA split tecnico SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000018','72000000-0000-4000-8000-000000000001','2.20','Erario ritenute SG-E2E-A','patrimoniale',true),
 ('72000000-0000-4000-8000-000000000019','72000000-0000-4000-8000-000000000001','4.02','Cassa previdenziale SG-E2E-A','economico',true)
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE service_role;
DO $persist$
DECLARE
 a constant uuid:='72000000-0000-4000-8000-000000000001';
 ua constant uuid:='72000000-0000-4000-8000-000000000003';
 key_pay constant uuid:='72000000-0000-4000-8000-000000000098';
 key_nc constant uuid:='72000000-0000-4000-8000-000000000094';
 key_split constant uuid:='72000000-0000-4000-8000-000000000093';
 key_parc constant uuid:='72000000-0000-4000-8000-000000000092';
 key_fp constant uuid:='72000000-0000-4000-8000-000000000091';
 wh_none jsonb:='{"eventType":"none","inserts":[],"updates":[]}';
 partita_id uuid; residuo numeric; n integer; id_pay uuid; id_fp uuid;
BEGIN
 SELECT id,importo_residuo INTO partita_id,residuo
 FROM public.partitario
 WHERE societa_id=a AND numero_documento='SG-E2E-FA22-001' AND tipo='cliente'
 FOR UPDATE;
 IF partita_id IS NULL THEN
  RAISE EXCEPTION 'Stage3W matrix persist missing FA22 partita SG-E2E-FA22-001';
 END IF;
 IF residuo IS DISTINCT FROM 1220 AND residuo IS DISTINCT FROM 720 THEN
  RAISE EXCEPTION 'Stage3W matrix persist unexpected FA22 residual %', residuo;
 END IF;

 -- Partial payment 500 -> residual 720 (idempotent via claim)
 PERFORM public.fiscosim_post_fiscal_journal(
  a,ua,key_pay,'pagamento','registrazione_manual',
  '{"data_registrazione":"2026-03-20","descrizione":"[SG-E2E] Incasso parziale FA22"}'::jsonb,
  '[
    {"conto_id":"72000000-0000-4000-8000-000000000013","dare":500,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000010","dare":0,"avere":500}
  ]'::jsonb,
  NULL,
  jsonb_build_object(
   'mode','close',
   'openings','[]'::jsonb,
   'closures',jsonb_build_array(jsonb_build_object('partita_id',partita_id,'importo_chiuso',500))
  ),
  wh_none,
  'SG-E2E persistent partial collection five hundred');
 SELECT importo_residuo INTO residuo FROM public.partitario WHERE id=partita_id;
 IF residuo IS DISTINCT FROM 720 THEN
  RAISE EXCEPTION 'Stage3W matrix persist pay residual expected 720 got %', residuo;
 END IF;

 BEGIN
  PERFORM public.fiscosim_post_fiscal_journal(
   a,ua,'72000000-0000-4000-8000-000000000095','pagamento','registrazione_manual',
   '{"data_registrazione":"2026-03-20","descrizione":"[SG-E2E] Overpay must fail"}'::jsonb,
   '[
     {"conto_id":"72000000-0000-4000-8000-000000000013","dare":500,"avere":0},
     {"conto_id":"72000000-0000-4000-8000-000000000010","dare":0,"avere":500}
   ]'::jsonb,
   NULL,
   jsonb_build_object(
    'mode','close','openings','[]'::jsonb,
    'closures',jsonb_build_array(jsonb_build_object('partita_id',partita_id,'importo_chiuso',9999))
   ),
   wh_none,
   'SG-E2E overpay must fail');
  RAISE EXCEPTION 'SECURITY FAILURE: overpay closure accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'SECURITY FAILURE%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE 'Stage3W closure exceeds residual%' THEN RAISE; END IF;
 END;

 -- Nota credito attiva
 PERFORM public.fiscosim_post_fiscal_journal(
  a,ua,key_nc,'nota_credito_attiva','registrazione_manual',
  '{"data_registrazione":"2026-03-18","numero_documento":"SG-E2E-NC22-001","descrizione":"[SG-E2E] Nota credito attiva 22 percento"}'::jsonb,
  '[
    {"conto_id":"72000000-0000-4000-8000-000000000011","dare":1000,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000012","dare":220,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000010","dare":0,"avere":1220}
  ]'::jsonb,
  '{"rows":[{"tipo":"vendita","imponibile":-1000,"iva":-220,"aliquota":22,"documento_id":"SG-E2E-NC22-001","riga_idx":0}]}'::jsonb,
  '{"mode":"open","openings":[{"tipo":"cliente","conto_id":"72000000-0000-4000-8000-000000000010","numero_documento":"SG-E2E-NC22-001","importo_originale":-1220}],"closures":[]}'::jsonb,
  wh_none,
  'SG-E2E persistent NC attiva 22');
 SELECT count(*) INTO n FROM public.registri_iva
  WHERE societa_id=a AND documento_id='SG-E2E-NC22-001' AND iva=-220 AND imponibile=-1000;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W matrix persist NC VAT mismatch'; END IF;
 SELECT importo_residuo INTO residuo FROM public.partitario
  WHERE societa_id=a AND numero_documento='SG-E2E-NC22-001';
 IF residuo IS DISTINCT FROM -1220 THEN
  RAISE EXCEPTION 'Stage3W matrix persist NC residual expected -1220';
 END IF;

 -- Split payment attiva
 PERFORM public.fiscosim_post_fiscal_journal(
  a,ua,key_split,'split_attiva','registrazione_manual',
  '{"data_registrazione":"2026-03-19","numero_documento":"SG-E2E-SPLIT-001","descrizione":"[SG-E2E] Fattura split payment 22 percento"}'::jsonb,
  '[
    {"conto_id":"72000000-0000-4000-8000-000000000010","dare":1000,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000011","dare":0,"avere":1000},
    {"conto_id":"72000000-0000-4000-8000-000000000012","dare":220,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000017","dare":0,"avere":220}
  ]'::jsonb,
  '{"rows":[{"tipo":"vendita","imponibile":1000,"iva":220,"aliquota":22,"split_payment":true,"documento_id":"SG-E2E-SPLIT-001","riga_idx":0}]}'::jsonb,
  '{"mode":"open","openings":[{"tipo":"cliente","conto_id":"72000000-0000-4000-8000-000000000010","numero_documento":"SG-E2E-SPLIT-001","importo_originale":1000}],"closures":[]}'::jsonb,
  wh_none,
  'SG-E2E persistent split attiva 22');
 SELECT importo_residuo INTO residuo FROM public.partitario
  WHERE societa_id=a AND numero_documento='SG-E2E-SPLIT-001';
 IF residuo IS DISTINCT FROM 1000 THEN
  RAISE EXCEPTION 'Stage3W matrix persist split residual expected 1000';
 END IF;
 SELECT count(*) INTO n FROM public.registri_iva
  WHERE societa_id=a AND documento_id='SG-E2E-SPLIT-001' AND split_payment IS TRUE AND iva=220;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W matrix persist split VAT flag missing'; END IF;

 -- Parcella + ritenuta 1040
 PERFORM public.fiscosim_post_fiscal_journal(
  a,ua,key_parc,'parcella_documento','registrazione_manual',
  '{"data_registrazione":"2026-03-21","numero_documento":"SG-E2E-PARC-001","descrizione":"[SG-E2E] Parcella con ritenuta"}'::jsonb,
  '[
    {"conto_id":"72000000-0000-4000-8000-000000000010","dare":1068.80,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000018","dare":200,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000011","dare":0,"avere":1000},
    {"conto_id":"72000000-0000-4000-8000-000000000019","dare":0,"avere":40},
    {"conto_id":"72000000-0000-4000-8000-000000000012","dare":0,"avere":228.80}
  ]'::jsonb,
  '{"rows":[{"tipo":"vendita","imponibile":1040,"iva":228.80,"aliquota":22,"documento_id":"SG-E2E-PARC-001","riga_idx":0}]}'::jsonb,
  '{"mode":"open","openings":[{"tipo":"cliente","conto_id":"72000000-0000-4000-8000-000000000010","numero_documento":"SG-E2E-PARC-001","importo_originale":1068.80}],"closures":[]}'::jsonb,
  '{"eventType":"documento","inserts":[{"percipiente_denominazione":"Professionista SG-E2E","compenso_lordo":1000,"imponibile_ritenuta":1000,"aliquota_ritenuta":20,"importo_ritenuta":200,"compenso_netto":1068.80,"contributo_cassa_prev":40,"codice_tributo":"1040","stato":"aperta"}],"updates":[]}'::jsonb,
  'SG-E2E persistent parcella ritenuta 1040');
 SELECT count(*) INTO n FROM public.ritenute_dacconto
  WHERE societa_id=a AND numero_documento='SG-E2E-PARC-001' AND importo_ritenuta=200 AND codice_tributo='1040';
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W matrix persist parcella withholding missing'; END IF;
 SELECT importo_residuo INTO residuo FROM public.partitario
  WHERE societa_id=a AND numero_documento='SG-E2E-PARC-001';
 IF residuo IS DISTINCT FROM 1068.80 THEN
  RAISE EXCEPTION 'Stage3W matrix persist parcella residual expected 1068.80';
 END IF;

 -- Fattura passiva 22%
 id_fp:=public.fiscosim_post_fiscal_journal(
  a,ua,key_fp,'fattura_passiva','registrazione_manual',
  '{"data_registrazione":"2026-03-16","numero_documento":"SG-E2E-FP22-001","descrizione":"[SG-E2E] Fattura passiva ordinaria 22 percento"}'::jsonb,
  '[
    {"conto_id":"72000000-0000-4000-8000-000000000014","dare":1000,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000015","dare":220,"avere":0},
    {"conto_id":"72000000-0000-4000-8000-000000000016","dare":0,"avere":1220}
  ]'::jsonb,
  '{"rows":[{"tipo":"acquisto","imponibile":1000,"iva":220,"aliquota":22,"documento_id":"SG-E2E-FP22-001","riga_idx":0}]}'::jsonb,
  '{"mode":"open","openings":[{"tipo":"fornitore","conto_id":"72000000-0000-4000-8000-000000000016","numero_documento":"SG-E2E-FP22-001","importo_originale":1220}],"closures":[]}'::jsonb,
  wh_none,
  'SG-E2E persistent FP22');
 SELECT count(*) INTO n FROM public.registri_iva
  WHERE societa_id=a AND documento_id='SG-E2E-FP22-001' AND tipo='acquisto' AND iva=220;
 IF n<>1 THEN RAISE EXCEPTION 'Stage3W matrix persist FP22 VAT missing'; END IF;
 SELECT importo_residuo INTO residuo FROM public.partitario
  WHERE societa_id=a AND numero_documento='SG-E2E-FP22-001' AND tipo='fornitore';
 IF residuo IS DISTINCT FROM 1220 THEN
  RAISE EXCEPTION 'Stage3W matrix persist FP22 residual expected 1220';
 END IF;

 SELECT count(*) INTO n FROM public.prima_nota WHERE societa_id='72000000-0000-4000-8000-000000000002';
 IF n<>0 THEN RAISE EXCEPTION 'Stage3W matrix persist leaked into company B'; END IF;

 RAISE NOTICE 'STAGE3W_SYNTHETIC_PERSIST_MATRIX|PASS|PAY720|NC|SPLIT|PARC|FP22|ID_FP=%', id_fp;
END $persist$;
RESET ROLE;

SELECT 'STAGE3W_SYNTHETIC_PERSIST_MATRIX|PASS|COMMIT_READY' AS result;
COMMIT;
