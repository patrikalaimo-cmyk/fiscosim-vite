-- FiscoSim P0 Stage 3L: remaining reachable authenticated-role/TRUE policies.
-- AUDIT ONLY: PostgreSQL catalogs and information_schema. No customer rows.
-- Valid after Stage 3K, isolated Docker lab only. No DDL or DML.
-- Targets: 3 authenticated-role bypass tables + 5 TRUE-policy tables.
WITH targets(name) AS (
 VALUES ('avvisi_ade'),('client_modules'),('client_responsabili'),
        ('invii_log'),('revisioni_dichiarativi'),
        ('test_cases'),('test_datasets'),('test_runs')
)
SELECT '3L_TABLE' AS marker,t.name AS object_name,
       'rls=' || coalesce(c.relrowsecurity::text,'NOT_FOUND')
       || ';owner=' || coalesce(pg_get_userbyid(c.relowner),'NOT_FOUND')
       || ';auth_select=' || coalesce(has_table_privilege('authenticated',c.oid,'SELECT')::text,'n/a')
       || ';auth_insert=' || coalesce(has_table_privilege('authenticated',c.oid,'INSERT')::text,'n/a')
       || ';auth_update=' || coalesce(has_table_privilege('authenticated',c.oid,'UPDATE')::text,'n/a')
       || ';auth_delete=' || coalesce(has_table_privilege('authenticated',c.oid,'DELETE')::text,'n/a')
       || ';anon_select=' || coalesce(has_table_privilege('anon',c.oid,'SELECT')::text,'n/a')
       || ';service_select=' || coalesce(has_table_privilege('service_role',c.oid,'SELECT')::text,'n/a') AS details
FROM targets t
LEFT JOIN pg_class c ON c.relname=t.name
  AND c.relnamespace='public'::regnamespace
ORDER BY t.name;

SELECT '3L_COLUMN' AS marker,
       c.table_name || '.' || c.column_name AS object_name,
       c.data_type || ';nullable=' || c.is_nullable
        || ';default=' || coalesce(c.column_default,'') AS details
FROM information_schema.columns c
WHERE c.table_schema='public'
 AND c.table_name IN ('avvisi_ade','client_modules','client_responsabili',
                      'invii_log','revisioni_dichiarativi','test_cases',
                      'test_datasets','test_runs')
ORDER BY c.table_name,c.ordinal_position;

SELECT '3L_FK' AS marker, cl.relname || '.' || con.conname AS object_name,
       regexp_replace(pg_get_constraintdef(con.oid),'[[:space:]]+',' ','g') AS details
FROM pg_constraint con
JOIN pg_class cl ON cl.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=cl.relnamespace
WHERE ns.nspname='public' AND con.contype='f'
 AND cl.relname IN ('avvisi_ade','client_modules','client_responsabili',
                     'invii_log','revisioni_dichiarativi','test_cases',
                     'test_datasets','test_runs')
ORDER BY cl.relname,con.conname;

SELECT '3L_POLICY' AS marker, tablename || '.' || policyname AS object_name,
       'cmd=' || cmd || ';roles=' || array_to_string(roles,',')
       || ';permissive=' || permissive
       || ';using=' || coalesce(regexp_replace(qual,'[[:space:]]+',' ','g'),'NULL')
       || ';check=' || coalesce(regexp_replace(with_check,'[[:space:]]+',' ','g'),'NULL') AS details
FROM pg_policies
WHERE schemaname='public'
 AND tablename IN ('avvisi_ade','client_modules','client_responsabili',
                     'invii_log','revisioni_dichiarativi','test_cases',
                     'test_datasets','test_runs')
ORDER BY tablename,cmd,policyname;

SELECT '3L_GRANT' AS marker,
  table_name || '.' || grantee AS object_name,
  string_agg(DISTINCT privilege_type,',' ORDER BY privilege_type) AS details
FROM information_schema.role_table_grants
WHERE table_schema='public'
 AND table_name IN ('avvisi_ade','client_modules','client_responsabili',
                     'invii_log','revisioni_dichiarativi','test_cases',
                     'test_datasets','test_runs')
 AND grantee IN ('authenticated','anon','service_role')
GROUP BY table_name,grantee
ORDER BY table_name,grantee;

SELECT '3L_INDEX' AS marker, tablename || '.' || indexname AS object_name,
       regexp_replace(indexdef,'[[:space:]]+',' ','g') AS details
FROM pg_indexes WHERE schemaname='public'
 AND tablename IN ('avvisi_ade','client_modules','client_responsabili',
                     'invii_log','revisioni_dichiarativi','test_cases',
                     'test_datasets','test_runs')
ORDER BY tablename,indexname;
