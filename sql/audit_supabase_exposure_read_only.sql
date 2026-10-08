-- FISCOSIM / audit sola lettura RLS, privilegi e RPC (PostgreSQL)
-- Non contiene DDL, DML, modifiche a policy o accesso ai dati applicativi.
-- Eseguire esclusivamente con permessi di introspezione autorizzati.
-- 1. Stato esposizione public
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,
  (SELECT count(*) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='public') AS public_functions,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policies;

-- 2. Funzioni privilegiate eseguibili da anon
SELECT f.proname, pg_get_function_identity_arguments(f.oid) AS signature,
       f.prosecdef AS security_definer,
       has_function_privilege('anon',f.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',f.oid,'EXECUTE') AS authenticated_execute,
       (pg_get_functiondef(f.oid) ILIKE '%auth.uid%') AS mentions_auth_uid,
       (pg_get_functiondef(f.oid) ILIKE '%user_has_societa_access%') AS mentions_tenant_guard
FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
WHERE n.nspname='public' AND f.prosecdef
ORDER BY anon_execute DESC, f.proname;

-- 3. Tabelle con combinazione policy permissiva + permessi anon
WITH broad AS (
 SELECT DISTINCT tablename
 FROM pg_policies
 WHERE schemaname='public'
   AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
   AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])
)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
       has_table_privilege('anon',c.oid,'UPDATE') AS anon_update,
       has_table_privilege('anon',c.oid,'DELETE') AS anon_delete
FROM broad b JOIN pg_class c ON c.relname=b.tablename
JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
WHERE c.relkind IN ('r','p')
ORDER BY c.relname;

-- 4. Policy permissive: non dedurre che RLS enabled equivalga a isolamento
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND (lower(btrim(coalesce(qual,'')))='true' OR lower(btrim(coalesce(with_check,'')))='true')
ORDER BY tablename, policyname;

-- 5. Tracking migrazioni (puo essere assente in database legacy)
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history_relation;
