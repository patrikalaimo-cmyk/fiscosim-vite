-- Stage3U read-only accounting posting prerequisites, LOCAL LAB ONLY.
-- This DOES NOT APPLY 54/55, and does not post one journal entry.
BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
DO $guard$
DECLARE t text; missing text[];
BEGIN
 IF current_setting('fiscosim.p0_stage3u_preflight_approval',true)
   IS DISTINCT FROM 'local-general-journal-readonly-preflight' THEN
  RAISE EXCEPTION 'Stage3U preflight needs isolated lab opt-in';
 END IF;
 FOREACH t IN ARRAY ARRAY['societa','utenti_studio','utenti_studio_societa',
  'piano_conti','causali_contabili','prima_nota','prima_nota_righe',
  'audit_contabile'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN
   RAISE EXCEPTION 'Stage3U accounting table MISSING: %',t;
  END IF;
 END LOOP;
 SELECT array_agg(rel||'.'||col) INTO missing
 FROM (VALUES
  ('societa','id'),('societa','attiva'),
  ('utenti_studio','id'),('utenti_studio','auth_user_id'),
  ('utenti_studio','attivo'),('utenti_studio','ruolo'),
  ('utenti_studio_societa','utente_id'),
  ('utenti_studio_societa','auth_user_id'),
  ('utenti_studio_societa','societa_id'),
  ('utenti_studio_societa','ruolo'),
  ('piano_conti','id'),('piano_conti','societa_id'),
  ('piano_conti','codice'),('piano_conti','descrizione'),
  ('piano_conti','attivo'),
  ('causali_contabili','id'),('causali_contabili','societa_id'),
  ('prima_nota','id'),('prima_nota','societa_id'),
  ('prima_nota','data_registrazione'),('prima_nota','causale_id'),
  ('prima_nota','descrizione'),('prima_nota','stato'),
  ('prima_nota','created_by'),('prima_nota','totale_dare'),
  ('prima_nota','totale_avere'),
  ('prima_nota_righe','prima_nota_id'),
  ('prima_nota_righe','riga_numero'),('prima_nota_righe','conto_id'),
  ('prima_nota_righe','conto_codice'),('prima_nota_righe','conto_descrizione'),
  ('prima_nota_righe','descrizione_riga'),
  ('prima_nota_righe','importo_dare'),('prima_nota_righe','importo_avere'),
  ('audit_contabile','societa_id'),('audit_contabile','entity_type'),
  ('audit_contabile','entity_id'),('audit_contabile','operation_type'),
  ('audit_contabile','operation_reason'),('audit_contabile','after_data'),
  ('audit_contabile','performed_by'),('audit_contabile','source_module')
 ) AS required(rel,col)
 WHERE NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=('public.'||rel)::regclass
   AND a.attname=col AND a.attnum>0 AND NOT a.attisdropped
 );
 IF missing IS NOT NULL THEN
  RAISE EXCEPTION 'Stage3U accounting columns MISSING: %',missing;
 END IF;
 -- Stage3S local PG does not have prima_nota_righe.societa_id. The
 -- journal's ownership is canonical in parent prima_nota.societa_id.
 -- Refuse parentless lines: foreign-key scope is mandatory.
 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_constraint c
  WHERE c.conrelid='public.prima_nota_righe'::regclass
    AND c.confrelid='public.prima_nota'::regclass
    AND c.contype='f'
 ) THEN
  RAISE EXCEPTION 'Stage3U journal lines require FK to parent prima_nota';
 END IF;
 IF to_regclass('public.fiscosim_general_journal_claim') IS NOT NULL
  OR to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'Stage3U preflight expects NEW candidate migration, not already installed';
 END IF;
 IF (SELECT count(*) FROM public.prima_nota)<>0
  OR (SELECT count(*) FROM public.prima_nota_righe)<>0
  OR (SELECT count(*) FROM public.audit_contabile)<>0
  OR (SELECT count(*) FROM public.piano_conti)<>0 THEN
  RAISE EXCEPTION 'Stage3U LAB has existing journal/accounts: do not apply fixture matrix';
 END IF;
 IF NOT has_table_privilege('service_role','public.prima_nota','INSERT')
  OR NOT has_table_privilege('service_role','public.prima_nota_righe','INSERT')
  OR NOT has_table_privilege('service_role','public.audit_contabile','INSERT')
  OR NOT has_table_privilege('service_role','public.piano_conti','SELECT') THEN
  RAISE EXCEPTION 'Stage3U service-role accounting table grants incomplete';
 END IF;
END $guard$;
SELECT 'STAGE3U_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST' AS result;
SELECT 'STAGE3U_DB_VERSION|'||current_setting('server_version') AS result;
SELECT 'STAGE3U_LINE_TENANT_SCOPE|'||
 CASE WHEN EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute a
  WHERE a.attrelid='public.prima_nota_righe'::regclass
   AND a.attname='societa_id' AND a.attnum>0 AND NOT a.attisdropped
 ) THEN 'PARENT_AND_LINE_COMPANY' ELSE 'PARENT_ONLY_COMPANY' END AS result;
SELECT 'STAGE3U_PN_COUNT|'||(SELECT count(*) FROM public.prima_nota)::text AS result;
SELECT 'STAGE3U_AUDIT_COUNT|'||(SELECT count(*) FROM public.audit_contabile)::text AS result;
ROLLBACK;
