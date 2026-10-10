-- Stage 3U: inventory-only gate for ACCOUNTING E2E readiness.
-- No posting, no transaction commits, no test fixtures. LOCAL LAB ONLY.
-- This script does NOT count as an accounting-cycle test.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_accounting_inventory_approval',true)
   IS DISTINCT FROM 'local-canonical-accounting-inventory-readonly'
 THEN RAISE EXCEPTION 'Accounting inventory restricted to isolated LAB'; END IF;
END $guard$;

SELECT 'ACCOUNTING_PREFLIGHT|CATALOG_ONLY|NO_REAL_POSTING' AS result;

WITH needed(table_name) AS (
 VALUES ('societa'),('piano_conti'),('causali_contabili'),
 ('causali_iva'),('prima_nota'),('prima_nota_righe'),
 ('registri_iva'),('partitario'),('ritenute_dacconto'),
 ('liquidazione_iva'),('documenti_import'),
 ('documenti_contabilita'),('stampe_definitive'),('audit_contabile')
)
SELECT 'ACCT_TABLE|'||n.table_name||'|'||
 CASE WHEN c.oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END||'|rls='||
 coalesce(c.relrowsecurity::text,'NA')
FROM needed n
LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname='public'
LEFT JOIN pg_catalog.pg_class c
 ON c.relnamespace=ns.oid AND c.relname=n.table_name
  AND c.relkind IN ('r','p')
ORDER BY n.table_name;

WITH needed(table_name,column_name) AS (
 VALUES
 ('prima_nota','id'),('prima_nota','societa_id'),
 ('prima_nota','data_registrazione'),('prima_nota','stato'),
 ('prima_nota','totale_dare'),('prima_nota','totale_avere'),
 ('prima_nota_righe','prima_nota_id'),
 ('prima_nota_righe','societa_id'),
 ('prima_nota_righe','conto_id'),
 ('prima_nota_righe','importo_dare'),
 ('prima_nota_righe','importo_avere'),
 ('registri_iva','prima_nota_id'),
 ('registri_iva','societa_id'),
 ('partitario','prima_nota_id'),
 ('liquidazione_iva','societa_id'),
 ('piano_conti','id'),
 ('piano_conti','societa_id')
)
SELECT 'ACCT_FIELD|'||n.table_name||'.'||n.column_name||'|'||
 CASE WHEN a.attname IS NULL THEN 'MISSING' ELSE 'PRESENT' END
FROM needed n
LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname='public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=ns.oid
 AND c.relname=n.table_name AND c.relkind IN ('r','p')
LEFT JOIN pg_catalog.pg_attribute a
 ON a.attrelid=c.oid AND a.attname=n.column_name
  AND a.attnum>0 AND NOT a.attisdropped
ORDER BY n.table_name,n.column_name;

WITH functions(routine) AS (
 VALUES ('precheck_stampa_definitiva'),
 ('consolidazione_stampa_definitiva'),
 ('rpc_get_prima_nota_operation_guards'),
 ('rpc_storna_prima_nota_generale'),
 ('rpc_annulla_prima_nota_logica')
)
SELECT 'ACCT_FUNCTION|'||f.routine||'|count='||count(p.oid)::text||
 '|security_definer='||
 coalesce(bool_or(p.prosecdef)::text,'NA')
FROM functions f
LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname='public'
LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=ns.oid
 AND p.proname=f.routine
GROUP BY f.routine
ORDER BY f.routine;

SELECT 'ACCOUNTING_REAL_CYCLE|NOT_TESTED_BY_PREFLIGHT' AS result;
ROLLBACK;
