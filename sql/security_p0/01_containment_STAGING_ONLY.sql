-- FiscoSim P0 containment — STAGING CANDIDATE, NOT APPLIED
-- Target: isolated clone verified against live baseline; NEVER execute on live without
-- additional authorization, point-in-time backup, operator/tenant test and rollback.
-- Requires explicit session variable set by an authorized operator for each test.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE
  rel text;
  fn text;
  expected_tables text[] := ARRAY[
    'adempimenti_clienti','adempimenti_template','avvisi_ade',
    'causali_contabili','causali_iva','coda_import_fatture',
    'deleghe_uniche','documenti_contabilita','documenti_import',
    'f24_righe','f24_scadenze','fatture_xml','impostazioni_studio',
    'invii_log','invii_schedulati','liquidazioni_iva',
    'prima_nota_righe','richieste_fatture','test_cases','test_datasets',
    'test_runs','utenti_studio',
    'ai_feedback_log','ai_learning','partitari','test_scenarios'
  ];
  expected_functions text[] := ARRAY[
    'public.apply_ai_learning_from_feedback(uuid,uuid,uuid,numeric)',
    'public.consolida_periodo_iva_transazionale(uuid,date,date,text,uuid,text,jsonb)',
    'public.consolidazione_stampa_definitiva(uuid,text,integer,date,date,uuid,text,text,jsonb)',
    'public.precheck_stampa_definitiva(uuid,text,integer,date,date)',
    'public.rpc_annulla_prima_nota_logica(uuid,uuid,text,uuid)',
    'public.rpc_get_prima_nota_operation_guards(uuid,uuid,text)',
    'public.rpc_storna_prima_nota_generale(uuid,uuid,text,date,uuid)',
    'public.rpc_update_prima_nota_generale_controllata(uuid,uuid,jsonb,jsonb,text,uuid)'
  ];
BEGIN
  IF current_setting('fiscosim.p0_isolated_approval', true)
     IS DISTINCT FROM 'approved-test-environment-only' THEN
    RAISE EXCEPTION 'P0 hardening blocked: explicit test-environment approval variable missing';
  END IF;
  FOREACH rel IN ARRAY expected_tables LOOP
    IF to_regclass('public.' || rel) IS NULL THEN
      RAISE EXCEPTION 'P0 schema drift: table public.% missing', rel;
    END IF;
  END LOOP;
  FOREACH fn IN ARRAY expected_functions LOOP
    IF to_regprocedure(fn) IS NULL THEN
      RAISE EXCEPTION 'P0 schema drift: function % missing', fn;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='prima_nota_righe'
      AND policyname='prima_nota_righe_policy'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='utenti_studio'
      AND policyname='utenti_studio_self_or_owner_select'
  ) THEN
    RAISE EXCEPTION 'P0 scoped replacement policies not present: refusing broad policy drop';
  END IF;
END
$guard$;

-- Phase A: remove direct anonymous DML from affected tables.
-- Broad authenticated policies on other legacy tables remain a P0 residual:
-- these MUST be replaced under per-table tenant policy design before release.
REVOKE ALL PRIVILEGES ON TABLE
  public.adempimenti_clienti, public.adempimenti_template, public.avvisi_ade,
  public.causali_contabili, public.causali_iva, public.coda_import_fatture,
  public.deleghe_uniche, public.documenti_contabilita, public.documenti_import,
  public.f24_righe, public.f24_scadenze, public.fatture_xml,
  public.impostazioni_studio, public.invii_log, public.invii_schedulati,
  public.liquidazioni_iva, public.prima_nota_righe, public.richieste_fatture,
  public.test_cases, public.test_datasets, public.test_runs,
  public.utenti_studio, public.ai_feedback_log, public.ai_learning,
  public.partitari, public.test_scenarios
FROM anon;

-- Phase B: remove specific policy TRUE overrides only where strict
-- replacement scoped policies have been observed in live pg_policies.
DROP POLICY IF EXISTS "causali_contabili_all" ON public.causali_contabili;
DROP POLICY IF EXISTS "causali_iva_all" ON public.causali_iva;
DROP POLICY IF EXISTS "allow_all_doc_cont" ON public.documenti_contabilita;
DROP POLICY IF EXISTS "Allow all" ON public.documenti_import;
DROP POLICY IF EXISTS "Allow all operations on documenti_import" ON public.documenti_import;
DROP POLICY IF EXISTS "allow_all_documenti" ON public.documenti_import;
DROP POLICY IF EXISTS "allow_all_pn_righe" ON public.prima_nota_righe;
DROP POLICY IF EXISTS "public_access" ON public.utenti_studio;

-- Phase C: eliminate PUBLIC+anonymous EXECUTE from SECURITY DEFINER RPCs.
-- Retain direct authenticated EXECUTE only for the five routines with
-- inspected identity/tenant guards; end-to-end QA is still required.
REVOKE EXECUTE ON FUNCTION
  public.consolida_periodo_iva_transazionale(uuid,date,date,text,uuid,text,jsonb),
  public.rpc_annulla_prima_nota_logica(uuid,uuid,text,uuid),
  public.rpc_get_prima_nota_operation_guards(uuid,uuid,text),
  public.rpc_storna_prima_nota_generale(uuid,uuid,text,date,uuid),
  public.rpc_update_prima_nota_generale_controllata(uuid,uuid,jsonb,jsonb,text,uuid)
FROM PUBLIC, anon;

-- These three have NO direct caller/tenant validation per live code inspection:
-- disable authenticated too pending hardened server implementation.
REVOKE EXECUTE ON FUNCTION
  public.apply_ai_learning_from_feedback(uuid,uuid,uuid,numeric),
  public.precheck_stampa_definitiva(uuid,text,integer,date,date),
  public.consolidazione_stampa_definitiva(uuid,text,integer,date,date,uuid,text,text,jsonb)
FROM PUBLIC, anon, authenticated;

-- Four already-exposed tables have RLS disabled. Enabling it without a
-- per-table policy may break legitimate calls; defer that DDL to the isolated
-- QA phase. Anonymous grants were revoked above.

-- Assertion of containment, BEFORE transaction COMMIT:
DO $assert$
DECLARE exposed integer;
BEGIN
  SELECT count(*) INTO exposed
    FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
   WHERE n.nspname='public' AND f.prosecdef
     AND has_function_privilege('anon',f.oid,'EXECUTE')
     AND f.proname IN (
       'apply_ai_learning_from_feedback','consolida_periodo_iva_transazionale',
       'consolidazione_stampa_definitiva','precheck_stampa_definitiva',
       'rpc_annulla_prima_nota_logica','rpc_get_prima_nota_operation_guards',
       'rpc_storna_prima_nota_generale','rpc_update_prima_nota_generale_controllata'
     );
  IF exposed <> 0 THEN
    RAISE EXCEPTION 'P0 check failed: % privileged RPC(s) remain anon-executable', exposed;
  END IF;
  IF has_table_privilege('anon','public.prima_nota_righe','SELECT')
     OR has_table_privilege('anon','public.utenti_studio','SELECT')
     OR has_table_privilege('anon','public.fatture_xml','SELECT') THEN
    RAISE EXCEPTION 'P0 check failed: direct anonymous SELECT persists on critical tables';
  END IF;
  IF has_function_privilege('authenticated',
    'public.consolidazione_stampa_definitiva(uuid,text,integer,date,date,uuid,text,text,jsonb)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'P0 check failed: unaudited definitive consolidation callable';
  END IF;
END
$assert$;
COMMIT;
