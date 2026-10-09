-- Stage3S candidate: atomic, fully-scoped CRM edit, module update, deactivation.
-- SQL LAB ONLY; do not deploy or execute until Stage3Q + Stage3R are verified.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $gate$
BEGIN
 IF current_setting('fiscosim.p0_stage3s_approval',true)
    IS DISTINCT FROM 'local-shared-crm-update-only' THEN
  RAISE EXCEPTION 'Stage3S requires isolated-LAB approval';
 END IF;
 IF to_regprocedure('public.fiscosim_studio_create_cliente(uuid,uuid,jsonb,text)') IS NULL
    OR NOT EXISTS (
     SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='clienti'
      AND policyname='clienti_company_boundary' AND permissive='RESTRICTIVE'
    ) THEN
  RAISE EXCEPTION 'Stage3S requires tested Stage3Q/3R';
 END IF;
END $gate$;

-- Append-only operational record, protected from every browser role.
CREATE TABLE public.fiscosim_operational_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_kind text NOT NULL CHECK(entity_kind IN ('cliente','avviso_ade','revisione_dichiarativi')),
 entity_id uuid NOT NULL,
 societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT,
 actor_auth_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 action text NOT NULL,
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 12 AND 500),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE INDEX fiscosim_operational_audit_entity_idx
 ON public.fiscosim_operational_audit(entity_kind,entity_id,created_at);
ALTER TABLE public.fiscosim_operational_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscosim_operational_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.fiscosim_operational_audit TO service_role;

CREATE FUNCTION public.fiscosim_studio_update_cliente(
 p_cliente_id uuid, p_auth_user_id uuid, p_action text,
 p_data jsonb, p_reason text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
DECLARE
 v_client public.clienti%ROWTYPE;
 v_unknown text[];
 v_targets integer;
BEGIN
 IF p_cliente_id IS NULL OR p_auth_user_id IS NULL
    OR p_action IS NULL OR p_action NOT IN ('edit','modules','deactivate')
    OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 THEN
  RAISE EXCEPTION 'Invalid CRM update intent';
 END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN
  RAISE EXCEPTION 'Invalid CRM update fields';
 END IF;

 -- Lock the actual parent row BEFORE inspecting associations. FK KEY SHARE
 -- operations for new links must wait on this FOR UPDATE lock.
 SELECT * INTO v_client FROM public.clienti
  WHERE id=p_cliente_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer record not found'; END IF;

 SELECT count(*) INTO v_targets FROM public.crm_cliente_societa_link
  WHERE cliente_id=p_cliente_id;
 IF v_targets=0 OR EXISTS (
  SELECT 1 FROM public.crm_cliente_societa_link l
  WHERE l.cliente_id=p_cliente_id
   AND NOT EXISTS (
    SELECT 1 FROM public.utenti_studio us
    JOIN public.utenti_studio_societa m
      ON m.utente_id=us.id AND m.auth_user_id=us.auth_user_id
    JOIN public.societa so ON so.id=m.societa_id
    WHERE us.auth_user_id=p_auth_user_id AND us.attivo IS TRUE
      AND us.ruolo IN ('owner','admin') AND so.attiva IS TRUE
      AND m.societa_id=l.societa_id
   )
 ) THEN
  RAISE EXCEPTION 'CRM operation requires all linked company memberships';
 END IF;

 IF p_action='edit' THEN
  SELECT array_agg(key) INTO v_unknown FROM jsonb_object_keys(p_data) key
   WHERE key NOT IN ('nome','cognome','ragione_sociale','tipo_cliente',
    'email','email_cc','codice_fiscale','partita_iva','note','codice_cliente',
    'telefono','indirizzo');
  IF cardinality(coalesce(v_unknown,ARRAY[]::text[]))>0 THEN
   RAISE EXCEPTION 'Forbidden CRM edit fields';
  END IF;
  IF p_data ? 'email_cc' AND jsonb_typeof(p_data->'email_cc') <> 'array' THEN
   RAISE EXCEPTION 'Invalid client email list';
  END IF;
  IF p_data ? 'nome' AND nullif(btrim(coalesce(p_data->>'nome','')),'') IS NULL THEN
   RAISE EXCEPTION 'CRM customer name cannot be empty';
  END IF;
  UPDATE public.clienti SET
   nome=CASE WHEN p_data ? 'nome' THEN btrim(p_data->>'nome') ELSE nome END,
   cognome=CASE WHEN p_data ? 'cognome' THEN nullif(btrim(p_data->>'cognome'),'') ELSE cognome END,
   ragione_sociale=CASE WHEN p_data ? 'ragione_sociale' THEN nullif(btrim(p_data->>'ragione_sociale'),'') ELSE ragione_sociale END,
   tipo_cliente=CASE WHEN p_data ? 'tipo_cliente' THEN p_data->>'tipo_cliente' ELSE tipo_cliente END,
   email=CASE WHEN p_data ? 'email' THEN nullif(btrim(p_data->>'email'),'') ELSE email END,
   email_cc=CASE WHEN p_data ? 'email_cc' THEN
    ARRAY(SELECT jsonb_array_elements_text(p_data->'email_cc')) ELSE email_cc END,
   codice_fiscale=CASE WHEN p_data ? 'codice_fiscale' THEN nullif(btrim(p_data->>'codice_fiscale'),'') ELSE codice_fiscale END,
   partita_iva=CASE WHEN p_data ? 'partita_iva' THEN nullif(btrim(p_data->>'partita_iva'),'') ELSE partita_iva END,
   note=CASE WHEN p_data ? 'note' THEN p_data->>'note' ELSE note END,
   codice_cliente=CASE WHEN p_data ? 'codice_cliente' THEN nullif(btrim(p_data->>'codice_cliente'),'') ELSE codice_cliente END,
   telefono=CASE WHEN p_data ? 'telefono' THEN nullif(btrim(p_data->>'telefono'),'') ELSE telefono END,
   indirizzo=CASE WHEN p_data ? 'indirizzo' THEN nullif(btrim(p_data->>'indirizzo'),'') ELSE indirizzo END,
   updated_at=transaction_timestamp()
  WHERE id=p_cliente_id;
 ELSIF p_action='modules' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_data))<>1
    OR NOT p_data ? 'moduli_attivi'
    OR jsonb_typeof(p_data->'moduli_attivi')<>'array' THEN
   RAISE EXCEPTION 'Only modules list can change in modules action';
  END IF;
  UPDATE public.clienti SET
   moduli_attivi=ARRAY(SELECT jsonb_array_elements_text(p_data->'moduli_attivi')),
   updated_at=transaction_timestamp()
  WHERE id=p_cliente_id;
 ELSE
  IF p_data<>'{}'::jsonb THEN
   RAISE EXCEPTION 'No arbitrary fields allowed during deactivation';
  END IF;
  UPDATE public.clienti SET attivo=false,updated_at=transaction_timestamp()
   WHERE id=p_cliente_id;
 END IF;
 INSERT INTO public.fiscosim_operational_audit
  (entity_kind,entity_id,societa_id,actor_auth_id,action,reason)
 SELECT 'cliente',p_cliente_id,l.societa_id,p_auth_user_id,p_action,btrim(p_reason)
 FROM public.crm_cliente_societa_link l WHERE l.cliente_id=p_cliente_id;
 RETURN p_cliente_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)
 TO service_role;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_policies
  WHERE schemaname='public' AND tablename='fiscosim_operational_audit')
  OR has_table_privilege('authenticated','public.fiscosim_operational_audit','SELECT')
  OR has_table_privilege('authenticated','public.fiscosim_operational_audit','INSERT')
  OR has_table_privilege('anon','public.fiscosim_operational_audit','SELECT')
 THEN RAISE EXCEPTION 'Stage3S audit table exposure detected'; END IF;
 IF (SELECT prosecdef FROM pg_proc
  WHERE oid='public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)'::regprocedure)
 OR has_function_privilege('anon','public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fiscosim_studio_update_cliente(uuid,uuid,text,jsonb,text)','EXECUTE')
 THEN
  RAISE EXCEPTION 'Stage3S CRM RPC execution ACL invalid';
 END IF;
END $verify$;
COMMIT;
