-- Stage3W fiscal atomic commit preflight — READ ONLY, no DDL/DML.
-- Markers use SELECT (not RAISE NOTICE) so PowerShell -t matching works like Stage3U.
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
DO $pre$
DECLARE
 missing text[] := ARRAY[]::text[];
 t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3w_readonly_preflight',true)
   IS DISTINCT FROM 'local-fiscal-journal-readonly-preflight' THEN
  RAISE EXCEPTION 'Stage3W read-only preflight requires opt-in GUC';
 END IF;

 FOREACH t IN ARRAY ARRAY[
  'societa','utenti_studio','utenti_studio_societa','piano_conti','causali_contabili',
  'prima_nota','prima_nota_righe','registri_iva','partitario','ritenute_dacconto','audit_contabile'
 ] LOOP
  IF to_regclass('public.'||t) IS NULL THEN
   missing := array_append(missing, t);
  END IF;
 END LOOP;
 IF cardinality(missing)>0 THEN
  RAISE EXCEPTION 'Stage3W fiscal tables MISSING: {%}', array_to_string(missing,',');
 END IF;

 SELECT array_agg(rel||'.'||col ORDER BY rel,col) INTO missing
 FROM (VALUES
  ('registri_iva','prima_nota_id'),('registri_iva','societa_id'),
  ('registri_iva','esigibilita'),('registri_iva','split_payment'),
  ('registri_iva','documento_id'),('registri_iva','riga_idx'),
  ('registri_iva','data'),('registri_iva','imponibile'),('registri_iva','iva'),
  ('registri_iva','aliquota'),('registri_iva','tipo'),
  ('registri_iva','detraibile'),('registri_iva','percentuale_detraibilita'),
  ('registri_iva','iva_detraibile'),('registri_iva','iva_indetraibile'),
  ('partitario','importo_residuo'),('partitario','importo_originale'),
  ('partitario','importo_pagato'),('partitario','stato'),
  ('partitario','prima_nota_id'),('partitario','societa_id'),
  ('partitario','chiusa_da_prima_nota_id'),('partitario','data_chiusura'),
  ('ritenute_dacconto','prima_nota_id'),
  ('ritenute_dacconto','prima_nota_pagamento_id'),
  ('ritenute_dacconto','importo_ritenuta'),('ritenute_dacconto','ritenuta'),
  ('ritenute_dacconto','compenso_lordo'),('ritenute_dacconto','compenso_netto'),
  ('ritenute_dacconto','codice_tributo'),('ritenute_dacconto','stato'),
  ('prima_nota','cliente_fornitore_nome'),('prima_nota','stato'),
  ('prima_nota','totale_dare'),('prima_nota','totale_avere')
 ) AS required(rel,col)
 WHERE NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=('public.'||rel)::regclass
   AND a.attname=col AND a.attnum>0 AND NOT a.attisdropped
 );
 IF missing IS NOT NULL THEN
  RAISE EXCEPTION 'Stage3W accounting columns MISSING: %',missing;
 END IF;

 IF NOT has_table_privilege('service_role','public.prima_nota','INSERT')
  OR NOT has_table_privilege('service_role','public.prima_nota_righe','INSERT')
  OR NOT has_table_privilege('service_role','public.registri_iva','INSERT')
  OR NOT has_table_privilege('service_role','public.partitario','INSERT')
  OR NOT has_table_privilege('service_role','public.partitario','UPDATE')
  OR NOT has_table_privilege('service_role','public.ritenute_dacconto','INSERT')
  OR NOT has_table_privilege('service_role','public.audit_contabile','INSERT')
 THEN RAISE EXCEPTION 'Stage3W service-role accounting table grants incomplete'; END IF;
END $pre$;
SELECT 'STAGE3W_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST' AS result;
SELECT 'STAGE3W_PN_COUNT|'||(SELECT count(*) FROM public.prima_nota)::text AS result;
SELECT 'STAGE3W_VAT_COUNT|'||(SELECT count(*) FROM public.registri_iva)::text AS result;
SELECT 'STAGE3W_PARTITA_COUNT|'||(SELECT count(*) FROM public.partitario)::text AS result;
SELECT 'STAGE3W_WH_COUNT|'||(SELECT count(*) FROM public.ritenute_dacconto)::text AS result;
SELECT 'STAGE3W_IVA_PER_CASSA|'||EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute
  WHERE attrelid='public.partitario'::regclass
   AND attname='iva_per_cassa' AND attnum>0 AND NOT attisdropped
 )::text AS result;
SELECT 'STAGE3W_RPC_PRESENT|'||(
  to_regprocedure(
   'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
  ) IS NOT NULL
 )::text AS result;
SELECT 'STAGE3U_RPC_PRESERVED|'||(
  to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL
 )::text AS result;
ROLLBACK;
