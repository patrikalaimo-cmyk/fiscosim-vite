-- FiscoSim P0 Stage3I — legacy studio/company FK and RLS inventory.
-- READ ONLY. Execute solely on the already existing isolated Docker P0 lab.
-- Metadata only: no personal/business rows or database mutations.
SELECT 'STAGE3I_TARGET_TABLE' AS section,
       c.relname AS object_name, c.relkind::text AS detail,
       c.relrowsecurity::text AS extra
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN (
    'utenti_studio','utenti_studio_societa','societa','studios','users',
    'clients','clienti','f24_scadenze','f24_righe','liquidazioni_iva'
  )
ORDER BY c.relname;

SELECT 'STAGE3I_COLUMN' AS section, table_name || '.' || column_name AS object_name,
       data_type AS detail,
       'nullable=' || is_nullable || ';default=' || coalesce(column_default,'') AS extra
FROM information_schema.columns
WHERE table_schema='public'
 AND table_name IN (
    'utenti_studio','utenti_studio_societa','societa','studios','users',
    'clients','clienti','f24_scadenze','f24_righe','liquidazioni_iva'
 )
ORDER BY table_name,ordinal_position;

SELECT 'STAGE3I_RELATION' AS section,
       con.conrelid::regclass::text AS object_name,
       con.conname AS detail,
       pg_get_constraintdef(con.oid) AS extra
FROM pg_constraint con
JOIN pg_class a ON a.oid=con.conrelid
JOIN pg_namespace na ON na.oid=a.relnamespace
JOIN pg_class b ON b.oid=con.confrelid
JOIN pg_namespace nb ON nb.oid=b.relnamespace
WHERE con.contype='f' AND na.nspname='public' AND nb.nspname='public'
  AND (a.relname IN (
    'utenti_studio','utenti_studio_societa','societa','studios','users',
    'clients','clienti','f24_scadenze','f24_righe','liquidazioni_iva'
  ) OR b.relname IN (
    'utenti_studio','utenti_studio_societa','societa','studios','users',
    'clients','clienti','f24_scadenze','f24_righe','liquidazioni_iva'
  ))
ORDER BY object_name,detail;

SELECT 'STAGE3I_POLICY' AS section,
       tablename || '.' || policyname AS object_name,
       cmd || ':' || array_to_string(roles,',') AS detail,
       'USING=' || coalesce(qual,'') || ';CHECK=' || coalesce(with_check,'') AS extra
FROM pg_policies
WHERE schemaname='public'
 AND tablename IN (
    'utenti_studio','utenti_studio_societa','societa','studios','users',
    'clients','clienti','f24_scadenze','f24_righe','liquidazioni_iva'
 )
ORDER BY tablename,policyname;

SELECT 'STAGE3I_ACL' AS section,
       c.relname AS object_name,
       'authenticated' AS detail,
       'select=' || has_table_privilege('authenticated',c.oid,'SELECT')::text ||
       ';insert=' || has_table_privilege('authenticated',c.oid,'INSERT')::text ||
       ';update=' || has_table_privilege('authenticated',c.oid,'UPDATE')::text ||
       ';delete=' || has_table_privilege('authenticated',c.oid,'DELETE')::text AS extra
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND c.relname IN (
    'utenti_studio','utenti_studio_societa','societa','studios','users',
    'clients','clienti','f24_scadenze','f24_righe','liquidazioni_iva'
 )
ORDER BY c.relname;

SELECT 'STAGE3I_HELPER' AS section,
       p.proname AS object_name,
       'security_definer=' || p.prosecdef::text AS detail,
       pg_get_functiondef(p.oid) AS extra
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
 AND p.proname IN ('user_has_societa_access','current_utente_ruolo',
                   'current_utente_studio_id')
ORDER BY p.proname;
