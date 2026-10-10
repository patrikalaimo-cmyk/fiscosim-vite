-- FiscoSim P0 — run READ-ONLY on isolated QA branch after candidate containment.
-- Both counters must be zero. These checks do NOT prove complete tenant isolation.
SELECT 'anon_security_definer_exposure' AS gate, count(*) AS violations
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')
  AND p.proname IN (
    'apply_ai_learning_from_feedback','consolida_periodo_iva_transazionale',
    'consolidazione_stampa_definitiva','precheck_stampa_definitiva',
    'rpc_annulla_prima_nota_logica','rpc_get_prima_nota_operation_guards',
    'rpc_storna_prima_nota_generale','rpc_update_prima_nota_generale_controllata'
  )
UNION ALL
SELECT 'anon_broad_table_exposure',count(*)
FROM pg_policies pol
JOIN pg_class c ON c.relname=pol.tablename AND c.relnamespace='public'::regnamespace
WHERE pol.schemaname='public'
  AND (lower(trim(coalesce(pol.qual,'')))='true'
    OR lower(trim(coalesce(pol.with_check,'')))='true')
  AND (pol.roles @> ARRAY['public']::name[] OR pol.roles @> ARRAY['anon']::name[])
  AND has_table_privilege('anon',c.oid,'SELECT');
-- QA still requires member/nonmember auth E2E, policy matrix, snapshot, rollback.
