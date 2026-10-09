-- Stage3P-1 / READ ONLY. Local Docker metadata and aggregate ownership audit.
-- No source rows, names, CF/PIVA, customer data, tokens or secrets returned.
-- Source tables preexist; audit runs inside BEGIN READ ONLY ... ROLLBACK.
WITH t(name) AS (VALUES ('clienti'),('societa'),('utenti_studio_societa'),
 ('avvisi_ade'),('revisioni_dichiarativi'),('documenti_import'),
 ('documenti_contabilita'),('notifiche_clienti'),('utenti_studio'))
SELECT '3P_TABLE' AS label,t.name AS object_name,
 coalesce('rls='||c.relrowsecurity::text||';auth_select='||
 has_table_privilege('authenticated',c.oid,'SELECT')::text||
 ';auth_insert='||has_table_privilege('authenticated',c.oid,'INSERT')::text||
 ';auth_update='||has_table_privilege('authenticated',c.oid,'UPDATE')::text,'NOT_FOUND') AS details
FROM t LEFT JOIN pg_class c ON c.relnamespace='public'::regnamespace AND c.relname=t.name
ORDER BY t.name;

SELECT '3P_COLUMN' AS label,table_name||'.'||column_name AS object_name,
 data_type||';nullable='||is_nullable||';default='||coalesce(column_default,'') AS details
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
('clienti','societa','utenti_studio_societa','avvisi_ade','revisioni_dichiarativi',
 'documenti_import','documenti_contabilita','notifiche_clienti','utenti_studio')
ORDER BY table_name,ordinal_position;

SELECT '3P_CONSTRAINT' AS label, cl.relname||'.'||co.conname AS object_name,
 regexp_replace(pg_get_constraintdef(co.oid),'[[:space:]]+',' ','g') AS details
FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid
JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public'
 AND cl.relname IN ('clienti','societa','avvisi_ade','revisioni_dichiarativi',
                   'documenti_import','utenti_studio_societa')
 AND co.contype IN ('p','u','f','c')
ORDER BY cl.relname,co.conname;

SELECT '3P_POLICY' AS label,tablename||'.'||policyname AS object_name,
 'cmd='||cmd||';roles='||array_to_string(roles,',')||
 ';using='||coalesce(regexp_replace(qual,'[[:space:]]+',' ','g'),'NULL')||
 ';check='||coalesce(regexp_replace(with_check,'[[:space:]]+',' ','g'),'NULL') AS details
FROM pg_policies
WHERE schemaname='public'
 AND tablename IN ('clienti','societa','utenti_studio_societa','avvisi_ade',
                   'revisioni_dichiarativi')
ORDER BY tablename,policyname;

SELECT '3P_FUNCTION' AS label,proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS object_name,
 'security_definer='||prosecdef::text||';volatility='||provolatile AS details
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN
 ('user_can_access_cliente','user_has_societa_access','current_utente_ruolo',
 'is_owner_or_admin','current_default_societa_id')
ORDER BY proname;

-- Data quality totals only: do not extract individual customer records.
SELECT '3P_COUNT' AS label,'clienti' AS object_name,count(*)::text AS details FROM public.clienti
UNION ALL SELECT '3P_COUNT','avvisi_ade',count(*)::text FROM public.avvisi_ade
UNION ALL SELECT '3P_COUNT','avvisi_ade_null_cliente',count(*)::text FROM public.avvisi_ade WHERE cliente_id IS NULL
UNION ALL SELECT '3P_COUNT','revisioni_dichiarativi',count(*)::text FROM public.revisioni_dichiarativi
UNION ALL SELECT '3P_COUNT','revisioni_null_cliente',count(*)::text FROM public.revisioni_dichiarativi WHERE cliente_id IS NULL
UNION ALL SELECT '3P_COUNT','revisioni_company_id_nonnull',count(*)::text FROM public.revisioni_dichiarativi WHERE company_id IS NOT NULL
UNION ALL SELECT '3P_COUNT','utenti_studio_societa',count(*)::text FROM public.utenti_studio_societa
ORDER BY object_name;
