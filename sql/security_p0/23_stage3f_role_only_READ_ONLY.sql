-- FiscoSim P0 Stage3F — permission risk inventory. READ-ONLY.
-- Safe in isolated local Docker lab. Inspects ONLY PostgreSQL catalogs,
-- information_schema metadata, and function source definitions; NO business rows.
-- Counts here complement, not replace, 04_residuals_READ_ONLY.sql.
-- The old residual metric looks only for literal TRUE and therefore misses
-- permissive auth.role()='authenticated' policies and unscoped staff-global roles.
WITH base AS (
 SELECT p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check,
        c.oid AS relid
 FROM pg_policies p
 JOIN pg_class c ON c.relname=p.tablename
 JOIN pg_namespace ns ON ns.oid=c.relnamespace AND ns.nspname='public'
 WHERE p.schemaname='public' AND c.relkind IN ('r','p')
), role_bypass AS (
 SELECT DISTINCT tablename
 FROM base
 WHERE (coalesce(qual,'') ~* 'auth[.]role[(][)]'
    OR coalesce(with_check,'') ~* 'auth[.]role[(][)]')
 AND (has_table_privilege('authenticated',relid,'SELECT')
   OR has_table_privilege('authenticated',relid,'UPDATE')
   OR has_table_privilege('authenticated',relid,'INSERT'))
), true_bypass AS (
 SELECT DISTINCT tablename
 FROM base
 WHERE (lower(btrim(coalesce(qual,'')))='true'
  OR lower(btrim(coalesce(with_check,'')))='true')
 AND ('authenticated'=ANY(roles) OR 'public'=ANY(roles))
 AND has_table_privilege('authenticated',relid,'SELECT')
), studio_nullable AS (
 SELECT table_name
 FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name IN ('f24_righe','f24_scadenze','liquidazioni_iva')
   AND column_name='studio_id' AND is_nullable='YES'
), password_acl AS (
 SELECT CASE WHEN to_regclass('public.utenti_studio') IS NOT NULL
   AND has_column_privilege('authenticated','public.utenti_studio','password_hash','SELECT')
 THEN 1 ELSE 0 END AS exposed
), global_role AS (
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='user_has_societa_access'
  AND pg_get_functiondef(p.oid) ~* 'user_role[[:space:]]+in[[:space:]]*[(][[:space:]]*''owner'''
  AND pg_get_functiondef(p.oid) ~* 'return[[:space:]]+true'
 ) THEN 1 ELSE 0 END AS has_owner_bypass
)
SELECT 'RISK_ROLE_ONLY_AUTHENTICATED_TABLES' AS risk, (SELECT count(*) FROM role_bypass) AS count
UNION ALL SELECT 'RISK_TRUE_POLICY_AUTH_TABLES',(SELECT count(*) FROM true_bypass)
UNION ALL SELECT 'RISK_NULLABLE_LEGACY_FISCAL_STUDIO_IDS',(SELECT count(*) FROM studio_nullable)
UNION ALL SELECT 'RISK_AUTH_CAN_SELECT_STAFF_PASSWORD_HASH',(SELECT exposed FROM password_acl)
UNION ALL SELECT 'RISK_OWNER_ADMIN_GLOBAL_COMPANY_FALLBACK',(SELECT has_owner_bypass FROM global_role)
ORDER BY risk;

-- Per-object inventory; policy DDL and owners are metadata, no rows.
SELECT 'ROLE_ONLY_AUTH' AS risk,p.tablename||'.'||p.policyname AS target,
       p.cmd AS command
FROM pg_policies p
WHERE p.schemaname='public'
 AND (coalesce(p.qual,'') ~* 'auth[.]role[(][)]'
   OR coalesce(p.with_check,'') ~* 'auth[.]role[(][)]')
UNION ALL
SELECT 'TRUE_AUTH',p.tablename||'.'||p.policyname,p.cmd
FROM pg_policies p
WHERE p.schemaname='public'
 AND (lower(btrim(coalesce(p.qual,'')))='true'
   OR lower(btrim(coalesce(p.with_check,'')))='true')
 AND ('authenticated'=ANY(p.roles) OR 'public'=ANY(p.roles))
UNION ALL
SELECT 'NULLABLE_STUDIO_ID','public.'||table_name||'.studio_id','COLUMN'
FROM information_schema.columns
WHERE table_schema='public'
 AND table_name IN ('f24_righe','f24_scadenze','liquidazioni_iva')
 AND column_name='studio_id' AND is_nullable='YES'
ORDER BY risk,target;
