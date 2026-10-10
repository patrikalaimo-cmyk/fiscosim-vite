-- Stage3W fiscal atomic commit preflight — READ ONLY, no DDL/DML.
-- Does not install Stage3W and does not post accounting rows.
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

 IF NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='registri_iva' AND column_name='prima_nota_id'
 ) OR NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='registri_iva' AND column_name='societa_id'
 ) OR NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='registri_iva' AND column_name='esigibilita'
 ) OR NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='registri_iva' AND column_name='split_payment'
 ) THEN RAISE EXCEPTION 'Stage3W accounting columns MISSING on registri_iva'; END IF;

 IF NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='partitario' AND column_name='importo_residuo'
 ) OR NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ritenute_dacconto' AND column_name='prima_nota_id'
 ) OR NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ritenute_dacconto' AND column_name='prima_nota_pagamento_id'
 ) THEN RAISE EXCEPTION 'Stage3W accounting columns MISSING on partitario/ritenute'; END IF;

 IF NOT has_table_privilege('service_role','public.prima_nota','INSERT')
  OR NOT has_table_privilege('service_role','public.prima_nota_righe','INSERT')
  OR NOT has_table_privilege('service_role','public.registri_iva','INSERT')
  OR NOT has_table_privilege('service_role','public.partitario','INSERT')
  OR NOT has_table_privilege('service_role','public.partitario','UPDATE')
  OR NOT has_table_privilege('service_role','public.ritenute_dacconto','INSERT')
  OR NOT has_table_privilege('service_role','public.audit_contabile','INSERT')
 THEN RAISE EXCEPTION 'Stage3W service-role accounting table grants incomplete'; END IF;

 RAISE NOTICE 'STAGE3W_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST';
 RAISE NOTICE 'STAGE3W_PN_COUNT|%',(SELECT count(*) FROM public.prima_nota);
 RAISE NOTICE 'STAGE3W_VAT_COUNT|%',(SELECT count(*) FROM public.registri_iva);
 RAISE NOTICE 'STAGE3W_PARTITA_COUNT|%',(SELECT count(*) FROM public.partitario);
 RAISE NOTICE 'STAGE3W_RPC_PRESENT|%',(
  to_regprocedure(
   'public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)'
  ) IS NOT NULL
 );
 RAISE NOTICE 'STAGE3U_RPC_PRESERVED|%',(
  to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL
 );
END $pre$;
ROLLBACK;
