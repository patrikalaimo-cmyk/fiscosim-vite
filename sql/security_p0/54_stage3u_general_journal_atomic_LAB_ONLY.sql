-- Stage3U candidate / GENERAL JOURNAL ONLY.
-- A single SECURITY INVOKER RPC posts two or more debit/credit journal lines,
-- audit record and immutable idempotency claim in ONE PostgreSQL transaction.
-- NO VAT, payment, partitario, document import or withholding supported here.
-- Isolated Stage3S LAB ONLY: never run on live Supabase.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE t text;
BEGIN
 IF current_setting('fiscosim.p0_stage3u_approval',true)
   IS DISTINCT FROM 'local-general-journal-atomic-candidate-only' THEN
  RAISE EXCEPTION 'Stage3U requires explicit isolated LAB approval';
 END IF;
 FOREACH t IN ARRAY ARRAY['societa','utenti_studio','utenti_studio_societa',
  'piano_conti','causali_contabili','prima_nota','prima_nota_righe','audit_contabile'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN
   RAISE EXCEPTION 'Stage3U missing accounting prerequisite %',t;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.prima_nota)<>0
  OR (SELECT count(*) FROM public.prima_nota_righe)<>0
  OR (SELECT count(*) FROM public.audit_contabile)<>0
  OR (SELECT count(*) FROM public.piano_conti)<>0 THEN
  RAISE EXCEPTION 'Stage3U candidate restricted to an empty accounting LAB';
 END IF;
 IF to_regclass('public.fiscosim_general_journal_claim') IS NOT NULL
  OR to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'Stage3U already present: never rerun without a fresh audit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='clienti' AND policyname='clienti_company_boundary'
   AND permissive='RESTRICTIVE') THEN
  RAISE EXCEPTION 'Stage3U requires verified Stage3S security baseline';
 END IF;
END $preflight$;

-- The claim is never browser readable/writable; caller uses server-side
-- service_role and a verified auth_user_id from the signed session.
CREATE TABLE public.fiscosim_general_journal_claim(
 societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 request_payload jsonb NOT NULL,
 prima_nota_id uuid REFERENCES public.prima_nota(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(societa_id,request_id),
 CONSTRAINT journal_claim_payload_object CHECK(jsonb_typeof(request_payload)='object')
);
ALTER TABLE public.fiscosim_general_journal_claim ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscosim_general_journal_claim FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.fiscosim_general_journal_claim TO service_role;

CREATE FUNCTION public.fiscosim_post_general_journal(
 p_societa_id uuid,
 p_auth_user_id uuid,
 p_request_id uuid,
 p_header jsonb,
 p_rows jsonb,
 p_reason text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_actor uuid;
 v_header_keys text[];
 v_line jsonb;
 v_index integer:=0;
 v_conto uuid;
 v_dare numeric;
 v_avere numeric;
 v_total_dare numeric:=0;
 v_total_avere numeric:=0;
 v_pn_id uuid;
 v_prior public.fiscosim_general_journal_claim%ROWTYPE;
 v_claim jsonb;
 v_date date;
 v_causale uuid;
BEGIN
 IF p_societa_id IS NULL OR p_auth_user_id IS NULL OR p_request_id IS NULL
   OR p_header IS NULL OR jsonb_typeof(p_header)<>'object'
   OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
   OR jsonb_array_length(p_rows) NOT BETWEEN 2 AND 100
   OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500
   OR pg_column_size(p_rows)>100000 THEN
  RAISE EXCEPTION 'Stage3U general journal request malformed';
 END IF;
 SELECT array_agg(k) INTO v_header_keys FROM jsonb_object_keys(p_header) k
 WHERE k NOT IN ('data_registrazione','descrizione','causale_id');
 IF cardinality(coalesce(v_header_keys,ARRAY[]::text[]))>0
  OR char_length(btrim(coalesce(p_header->>'descrizione',''))) NOT BETWEEN 5 AND 500
  OR coalesce(p_header->>'data_registrazione','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'Stage3U header missing required fields or has restricted properties';
 END IF;
 v_date:=(p_header->>'data_registrazione')::date;
 IF v_date < DATE '2000-01-01' OR v_date > (current_date + INTERVAL '1 year')::date
 THEN RAISE EXCEPTION 'Stage3U journal date outside allowed interval'; END IF;
 v_causale:=nullif(p_header->>'causale_id','')::uuid;
 IF v_causale IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.causali_contabili c
   WHERE c.id=v_causale AND c.societa_id=p_societa_id
 ) THEN RAISE EXCEPTION 'Stage3U cross-company accounting cause'; END IF;
 -- Require both active staff profile and owner/admin membership in this company.
 -- No company permissions are inferred from browser data or user metadata.
 SELECT us.id INTO v_actor FROM public.utenti_studio us
 JOIN public.utenti_studio_societa m
  ON m.utente_id=us.id AND m.auth_user_id=us.auth_user_id
 JOIN public.societa company ON company.id=m.societa_id
 WHERE us.auth_user_id=p_auth_user_id AND us.attivo IS TRUE
  AND us.ruolo IN ('owner','admin') AND m.ruolo IN ('owner','admin')
  AND m.societa_id=p_societa_id AND company.attiva IS TRUE
 LIMIT 1;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Stage3U actor lacks company journal permission'; END IF;

 v_claim:=jsonb_build_object('header',p_header,'rows',p_rows,'reason',btrim(p_reason));
 -- Insert uniqueness reservation BEFORE writing any accounting row. Concurrent
 -- equal request_ids serialize on the unique index and return the same PN id.
 INSERT INTO public.fiscosim_general_journal_claim
  (societa_id,request_id,auth_user_id,request_payload)
 VALUES (p_societa_id,p_request_id,p_auth_user_id,v_claim)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO v_prior FROM public.fiscosim_general_journal_claim
  WHERE societa_id=p_societa_id AND request_id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_prior.auth_user_id IS DISTINCT FROM p_auth_user_id
   OR v_prior.request_payload IS DISTINCT FROM v_claim
   OR v_prior.prima_nota_id IS NULL THEN
   RAISE EXCEPTION 'Stage3U idempotency key reused with different or incomplete operation';
  END IF;
  RETURN v_prior.prima_nota_id;
 END IF;

 -- Whitelist rows: no account/date/owner/fiscal fields supplied by caller.
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(v_line)<>'object'
   OR (SELECT count(*) FROM jsonb_object_keys(v_line) k
      WHERE k NOT IN ('conto_id','dare','avere','descrizione'))>0
   OR jsonb_typeof(v_line->'dare') IS DISTINCT FROM 'number'
   OR jsonb_typeof(v_line->'avere') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'Stage3U restricted journal row fields'; END IF;
  v_conto:=nullif(v_line->>'conto_id','')::uuid;
  v_dare:=(v_line->>'dare')::numeric;
  v_avere:=(v_line->>'avere')::numeric;
  IF v_dare<0 OR v_avere<0 OR v_dare>999999999999.99
   OR v_avere>999999999999.99
   OR round(v_dare,2)<>v_dare OR round(v_avere,2)<>v_avere
   OR (v_dare=0 AND v_avere=0) OR (v_dare>0 AND v_avere>0)
   OR char_length(coalesce(v_line->>'descrizione',''))>500
   OR NOT EXISTS(SELECT 1 FROM public.piano_conti pc WHERE pc.id=v_conto
    AND pc.societa_id=p_societa_id AND pc.attivo IS TRUE)
  THEN RAISE EXCEPTION 'Stage3U invalid amount or out-of-company ledger account'; END IF;
  v_total_dare:=v_total_dare+v_dare;
  v_total_avere:=v_total_avere+v_avere;
 END LOOP;
 IF v_total_dare<=0 OR v_total_dare<>v_total_avere THEN
  RAISE EXCEPTION 'Stage3U unbalanced general journal';
 END IF;
 -- This is intentionally a general movement: no fiscal side effect is implied.
 INSERT INTO public.prima_nota(
  societa_id,data_registrazione,causale_id,descrizione,stato,
  totale_dare,totale_avere,created_by
 ) VALUES (
  p_societa_id,v_date,v_causale,btrim(p_header->>'descrizione'),
  'confermata',v_total_dare,v_total_avere,v_actor
 ) RETURNING id INTO v_pn_id;

 FOR v_line IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  v_index:=v_index+1;
  v_conto:=(v_line->>'conto_id')::uuid;
  INSERT INTO public.prima_nota_righe(
   prima_nota_id,societa_id,riga_numero,conto_id,
   conto_codice,conto_descrizione,descrizione_riga,
   importo_dare,importo_avere
  ) SELECT
   v_pn_id,p_societa_id,v_index,v_conto,pc.codice,pc.descrizione,
   nullif(btrim(v_line->>'descrizione'),''),
   (v_line->>'dare')::numeric,(v_line->>'avere')::numeric
  FROM public.piano_conti pc
  WHERE pc.id=v_conto AND pc.societa_id=p_societa_id
  AND pc.attivo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage3U chart account changed during posting'; END IF;
 END LOOP;
 INSERT INTO public.audit_contabile(
  societa_id,entity_type,entity_id,operation_type,operation_reason,
  after_data,performed_by,source_module
 ) VALUES(
  p_societa_id,'prima_nota',v_pn_id,'INSERT',btrim(p_reason),
  jsonb_build_object('request_id',p_request_id,'header',p_header,
    'lines',p_rows,'total',v_total_dare),
  v_actor,'registrazione_manual'
 );
 UPDATE public.fiscosim_general_journal_claim SET prima_nota_id=v_pn_id
 WHERE societa_id=p_societa_id AND request_id=p_request_id;
 RETURN v_pn_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)
 TO service_role;
DO $verify$
BEGIN
 IF (SELECT prosecdef FROM pg_proc WHERE oid=
  'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure)
 OR has_function_privilege('authenticated',
  'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
 OR has_table_privilege('authenticated','public.fiscosim_general_journal_claim','SELECT')
 OR has_table_privilege('anon','public.fiscosim_general_journal_claim','SELECT')
 THEN RAISE EXCEPTION 'Stage3U general journal grant/definer safety failure'; END IF;
END $verify$;
COMMIT;
