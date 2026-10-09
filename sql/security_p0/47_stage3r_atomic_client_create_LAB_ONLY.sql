-- Stage3R: one-statement atomic customer creation + manual company ownership.
-- Isolated lab candidate only. Depends on Stage3P and Stage3Q after JWT/UI audit.
-- Never run this script on live Supabase or before Stage3Q.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';

DO $guard$
BEGIN
 IF current_setting('fiscosim.p0_stage3r_approval',true)
    IS DISTINCT FROM 'local-atomic-crm-link-rpc-only' THEN
  RAISE EXCEPTION 'Stage3R requires isolated LAB approval';
 END IF;
 IF to_regclass('public.crm_cliente_societa_link') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_attribute
      WHERE attrelid='public.clienti'::regclass AND attname='telefono' AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='clienti'
       AND policyname='clienti_company_boundary' AND permissive='RESTRICTIVE')
 THEN
  RAISE EXCEPTION 'Stage3R requires verified Stage3Q schema, not yet installed';
 END IF;
 IF (SELECT count(*) FROM public.clienti)<>0
    OR (SELECT count(*) FROM public.crm_cliente_societa_link)<>0 THEN
  RAISE EXCEPTION 'Stage3R requires empty CRM LAB schema';
 END IF;
END $guard$;

CREATE FUNCTION public.fiscosim_studio_create_cliente(
  p_societa_id uuid,
  p_auth_user_id uuid,
  p_data jsonb,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog
AS $procedure$
DECLARE
 v_cliente_id uuid;
 v_nome text;
 v_keys text[];
BEGIN
 IF p_societa_id IS NULL OR p_auth_user_id IS NULL
    OR p_data IS NULL OR jsonb_typeof(p_data)<>'object'
    OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 THEN
  RAISE EXCEPTION 'Incomplete explicit customer ownership request';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.utenti_studio us
  JOIN public.utenti_studio_societa m
    ON m.utente_id=us.id AND m.auth_user_id=us.auth_user_id
  WHERE us.auth_user_id=p_auth_user_id AND us.attivo IS TRUE
    AND us.ruolo IN ('owner','admin')
    AND m.societa_id=p_societa_id
 ) THEN
  RAISE EXCEPTION 'Customer actor lacks verified company membership';
 END IF;
 SELECT array_agg(key) INTO v_keys FROM jsonb_object_keys(p_data) key
 WHERE key NOT IN (
   'nome','cognome','ragione_sociale','tipo_cliente','email','email_cc',
   'codice_fiscale','partita_iva','note','codice_cliente','telefono','indirizzo',
   'moduli_attivi'
 );
 IF cardinality(coalesce(v_keys,ARRAY[]::text[]))>0 THEN
  RAISE EXCEPTION 'Unsupported CRM fields in create request';
 END IF;
 v_nome:=coalesce(
   nullif(btrim(p_data->>'nome'),''),
   nullif(btrim(p_data->>'ragione_sociale'),'')
 );
 IF v_nome IS NULL THEN
  RAISE EXCEPTION 'CRM customer name or business name required';
 END IF;
 IF p_data ? 'email_cc' AND jsonb_typeof(p_data->'email_cc')<>'array'
  OR p_data ? 'moduli_attivi' AND jsonb_typeof(p_data->'moduli_attivi')<>'array' THEN
  RAISE EXCEPTION 'Invalid client array field';
 END IF;

 -- The statement and subsequent bridge insertion share one PostgreSQL
 -- transaction: any FK, data or privilege failure rolls back BOTH rows.
 INSERT INTO public.clienti (
  nome,cognome,ragione_sociale,tipo_cliente,email,email_cc,
  codice_fiscale,partita_iva,note,codice_cliente,
  telefono,indirizzo,moduli_attivi,attivo
 ) VALUES (
  v_nome, nullif(btrim(p_data->>'cognome'),''),
  nullif(btrim(p_data->>'ragione_sociale'),''),
  coalesce(nullif(btrim(p_data->>'tipo_cliente'),''),'forfettario'),
  nullif(btrim(p_data->>'email'),''),
  CASE WHEN p_data ? 'email_cc'
   THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'email_cc'))
   ELSE '{}'::text[] END,
  nullif(btrim(p_data->>'codice_fiscale'),''),
  nullif(btrim(p_data->>'partita_iva'),''),
  nullif(p_data->>'note',''),
  nullif(btrim(p_data->>'codice_cliente'),''),
  nullif(btrim(p_data->>'telefono'),''),
  nullif(btrim(p_data->>'indirizzo'),''),
  CASE WHEN p_data ? 'moduli_attivi'
   THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'moduli_attivi'))
   ELSE ARRAY['iva','f24','ammortamenti','adempimenti','simulatore'] END,
  true
 ) RETURNING id INTO v_cliente_id;

 INSERT INTO public.crm_cliente_societa_link
  (cliente_id,societa_id,assigned_by,decision_reason)
 VALUES (v_cliente_id,p_societa_id,p_auth_user_id,btrim(p_reason));
 RETURN v_cliente_id;
END;
$procedure$;

REVOKE ALL PRIVILEGES
 ON FUNCTION public.fiscosim_studio_create_cliente(uuid,uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE
 ON FUNCTION public.fiscosim_studio_create_cliente(uuid,uuid,jsonb,text)
 TO service_role;

DO $post$
DECLARE f oid;
BEGIN
 SELECT p.oid INTO f FROM pg_proc p
 WHERE p.oid='public.fiscosim_studio_create_cliente(uuid,uuid,jsonb,text)'::regprocedure;
 IF f IS NULL
 OR (SELECT prosecdef FROM pg_proc WHERE oid=f)
 OR has_function_privilege('authenticated',f,'EXECUTE')
 OR has_function_privilege('anon',f,'EXECUTE')
 OR NOT has_function_privilege('service_role',f,'EXECUTE')
 THEN
  RAISE EXCEPTION 'Stage3R RPC execution privileges incorrect';
 END IF;
END $post$;
COMMIT;
