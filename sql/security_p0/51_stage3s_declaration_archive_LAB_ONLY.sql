-- Stage3S-3: archive a declaration and optionally create+link its CRM client
-- inside ONE PostgreSQL transaction. LAB ONLY, dependent on Stage3Q,3R,3S.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3s_revisions_approval',true)
  IS DISTINCT FROM 'local-atomic-declaration-archive-only' THEN
  RAISE EXCEPTION 'Stage3S declaration archive needs isolated LAB approval';
 END IF;
 IF to_regprocedure('public.fiscosim_studio_create_cliente(uuid,uuid,jsonb,text)') IS NULL
  OR to_regclass('public.fiscosim_operational_audit') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='revisioni_dichiarativi'
    AND policyname='revisioni_company_boundary' AND permissive='RESTRICTIVE')
 THEN
  RAISE EXCEPTION 'Stage3S declaration archive requires verified Stage3Q/R/S schema';
 END IF;
 IF (SELECT count(*) FROM public.revisioni_dichiarativi)<>0
  OR (SELECT count(*) FROM public.clienti)<>0 THEN
  RAISE EXCEPTION 'Stage3S declaration archive only supported in empty isolated LAB';
 END IF;
END $gate$;

CREATE FUNCTION public.fiscosim_studio_archive_revisione(
 p_auth_user_id uuid,
 p_societa_id uuid,
 p_cliente_id uuid,
 p_new_cliente jsonb,
 p_new_cliente_reason text,
 p_report jsonb,
 p_num_documenti integer,
 p_reason text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_staff public.utenti_studio%ROWTYPE;
 v_cliente_id uuid;
 v_id uuid;
BEGIN
 IF p_auth_user_id IS NULL OR p_societa_id IS NULL
  OR p_report IS NULL OR jsonb_typeof(p_report)<>'object'
  OR pg_column_size(p_report)>512000
  OR p_num_documenti IS NULL OR p_num_documenti NOT BETWEEN 0 AND 50
  OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 THEN
  RAISE EXCEPTION 'Incomplete declaration archive';
 END IF;
 SELECT us.* INTO v_staff FROM public.utenti_studio us
 JOIN public.utenti_studio_societa member
  ON member.utente_id=us.id AND member.auth_user_id=us.auth_user_id
 JOIN public.societa company ON company.id=member.societa_id
 WHERE us.auth_user_id=p_auth_user_id AND us.attivo IS TRUE
  AND member.societa_id=p_societa_id AND company.attiva IS TRUE
  AND ((us.ruolo IN ('owner','admin') AND member.ruolo IN ('owner','admin')) OR (
   us.ruolo='collaboratore' AND member.ruolo='collaboratore'
   AND coalesce((us.permessi->'revisione_dich'->>'modifica')::boolean,false)
  ))
 LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Declaration actor not assigned or lacking write permission'; END IF;

 IF p_new_cliente IS NOT NULL THEN
  IF p_cliente_id IS NOT NULL OR jsonb_typeof(p_new_cliente)<>'object' THEN
   RAISE EXCEPTION 'Cannot provide existing and new customer together';
  END IF;
  -- This nested SQL call is atomic with the following declaration INSERT;
  -- a failed declaration never leaves a newly-created CRM customer.
  v_cliente_id:=public.fiscosim_studio_create_cliente(
    p_societa_id,p_auth_user_id,p_new_cliente,p_new_cliente_reason);
 ELSE
  v_cliente_id:=p_cliente_id;
 END IF;
 IF v_cliente_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.crm_cliente_societa_link l
  JOIN public.clienti c ON c.id=l.cliente_id
  WHERE l.cliente_id=v_cliente_id AND l.societa_id=p_societa_id AND c.attivo IS TRUE
 ) THEN
  RAISE EXCEPTION 'Declaration customer not linked to accounting company';
 END IF;
 IF v_staff.ruolo='collaboratore'
  AND coalesce((v_staff.permessi->'clienti'->>'solo_assegnati')::boolean,false)
  AND NOT v_cliente_id=ANY(coalesce(v_staff.clienti_assegnati,'{}'::uuid[])) THEN
  RAISE EXCEPTION 'Declaration customer not assigned to collaborator';
 END IF;

 INSERT INTO public.revisioni_dichiarativi(
  societa_id,cliente_id,anno_imposta,tipo_dichiarativo,
  contribuente,codice_fiscale,reddito_imponibile,
  imposta_netta,saldo_dovuto,report_json,num_documenti,created_by
 ) VALUES (
  p_societa_id,v_cliente_id,
  nullif(p_report->>'anno_imposta','')::integer,
  nullif(p_report->>'tipo_dichiarativo',''),
  nullif(p_report->>'contribuente',''),
  nullif(p_report->>'codice_fiscale',''),
  nullif(p_report->>'reddito_imponibile','')::numeric,
  nullif(p_report->>'imposta_netta','')::numeric,
  nullif(p_report->>'saldo_dovuto','')::numeric,
  p_report,p_num_documenti,v_staff.id
 ) RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Declaration archive insert not committed'; END IF;
 INSERT INTO public.fiscosim_operational_audit(
  entity_kind,entity_id,societa_id,actor_auth_id,action,reason
 ) VALUES ('revisione_dichiarativi',v_id,p_societa_id,p_auth_user_id,'archive',btrim(p_reason));
 RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)
 TO service_role;
DO $verify$
BEGIN
 IF (SELECT prosecdef FROM pg_proc
  WHERE oid='public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)'::regprocedure)
 OR has_function_privilege('anon','public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fiscosim_studio_archive_revisione(uuid,uuid,uuid,jsonb,text,jsonb,integer,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Stage3S declaration RPC has unsafe grants'; END IF;
END $verify$;
COMMIT;
