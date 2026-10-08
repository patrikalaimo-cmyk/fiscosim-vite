-- FiscoSim P0 residual audit — READ ONLY, suitable for the P0 Docker clone.
-- Does NOT read application/client data. Works solely on pg_catalog and policies.
-- Interpretation: zero for P0_*_ANON checks is only partial security closure.
-- This is NOT an executable migration and must not change any SQL privileges.

SELECT 'P0_ANON_SECURITY_DEFINER_RPC' AS gate, count(*)::integer AS outstanding
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('anon',p.oid,'EXECUTE')

UNION ALL
SELECT 'P0_ANON_TRUE_POLICY_TABLES', count(DISTINCT pol.tablename)::integer
FROM pg_policies pol
JOIN pg_class c ON c.relname=pol.tablename AND c.relnamespace='public'::regnamespace
WHERE pol.schemaname='public' AND
  (lower(trim(coalesce(pol.qual,'')))='true'
    OR lower(trim(coalesce(pol.with_check,'')))='true')
  AND (pol.roles @> ARRAY['public']::name[]
    OR pol.roles @> ARRAY['anon']::name[])
  AND (has_table_privilege('anon',c.oid,'SELECT')
    OR has_table_privilege('anon',c.oid,'INSERT')
    OR has_table_privilege('anon',c.oid,'UPDATE')
    OR has_table_privilege('anon',c.oid,'DELETE'))

UNION ALL
SELECT 'RESIDUAL_ANON_VIEW_SELECT',count(*)::integer
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND has_table_privilege('anon',c.oid,'SELECT')

UNION ALL
SELECT 'RESIDUAL_AUTH_VIEW_SELECT',count(*)::integer
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND has_table_privilege('authenticated',c.oid,'SELECT')

UNION ALL
SELECT 'RESIDUAL_DEFINER_VIEWS',count(*)::integer
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND NOT EXISTS (
    SELECT 1 FROM pg_options_to_table(c.reloptions) o
    WHERE o.option_name='security_invoker' AND o.option_value='true'
  )

UNION ALL
SELECT 'RESIDUAL_TABLES_RLS_DISABLED',count(*)::integer
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND NOT c.relrowsecurity

UNION ALL
SELECT 'RESIDUAL_AUTH_RLS_DISABLED_SELECT',count(*)::integer
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND NOT c.relrowsecurity
  AND has_table_privilege('authenticated',c.oid,'SELECT')

UNION ALL
SELECT 'RESIDUAL_AUTH_TRUE_POLICY_TABLES', count(DISTINCT pol.tablename)::integer
FROM pg_policies pol
JOIN pg_class c ON c.relname=pol.tablename AND c.relnamespace='public'::regnamespace
WHERE pol.schemaname='public' AND
  (lower(trim(coalesce(pol.qual,'')))='true'
    OR lower(trim(coalesce(pol.with_check,'')))='true')
  AND (pol.roles @> ARRAY['public']::name[]
    OR pol.roles @> ARRAY['authenticated']::name[])
  AND (has_table_privilege('authenticated',c.oid,'SELECT')
    OR has_table_privilege('authenticated',c.oid,'INSERT')
    OR has_table_privilege('authenticated',c.oid,'UPDATE')
    OR has_table_privilege('authenticated',c.oid,'DELETE'))
ORDER BY gate;
