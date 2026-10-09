-- Stage3S-2 / Agency notifications: scoped create/update/close, never hard-delete.
-- Requires verified Stage3Q and Stage3S CRM audit, only isolated LAB.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3s_agecon_approval',true)
  IS DISTINCT FROM 'local-agecon-atomic-upsert-only' THEN
  RAISE EXCEPTION 'Stage3S AgeCon LAB authorization missing';
 END IF;
 IF to_regclass('public.fiscosim_operational_audit') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_policies
    WHERE tablename='avvisi_ade' AND schemaname='public'
      AND policyname='avvisi_ade_company_boundary' AND permissive='RESTRICTIVE')
 THEN
  RAISE EXCEPTION 'Stage3S requires completed Stage3Q and CRM audit';
 END IF;
 IF (SELECT count(*) FROM public.avvisi_ade)<>0 THEN
  RAISE EXCEPTION 'Stage3S baseline requires empty isolated fiscal notices';
 END IF;
END $gate$;

CREATE SEQUENCE public.fiscosim_agecon_codice_seq START WITH 1;
REVOKE ALL ON SEQUENCE public.fiscosim_agecon_codice_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.fiscosim_agecon_codice_seq TO service_role;

CREATE FUNCTION public.fiscosim_studio_write_avviso(
 p_action text,
 p_avviso_id uuid,
 p_societa_id uuid,
 p_auth_user_id uuid,
 p_data jsonb,
 p_reason text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_staff public.utenti_studio%ROWTYPE;
 v_notice public.avvisi_ade%ROWTYPE;
 v_client uuid;
 v_responsabile uuid;
 v_tipo text;
 v_id uuid;
 v_unknown text[];
 v_allowed text[];
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('create','update','close')
  OR p_societa_id IS NULL OR p_auth_user_id IS NULL
  OR p_data IS NULL OR jsonb_typeof(p_data)<>'object'
  OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 THEN
  RAISE EXCEPTION 'Incomplete AgeCon operation';
 END IF;

 SELECT us.* INTO v_staff FROM public.utenti_studio us
 JOIN public.utenti_studio_societa membership
  ON membership.utente_id=us.id AND membership.auth_user_id=us.auth_user_id
 JOIN public.societa so ON so.id=membership.societa_id
 WHERE us.auth_user_id=p_auth_user_id AND us.attivo IS TRUE
  AND membership.societa_id=p_societa_id AND so.attiva IS TRUE
  AND (
   (us.ruolo IN ('owner','admin') AND membership.ruolo IN ('owner','admin')) OR (
    us.ruolo='collaboratore' AND membership.ruolo='collaboratore'
    AND coalesce((us.permessi->'agecon'->>'modifica')::boolean,false)
   )
  )
 LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'AgeCon actor not assigned or not allowed to modify'; END IF;

 IF p_action='create' THEN
  IF p_avviso_id IS NOT NULL THEN
   RAISE EXCEPTION 'New notice id must be server-generated';
  END IF;
  v_allowed:=ARRAY[
   'cliente_id','tipo_avviso','modello','importo','contenuto',
   'data_ricezione_cliente','data_scadenza','data_ricezione_studio',
   'attivita','esito','responsabile_id','note','dati_estratti'
  ];
 ELSE
  IF p_avviso_id IS NULL THEN RAISE EXCEPTION 'Notice id required'; END IF;
  -- Lock first: prevents stale-data or concurrent ownership reassignment.
  SELECT * INTO v_notice FROM public.avvisi_ade
   WHERE id=p_avviso_id AND societa_id=p_societa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AgeCon notice not owned by requested company'; END IF;
  IF p_action='close' THEN v_allowed:=ARRAY[]::text[];
  ELSE
   v_allowed:=ARRAY[
    'modello','importo','contenuto','data_ricezione_cliente',
    'data_scadenza','data_ricezione_studio','attivita','esito',
    'responsabile_id','note','dati_estratti'
   ];
  END IF;
 END IF;
 SELECT array_agg(key) INTO v_unknown FROM jsonb_object_keys(p_data) key
  WHERE NOT (key=ANY(v_allowed));
 IF cardinality(coalesce(v_unknown,ARRAY[]::text[]))>0 THEN
  RAISE EXCEPTION 'Forbidden AgeCon mutation fields';
 END IF;

 v_client:=CASE WHEN p_action='create' THEN
  nullif(p_data->>'cliente_id','')::uuid ELSE v_notice.cliente_id END;
 IF v_client IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.crm_cliente_societa_link l
  WHERE l.societa_id=p_societa_id AND l.cliente_id=v_client
 ) THEN
  RAISE EXCEPTION 'AgeCon customer not linked to notice company';
 END IF;
 IF coalesce((v_staff.permessi->'clienti'->>'solo_assegnati')::boolean,false)
  AND v_staff.ruolo='collaboratore'
  AND NOT v_client=ANY(coalesce(v_staff.clienti_assegnati,'{}'::uuid[])) THEN
  RAISE EXCEPTION 'AgeCon customer not assigned to collaborator';
 END IF;

 v_responsabile:=CASE WHEN p_action='create' THEN
  nullif(p_data->>'responsabile_id','')::uuid
 ELSE
  CASE WHEN p_data ? 'responsabile_id' THEN
   nullif(p_data->>'responsabile_id','')::uuid
  ELSE v_notice.responsabile_id END
 END;
 IF v_responsabile IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.utenti_studio us
  JOIN public.utenti_studio_societa membership
    ON us.id=membership.utente_id AND us.auth_user_id=membership.auth_user_id
  WHERE us.id=v_responsabile AND us.attivo IS TRUE AND membership.societa_id=p_societa_id
 ) THEN
  RAISE EXCEPTION 'AgeCon responsible staff not in target company';
 END IF;

 IF p_action='create' THEN
  v_tipo:=nullif(btrim(p_data->>'tipo_avviso'),'');
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'AgeCon notice type required'; END IF;
  INSERT INTO public.avvisi_ade (
   societa_id,cliente_id,cliente_nome,codice_studio,tipo_avviso,
   modello,importo,contenuto,data_ricezione_cliente,data_scadenza,
   data_ricezione_studio,attivita,esito,responsabile_id,note,
   created_by,dati_estratti
  )
  SELECT
   p_societa_id,v_client,
   coalesce(nullif(c.ragione_sociale,''), concat_ws(' ',c.nome,c.cognome)),
   'AGE-'||lpad(nextval('public.fiscosim_agecon_codice_seq')::text,4,'0'),
   v_tipo,nullif(p_data->>'modello',''),
   nullif(p_data->>'importo','')::numeric,
   nullif(p_data->>'contenuto',''),
   nullif(p_data->>'data_ricezione_cliente','')::date,
   nullif(p_data->>'data_scadenza','')::date,
   nullif(p_data->>'data_ricezione_studio','')::date,
   nullif(p_data->>'attivita',''),
   coalesce(p_data->>'esito',''),v_responsabile,
   nullif(p_data->>'note',''),v_staff.id,
   p_data->'dati_estratti'
  FROM public.clienti c WHERE c.id=v_client AND c.attivo IS TRUE
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'AgeCon source CRM client is inactive'; END IF;
 ELSIF p_action='update' THEN
  UPDATE public.avvisi_ade SET
   modello=CASE WHEN p_data ? 'modello' THEN nullif(p_data->>'modello','') ELSE modello END,
   importo=CASE WHEN p_data ? 'importo' THEN nullif(p_data->>'importo','')::numeric ELSE importo END,
   contenuto=CASE WHEN p_data ? 'contenuto' THEN nullif(p_data->>'contenuto','') ELSE contenuto END,
   data_ricezione_cliente=CASE WHEN p_data ? 'data_ricezione_cliente' THEN nullif(p_data->>'data_ricezione_cliente','')::date ELSE data_ricezione_cliente END,
   data_scadenza=CASE WHEN p_data ? 'data_scadenza' THEN nullif(p_data->>'data_scadenza','')::date ELSE data_scadenza END,
   data_ricezione_studio=CASE WHEN p_data ? 'data_ricezione_studio' THEN nullif(p_data->>'data_ricezione_studio','')::date ELSE data_ricezione_studio END,
   attivita=CASE WHEN p_data ? 'attivita' THEN nullif(p_data->>'attivita','') ELSE attivita END,
   esito=CASE WHEN p_data ? 'esito' THEN coalesce(p_data->>'esito','') ELSE esito END,
   responsabile_id=v_responsabile,
   note=CASE WHEN p_data ? 'note' THEN p_data->>'note' ELSE note END,
   dati_estratti=CASE WHEN p_data ? 'dati_estratti' THEN p_data->'dati_estratti' ELSE dati_estratti END,
   updated_at=transaction_timestamp()
  WHERE id=p_avviso_id AND societa_id=p_societa_id
  RETURNING id INTO v_id;
 ELSE
  UPDATE public.avvisi_ade SET esito='chiuso',updated_at=transaction_timestamp()
  WHERE id=p_avviso_id AND societa_id=p_societa_id
  RETURNING id INTO v_id;
 END IF;

 IF v_id IS NULL THEN RAISE EXCEPTION 'AgeCon save did not change a row'; END IF;
 INSERT INTO public.fiscosim_operational_audit (
  entity_kind,entity_id,societa_id,actor_auth_id,action,reason
 ) VALUES ('avviso_ade',v_id,p_societa_id,p_auth_user_id,p_action,btrim(p_reason));
 RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)
 TO service_role;
DO $verify$
BEGIN
 IF has_function_privilege('authenticated',
  'public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)','EXECUTE')
 OR (SELECT prosecdef FROM pg_proc
   WHERE oid='public.fiscosim_studio_write_avviso(text,uuid,uuid,uuid,jsonb,text)'::regprocedure)
 THEN RAISE EXCEPTION 'AgeCon RPC not service-only SECURITY INVOKER'; END IF;
END $verify$;
COMMIT;
