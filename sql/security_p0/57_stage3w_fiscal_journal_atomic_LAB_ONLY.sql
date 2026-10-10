-- Stage3W candidate / FISCAL JOURNAL ATOMIC COMMIT (SG-P0-01).
-- Single SECURITY INVOKER RPC posts PN + lines + VAT + partitario + ritenute + audit
-- and an immutable idempotency claim in ONE PostgreSQL transaction.
-- Does NOT alter Stage3U fiscosim_post_general_journal.
-- Isolated LAB ONLY: never run on live Supabase. Requires explicit approval GUC.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3w_approval',true)
   IS DISTINCT FROM 'local-fiscal-journal-atomic-candidate-only' THEN
  RAISE EXCEPTION 'Stage3W requires explicit isolated LAB approval';
 END IF;
 FOREACH t IN ARRAY ARRAY[
  'societa','utenti_studio','utenti_studio_societa','piano_conti','causali_contabili',
  'prima_nota','prima_nota_righe','registri_iva','partitario','ritenute_dacconto','audit_contabile'
 ] LOOP
  IF to_regclass('public.'||t) IS NULL THEN
   RAISE EXCEPTION 'Stage3W missing fiscal prerequisite %',t;
  END IF;
 END LOOP;
 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_constraint c
  WHERE c.conrelid='public.prima_nota_righe'::regclass
   AND c.confrelid='public.prima_nota'::regclass AND c.contype='f'
 ) THEN RAISE EXCEPTION 'Stage3W journal rows require FK to Prima Nota header'; END IF;
 IF to_regclass('public.fiscosim_fiscal_journal_claim') IS NOT NULL
  OR to_regprocedure(
   'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
  ) IS NOT NULL
 THEN RAISE EXCEPTION 'Stage3W already present: never rerun without a fresh audit'; END IF;
 -- Refuse install on a non-empty fiscal ledger (preserve Stage3U / prior fixtures).
 IF (SELECT count(*) FROM public.prima_nota)<>0
  OR (SELECT count(*) FROM public.prima_nota_righe)<>0
  OR (SELECT count(*) FROM public.registri_iva)<>0
  OR (SELECT count(*) FROM public.partitario)<>0
  OR (SELECT count(*) FROM public.ritenute_dacconto)<>0
 THEN RAISE EXCEPTION 'Stage3W candidate restricted to an empty fiscal LAB ledger'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='clienti' AND policyname='clienti_company_boundary'
   AND permissive='RESTRICTIVE') THEN
  RAISE EXCEPTION 'Stage3W requires verified Stage3S security baseline';
 END IF;
 -- Stage3U general journal must remain untouched if present.
 IF to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL
  AND NOT EXISTS(
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
    AND p.prosecdef IS FALSE
  ) THEN RAISE EXCEPTION 'Stage3W refuses to proceed if Stage3U invoker contract is broken'; END IF;
END $preflight$;

CREATE TABLE public.fiscosim_fiscal_journal_claim(
 societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 contract_kind text NOT NULL,
 request_payload jsonb NOT NULL,
 prima_nota_id uuid REFERENCES public.prima_nota(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(societa_id,request_id),
 CONSTRAINT fiscal_claim_payload_object CHECK(jsonb_typeof(request_payload)='object'),
 CONSTRAINT fiscal_claim_kind_check CHECK(contract_kind IN (
  'fattura_attiva','fattura_passiva','nota_credito_attiva','nota_credito_passiva',
  'pagamento','parcella_documento','split_attiva'
 ))
);
ALTER TABLE public.fiscosim_fiscal_journal_claim ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscosim_fiscal_journal_claim FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.fiscosim_fiscal_journal_claim TO service_role;

CREATE FUNCTION public.fiscosim_post_fiscal_journal(
 p_societa_id uuid,
 p_auth_user_id uuid,
 p_request_id uuid,
 p_contract_kind text,
 p_source_module text,
 p_header jsonb,
 p_rows jsonb,
 p_vat jsonb,
 p_ledger jsonb,
 p_withholding jsonb,
 p_reason text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_actor uuid;
 v_header_keys text[];
 v_line jsonb;
 v_index integer:=0;
 v_line_count bigint:=0;
 v_conto uuid;
 v_dare numeric;
 v_avere numeric;
 v_total_dare numeric:=0;
 v_total_avere numeric:=0;
 v_pn_id uuid;
 v_prior public.fiscosim_fiscal_journal_claim%ROWTYPE;
 v_claim jsonb;
 v_date date;
 v_doc_date date;
 v_causale uuid;
 v_vat_row jsonb;
 v_vat_idx integer:=0;
 v_open jsonb;
 v_close jsonb;
 v_partita public.partitario%ROWTYPE;
 v_inc numeric;
 v_pagato numeric;
 v_residuo numeric;
 v_opened_partita_id uuid;
 v_wh jsonb;
 v_wh_id uuid;
 v_source text;
BEGIN
 IF p_societa_id IS NULL OR p_auth_user_id IS NULL OR p_request_id IS NULL
  OR p_contract_kind IS NULL
  OR p_contract_kind NOT IN (
   'fattura_attiva','fattura_passiva','nota_credito_attiva','nota_credito_passiva',
   'pagamento','parcella_documento','split_attiva')
  OR p_source_module IS NULL
  OR p_source_module NOT IN ('registrazione_manual','import_contabilita')
  OR p_header IS NULL OR jsonb_typeof(p_header)<>'object'
  OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
  OR jsonb_array_length(p_rows) NOT BETWEEN 2 AND 100
  OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500
  OR pg_column_size(p_rows)>100000
 THEN RAISE EXCEPTION 'Stage3W fiscal journal request malformed'; END IF;

 SELECT array_agg(k) INTO v_header_keys FROM jsonb_object_keys(p_header) k
 WHERE k NOT IN (
  'data_registrazione','data_documento','numero_documento','descrizione',
  'causale_id','cliente_fornitore_nome'
 );
 IF cardinality(coalesce(v_header_keys,ARRAY[]::text[]))>0
  OR char_length(btrim(coalesce(p_header->>'descrizione',''))) NOT BETWEEN 5 AND 500
  OR coalesce(p_header->>'data_registrazione','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION 'Stage3W header missing required fields or has restricted properties'; END IF;

 v_date:=(p_header->>'data_registrazione')::date;
 IF v_date < DATE '2000-01-01' OR v_date > (current_date + INTERVAL '1 year')::date
 THEN RAISE EXCEPTION 'Stage3W journal date outside allowed interval'; END IF;
 v_doc_date:=nullif(p_header->>'data_documento','')::date;
 IF v_doc_date IS NULL THEN v_doc_date:=v_date; END IF;

 v_causale:=nullif(p_header->>'causale_id','')::uuid;
 IF v_causale IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.causali_contabili c
  WHERE c.id=v_causale AND c.societa_id=p_societa_id
 ) THEN RAISE EXCEPTION 'Stage3W cross-company accounting cause'; END IF;

 SELECT us.id INTO v_actor FROM public.utenti_studio us
 JOIN public.utenti_studio_societa m
  ON m.utente_id=us.id AND m.auth_user_id=us.auth_user_id
 JOIN public.societa company ON company.id=m.societa_id
 WHERE us.auth_user_id=p_auth_user_id AND us.attivo IS TRUE
  AND us.ruolo IN ('owner','admin') AND m.ruolo IN ('owner','admin')
  AND m.societa_id=p_societa_id AND company.attiva IS TRUE
 LIMIT 1;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Stage3W actor lacks company fiscal permission'; END IF;

 -- Closed period: refuse if a valid definitive print covers the registration date.
 IF to_regclass('public.stampe_definitive') IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.stampe_definitive s
  WHERE s.societa_id=p_societa_id
   AND coalesce(s.stato,'valida')='valida'
   AND s.periodo_inizio IS NOT NULL AND s.periodo_fine IS NOT NULL
   AND v_date BETWEEN s.periodo_inizio AND s.periodo_fine
 ) THEN RAISE EXCEPTION 'Stage3W period locked by definitive print'; END IF;

 v_claim:=jsonb_build_object(
  'contract_kind',p_contract_kind,
  'source_module',p_source_module,
  'header',p_header,
  'rows',p_rows,
  'vat',coalesce(p_vat,'null'::jsonb),
  'ledger',coalesce(p_ledger,'null'::jsonb),
  'withholding',coalesce(p_withholding,'null'::jsonb),
  'reason',btrim(p_reason)
 );

 INSERT INTO public.fiscosim_fiscal_journal_claim
  (societa_id,request_id,auth_user_id,contract_kind,request_payload)
 VALUES (p_societa_id,p_request_id,p_auth_user_id,p_contract_kind,v_claim)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO v_prior FROM public.fiscosim_fiscal_journal_claim
  WHERE societa_id=p_societa_id AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_prior.auth_user_id IS DISTINCT FROM p_auth_user_id
   OR v_prior.contract_kind IS DISTINCT FROM p_contract_kind
   OR v_prior.request_payload IS DISTINCT FROM v_claim
   OR v_prior.prima_nota_id IS NULL THEN
   RAISE EXCEPTION 'Stage3W idempotency key reused with different or incomplete operation';
  END IF;
  RETURN v_prior.prima_nota_id;
 END IF;

 FOR v_line IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(v_line)<>'object'
   OR (SELECT count(*) FROM jsonb_object_keys(v_line) k
      WHERE k NOT IN ('conto_id','dare','avere','descrizione'))>0
   OR jsonb_typeof(v_line->'dare') IS DISTINCT FROM 'number'
   OR jsonb_typeof(v_line->'avere') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'Stage3W restricted journal row fields'; END IF;
  v_conto:=nullif(v_line->>'conto_id','')::uuid;
  v_dare:=(v_line->>'dare')::numeric;
  v_avere:=(v_line->>'avere')::numeric;
  IF v_dare<0 OR v_avere<0 OR v_dare>999999999999.99 OR v_avere>999999999999.99
   OR round(v_dare,2)<>v_dare OR round(v_avere,2)<>v_avere
   OR (v_dare=0 AND v_avere=0) OR (v_dare>0 AND v_avere>0)
   OR char_length(coalesce(v_line->>'descrizione',''))>500
   OR NOT EXISTS(SELECT 1 FROM public.piano_conti pc WHERE pc.id=v_conto
    AND pc.societa_id=p_societa_id AND pc.attivo IS TRUE)
  THEN RAISE EXCEPTION 'Stage3W invalid amount or out-of-company ledger account'; END IF;
  v_total_dare:=v_total_dare+v_dare;
  v_total_avere:=v_total_avere+v_avere;
 END LOOP;
 IF v_total_dare<=0 OR v_total_dare<>v_total_avere THEN
  RAISE EXCEPTION 'Stage3W unbalanced fiscal journal';
 END IF;

 INSERT INTO public.prima_nota(
  societa_id,data_registrazione,data_documento,numero_documento,causale_id,
  descrizione,cliente_fornitore_nome,stato,totale_dare,totale_avere,created_by
 ) VALUES (
  p_societa_id,v_date,v_doc_date,nullif(p_header->>'numero_documento',''),v_causale,
  btrim(p_header->>'descrizione'),nullif(p_header->>'cliente_fornitore_nome',''),
  'confermata',v_total_dare,v_total_avere,v_actor
 ) RETURNING id INTO v_pn_id;

 FOR v_line IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  v_index:=v_index+1;
  v_conto:=(v_line->>'conto_id')::uuid;
  IF EXISTS(
   SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.prima_nota_righe'::regclass
    AND attname='societa_id' AND attnum>0 AND NOT attisdropped
  ) THEN
   EXECUTE $line_with_company$
    INSERT INTO public.prima_nota_righe(
     prima_nota_id,societa_id,riga_numero,conto_id,
     conto_codice,conto_descrizione,descrizione_riga,importo_dare,importo_avere
    )
    SELECT $1,$2,$3,$4,pc.codice,pc.descrizione,$5,$6,$7
    FROM public.piano_conti pc
    WHERE pc.id=$4 AND pc.societa_id=$2 AND pc.attivo IS TRUE
   $line_with_company$
   USING v_pn_id,p_societa_id,v_index,v_conto,
    nullif(btrim(v_line->>'descrizione'),''),
    (v_line->>'dare')::numeric,(v_line->>'avere')::numeric;
  ELSE
   INSERT INTO public.prima_nota_righe(
    prima_nota_id,riga_numero,conto_id,
    conto_codice,conto_descrizione,descrizione_riga,importo_dare,importo_avere
   ) SELECT
    v_pn_id,v_index,v_conto,pc.codice,pc.descrizione,
    nullif(btrim(v_line->>'descrizione'),''),
    (v_line->>'dare')::numeric,(v_line->>'avere')::numeric
   FROM public.piano_conti pc
   WHERE pc.id=v_conto AND pc.societa_id=p_societa_id AND pc.attivo IS TRUE;
  END IF;
  GET DIAGNOSTICS v_line_count = ROW_COUNT;
  IF v_line_count<>1 THEN RAISE EXCEPTION 'Stage3W chart account changed during posting'; END IF;
 END LOOP;

 -- VAT rows (optional for pure payment without cash-VAT release in this candidate).
 IF p_vat IS NOT NULL AND jsonb_typeof(p_vat)='object' AND jsonb_typeof(p_vat->'rows')='array' THEN
  FOR v_vat_row IN SELECT value FROM jsonb_array_elements(p_vat->'rows') LOOP
   v_vat_idx:=v_vat_idx+1;
   IF jsonb_typeof(v_vat_row)<>'object'
    OR coalesce(v_vat_row->>'tipo','') NOT IN ('acquisto','vendita')
    OR jsonb_typeof(v_vat_row->'imponibile') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_vat_row->'iva') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'Stage3W invalid VAT row'; END IF;
   IF p_contract_kind='split_attiva' AND coalesce((v_vat_row->>'split_payment')::boolean,false) IS NOT TRUE
   THEN RAISE EXCEPTION 'Stage3W split contract requires split_payment on VAT rows'; END IF;
   INSERT INTO public.registri_iva(
    documento_id,riga_idx,data,imponibile,iva,aliquota,tipo,
    detraibile,percentuale_detraibilita,iva_detraibile,iva_indetraibile,
    prima_nota_id,societa_id,numero_documento,data_documento,
    soggetto_denominazione,soggetto_piva,esigibilita,split_payment,causale_iva_id
   ) VALUES (
    coalesce(nullif(v_vat_row->>'documento_id',''),nullif(p_header->>'numero_documento',''),p_request_id::text),
    coalesce((v_vat_row->>'riga_idx')::int,v_vat_idx-1),
    v_date,
    (v_vat_row->>'imponibile')::numeric,
    (v_vat_row->>'iva')::numeric,
    nullif(v_vat_row->>'aliquota','')::numeric,
    v_vat_row->>'tipo',
    coalesce((v_vat_row->>'percentuale_detraibilita')::numeric,100) > 0,
    coalesce((v_vat_row->>'percentuale_detraibilita')::numeric,100),
    coalesce((v_vat_row->>'iva_detraibile')::numeric,(v_vat_row->>'iva')::numeric),
    coalesce((v_vat_row->>'iva_indetraibile')::numeric,0),
    v_pn_id,p_societa_id,
    coalesce(nullif(v_vat_row->>'numero_documento',''),nullif(p_header->>'numero_documento','')),
    coalesce(nullif(v_vat_row->>'data_documento','')::date,v_doc_date),
    nullif(v_vat_row->>'soggetto_denominazione',''),
    nullif(v_vat_row->>'soggetto_piva',''),
    coalesce(nullif(v_vat_row->>'esigibilita',''),'immediata'),
    coalesce((v_vat_row->>'split_payment')::boolean,false),
    nullif(v_vat_row->>'causale_iva_id','')::uuid
   );
  END LOOP;
 ELSIF p_contract_kind IN (
  'fattura_attiva','fattura_passiva','nota_credito_attiva','nota_credito_passiva',
  'parcella_documento','split_attiva'
 ) THEN
  RAISE EXCEPTION 'Stage3W fiscal document contract requires VAT section';
 END IF;

 -- Ledger openings / closures
 IF p_ledger IS NOT NULL AND jsonb_typeof(p_ledger)='object' THEN
  IF coalesce(p_ledger->>'mode','none') IN ('open','mixed')
   AND jsonb_typeof(p_ledger->'openings')='array' THEN
   FOR v_open IN SELECT value FROM jsonb_array_elements(p_ledger->'openings') LOOP
    IF coalesce(v_open->>'tipo','') NOT IN ('cliente','fornitore')
     OR jsonb_typeof(v_open->'importo_originale') IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'Stage3W invalid partita opening'; END IF;
    IF v_open ? 'conto_id' AND nullif(v_open->>'conto_id','') IS NOT NULL
     AND NOT EXISTS(
      SELECT 1 FROM public.piano_conti pc
      WHERE pc.id=(v_open->>'conto_id')::uuid
       AND pc.societa_id=p_societa_id AND pc.attivo IS TRUE
     ) THEN RAISE EXCEPTION 'Stage3W partita account out of company'; END IF;
    INSERT INTO public.partitario(
     societa_id,tipo,conto_id,prima_nota_id,numero_documento,data_documento,data_scadenza,
     importo_originale,importo_pagato,importo_residuo,stato,iva_per_cassa
    ) VALUES (
     p_societa_id,v_open->>'tipo',nullif(v_open->>'conto_id','')::uuid,v_pn_id,
     coalesce(nullif(v_open->>'numero_documento',''),nullif(p_header->>'numero_documento','')),
     coalesce(nullif(v_open->>'data_documento','')::date,v_doc_date),
     nullif(v_open->>'data_scadenza','')::date,
     (v_open->>'importo_originale')::numeric,0,(v_open->>'importo_originale')::numeric,
     'aperta',coalesce((v_open->>'iva_per_cassa')::boolean,false)
    ) RETURNING id INTO v_opened_partita_id;
   END LOOP;
  END IF;

  IF coalesce(p_ledger->>'mode','none') IN ('close','mixed')
   AND jsonb_typeof(p_ledger->'closures')='array' THEN
   FOR v_close IN SELECT value FROM jsonb_array_elements(p_ledger->'closures') LOOP
    IF nullif(v_close->>'partita_id','') IS NULL
     OR jsonb_typeof(v_close->'importo_chiuso') IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'Stage3W invalid partita closure'; END IF;
    SELECT * INTO v_partita FROM public.partitario
     WHERE id=(v_close->>'partita_id')::uuid
     FOR UPDATE;
    IF NOT FOUND OR v_partita.societa_id IS DISTINCT FROM p_societa_id THEN
     RAISE EXCEPTION 'Stage3W partita missing or cross-company';
    END IF;
    IF v_partita.stato='chiusa' THEN
     RAISE EXCEPTION 'Stage3W partita already closed';
    END IF;
    v_inc:=(v_close->>'importo_chiuso')::numeric;
    IF abs(v_inc) > abs(v_partita.importo_residuo) + 0.01 THEN
     RAISE EXCEPTION 'Stage3W closure exceeds residual';
    END IF;
    v_pagato:=round((v_partita.importo_pagato + v_inc)::numeric,2);
    v_residuo:=round((v_partita.importo_originale - v_pagato)::numeric,2);
    IF abs(v_residuo) <= 0.01 THEN
     UPDATE public.partitario SET
      importo_pagato=v_partita.importo_originale,
      importo_residuo=0,
      stato='chiusa',
      chiusa_da_prima_nota_id=v_pn_id,
      data_chiusura=v_date,
      updated_at=transaction_timestamp()
     WHERE id=v_partita.id;
    ELSE
     UPDATE public.partitario SET
      importo_pagato=v_pagato,
      importo_residuo=v_residuo,
      stato='aperta',
      updated_at=transaction_timestamp()
     WHERE id=v_partita.id;
    END IF;
   END LOOP;
  END IF;
 END IF;

 IF p_contract_kind IN (
  'fattura_attiva','fattura_passiva','nota_credito_attiva','nota_credito_passiva',
  'parcella_documento','split_attiva'
 ) AND (p_ledger IS NULL OR coalesce(p_ledger->>'mode','none')='none') THEN
  RAISE EXCEPTION 'Stage3W document contract requires ledger openings';
 END IF;
 IF p_contract_kind='pagamento'
  AND (p_ledger IS NULL OR coalesce(p_ledger->>'mode','none') NOT IN ('close','mixed')) THEN
  RAISE EXCEPTION 'Stage3W payment contract requires ledger closures';
 END IF;

 -- Withholding inserts / payment maturation updates (same transaction).
 IF p_withholding IS NOT NULL AND jsonb_typeof(p_withholding)='object' THEN
  IF coalesce(p_withholding->>'eventType','none')='documento'
   AND jsonb_typeof(p_withholding->'inserts')='array' THEN
   FOR v_wh IN SELECT value FROM jsonb_array_elements(p_withholding->'inserts') LOOP
    INSERT INTO public.ritenute_dacconto(
     societa_id,prima_nota_id,partitario_id,percipiente_id,percipiente_cf,percipiente_denominazione,
     data_documento,numero_documento,compenso_lordo,imponibile_ritenuta,aliquota_ritenuta,
     importo_ritenuta,ritenuta,compenso_netto,contributo_cassa_prev,codice_tributo,stato,causale_prestazione
    ) VALUES (
     p_societa_id,v_pn_id,v_opened_partita_id,
     nullif(v_wh->>'percipiente_id','')::uuid,
     nullif(v_wh->>'percipiente_cf',''),
     nullif(v_wh->>'percipiente_denominazione',''),
     coalesce(nullif(v_wh->>'data_documento','')::date,v_doc_date),
     coalesce(nullif(v_wh->>'numero_documento',''),nullif(p_header->>'numero_documento','')),
     coalesce((v_wh->>'compenso_lordo')::numeric,0),
     nullif(v_wh->>'imponibile_ritenuta','')::numeric,
     nullif(v_wh->>'aliquota_ritenuta','')::numeric,
     coalesce((v_wh->>'importo_ritenuta')::numeric,0),
     coalesce((v_wh->>'importo_ritenuta')::numeric,0),
     coalesce((v_wh->>'compenso_netto')::numeric,0),
     coalesce((v_wh->>'contributo_cassa_prev')::numeric,0),
     coalesce(nullif(v_wh->>'codice_tributo',''),'1040'),
     coalesce(nullif(v_wh->>'stato',''),'aperta'),
     nullif(v_wh->>'causale_prestazione','')
    );
   END LOOP;
  ELSIF coalesce(p_withholding->>'eventType','none')='pagamento'
   AND jsonb_typeof(p_withholding->'updates')='array' THEN
   FOR v_wh IN SELECT value FROM jsonb_array_elements(p_withholding->'updates') LOOP
    v_wh_id:=nullif(v_wh->>'id','')::uuid;
    IF v_wh_id IS NULL THEN RAISE EXCEPTION 'Stage3W withholding update missing id'; END IF;
    UPDATE public.ritenute_dacconto r SET
     data_pagamento=coalesce(nullif(v_wh->>'data_pagamento','')::date,v_date),
     data_scadenza=nullif(v_wh->>'data_scadenza','')::date,
     periodo_riferimento=nullif(v_wh->>'periodo_riferimento',''),
     anno_riferimento=nullif(v_wh->>'anno_riferimento','')::int,
     codice_tributo=coalesce(nullif(v_wh->>'codice_tributo',''),r.codice_tributo,'1040'),
     stato=coalesce(nullif(v_wh->>'stato',''),'da_versare'),
     prima_nota_pagamento_id=v_pn_id,
     updated_at=transaction_timestamp()
    WHERE r.id=v_wh_id AND r.societa_id=p_societa_id;
    GET DIAGNOSTICS v_line_count = ROW_COUNT;
    IF v_line_count<>1 THEN RAISE EXCEPTION 'Stage3W withholding update target missing or cross-company'; END IF;
   END LOOP;
  END IF;
 END IF;

 IF p_contract_kind='parcella_documento'
  AND (p_withholding IS NULL OR coalesce(p_withholding->>'eventType','none')<>'documento') THEN
  RAISE EXCEPTION 'Stage3W parcella contract requires withholding documento event';
 END IF;

 v_source:=p_source_module;
 INSERT INTO public.audit_contabile(
  societa_id,entity_type,entity_id,operation_type,operation_reason,
  after_data,performed_by,source_module
 ) VALUES(
  p_societa_id,'prima_nota',v_pn_id,'INSERT',btrim(p_reason),
  jsonb_build_object(
   'request_id',p_request_id,
   'contract_kind',p_contract_kind,
   'header',p_header,
   'lines',p_rows,
   'vat',p_vat,
   'ledger',p_ledger,
   'withholding',p_withholding,
   'total',v_total_dare
  ),
  v_actor,v_source
 );

 UPDATE public.fiscosim_fiscal_journal_claim SET prima_nota_id=v_pn_id
 WHERE societa_id=p_societa_id AND request_id=p_request_id;
 RETURN v_pn_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)
 TO service_role;

DO $verify$
BEGIN
 IF (SELECT prosecdef FROM pg_proc WHERE oid=
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'::regprocedure)
 OR has_function_privilege('authenticated',
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)','EXECUTE')
 OR has_table_privilege('authenticated','public.fiscosim_fiscal_journal_claim','SELECT')
 OR has_table_privilege('anon','public.fiscosim_fiscal_journal_claim','SELECT')
 THEN RAISE EXCEPTION 'Stage3W fiscal journal grant/definer safety failure'; END IF;
 -- Confirm Stage3U general journal still exists unchanged when previously installed.
 IF to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL
  AND (SELECT prosecdef FROM pg_proc WHERE oid=
   'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure)
 THEN RAISE EXCEPTION 'Stage3W must not alter Stage3U into SECURITY DEFINER'; END IF;
END $verify$;
COMMIT;
