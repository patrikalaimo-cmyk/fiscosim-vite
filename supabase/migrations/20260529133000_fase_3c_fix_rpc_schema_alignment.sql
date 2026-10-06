-- Migration: 20260529133000_fase_3c_fix_rpc_schema_alignment.sql
-- Descrizione: Allinea le stored procedure contabili (guards, update, storno, annullo) allo schema reale delle tabelle del database.

-- =========================================================================
-- RPC 1: rpc_get_prima_nota_operation_guards
-- =========================================================================
create or replace function public.rpc_get_prima_nota_operation_guards(
  p_prima_nota_id uuid,
  p_societa_id uuid,
  p_operation_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pn record;
  v_rows_count integer;
  v_sum_dare numeric(15,2);
  v_sum_avere numeric(15,2);
  v_blocking_reasons text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_required_permission text := null;
  v_requires_reason boolean := true;
  v_requires_recalculation boolean := false;
  v_impacted_outputs text[] := array[]::text[];
  v_required_followups text[] := array[]::text[];
  v_suggested_workflow text := 'procedi';
  v_warning_level text := 'verde';
  v_can_execute boolean := true;
  v_can_force boolean := true;
  v_force_requires_role_or_permission text := null;
  
  v_is_admin boolean := false;
  v_has_delegated_perm boolean := false;
  
  -- Variabili per controlli fiscali ed IVA
  v_has_payments boolean := false;
  v_is_payment boolean := false;
  v_is_liquidated boolean := false;
  v_periodo_iva date;
  v_codice_iva_riga text;
begin
  -- 1. Caricamento Testata
  select * into v_pn from public.prima_nota
  where id = p_prima_nota_id and societa_id = p_societa_id;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'can_execute', false,
      'warning_level', 'nero',
      'blocking_reasons', jsonb_build_array('Registrazione contabile non trovata o non appartenente alla società selezionata.'),
      'warnings', jsonb_build_array(),
      'required_permission', null,
      'requires_reason', true,
      'requires_recalculation', false,
      'impacted_outputs', jsonb_build_array(),
      'required_followups', jsonb_build_array(),
      'suggested_workflow', 'blocca',
      'can_force', false,
      'force_requires_role_or_permission', null
    );
  end if;

  -- 2. Caricamento e Controllo Righe
  select count(*), coalesce(sum(importo_dare), 0), coalesce(sum(importo_avere), 0)
  into v_rows_count, v_sum_dare, v_sum_avere
  from public.prima_nota_righe
  where prima_nota_id = p_prima_nota_id;

  if v_rows_count = 0 then
    v_blocking_reasons := v_blocking_reasons || array['La registrazione contabile è corrotta o non contiene alcuna riga contabile.'];
    v_can_force := false;
  elsif v_sum_dare <> v_sum_avere then
    v_blocking_reasons := v_blocking_reasons || array[format('Squadratura Dare/Avere: il totale Dare (%s) non coincide con il totale Avere (%s).', v_sum_dare, v_sum_avere)];
    v_can_force := false;
  elsif v_pn.totale_dare <> v_sum_dare or v_pn.totale_avere <> v_sum_avere then
    v_blocking_reasons := v_blocking_reasons || array['Record corrotto: il totale specificato in testata non coincide con la somma delle righe contabili.'];
    v_can_force := false;
  end if;

  -- 3. Verifica Conto Inesistente
  if exists (
    select 1 from public.prima_nota_righe r
    where r.prima_nota_id = p_prima_nota_id
      and (r.conto_id is null or not exists (select 1 from public.piano_conti pc where pc.id = r.conto_id))
  ) then
    v_blocking_reasons := v_blocking_reasons || array['Conto inesistente: una o più righe contabili fanno riferimento a conti non esistenti nel piano dei conti.'];
    v_can_force := false;
  end if;

  -- 4. Verifica Stato ed Incoerenze Tecniche (Operazione che lascia dati incoerenti)
  if v_pn.stato in ('annullata', 'stornata', 'storno') then
    v_blocking_reasons := v_blocking_reasons || array['La scrittura contabile è già in stato ' || coalesce(v_pn.stato, 'sconosciuto') || ' (neutralizzata/stornata) e non può subire ulteriori modifiche o storni.'];
    v_can_force := false;
  end if;

  if v_pn.stato = 'simulata' and p_operation_type = 'STORNO' then
    v_blocking_reasons := v_blocking_reasons || array['Lo storno contabile è inibito per scritture in stato simulata.'];
    v_can_force := false;
  end if;

  if v_pn.storno_of_id is not null and p_operation_type = 'STORNO' then
    v_blocking_reasons := v_blocking_reasons || array['Impossibile effettuare lo storno di una scrittura che è già essa stessa una scrittura di storno.'];
    v_can_force := false;
  end if;

  -- 5. Verifica Cancellazione Fisica di Scrittura Registrata
  if p_operation_type = 'DELETE_FISICA' then
    if v_pn.stato <> 'bozza' and v_pn.stato <> 'provvisoria' and v_pn.stato <> 'simulata' then
      v_blocking_reasons := v_blocking_reasons || array['Operazione contraria a regole contabili: la cancellazione fisica è inibita per scritture già registrate. Utilizzare l''annullamento logico o lo storno.'];
      v_can_force := false;
    else
      v_suggested_workflow := 'elimina';
    end if;
  end if;

  -- 6. Rilevamento Ruolo Sessione (Admin/Owner)
  if auth.uid() is not null then
    select coalesce(us.ruolo in ('owner', 'admin'), false) into v_is_admin
    from public.utenti_studio us
    where us.auth_user_id = auth.uid() and us.attivo = true;
  else
    v_is_admin := true; -- Chiamate esterne/service_role o di test hanno privilegi massimi
  end if;

  -- 7. Controllo Chiusura Esercizio (Warning level: nero)
  if coalesce(v_pn.periodo_chiuso_lock, false) = true then
    v_warning_level := 'nero';
    v_warnings := v_warnings || array['Esercizio contabile chiuso o stampato in definitivo. La modifica richiede privilegi amministrativi.'];
    v_impacted_outputs := v_impacted_outputs || array['registri_definitivi', 'bilancio_esercizio'];
    v_required_followups := v_required_followups || array['Sarà necessario riaprire l''esercizio, richiudere e ristampare i registri definitivi in caso di forzatura.'];
    v_required_permission := 'modifica_esercizio_chiuso';
    v_force_requires_role_or_permission := 'owner';
    v_suggested_workflow := 'richiede_approvazione';

    if auth.uid() is not null then
      select coalesce((us.permessi -> 'contabilita' ->> 'modifica_esercizio_chiuso')::boolean, false) into v_has_delegated_perm
      from public.utenti_studio us where us.auth_user_id = auth.uid() and us.attivo = true;
    else
      v_has_delegated_perm := true;
    end if;

    if not v_is_admin and not v_has_delegated_perm then
      v_blocking_reasons := v_blocking_reasons || array['Utente senza permesso richiesto: l''esercizio è chiuso e l''utente non possiede il permesso "modifica_esercizio_chiuso" o il ruolo di Amministratore/Owner.'];
    end if;
  end if;

  -- 8. Controllo Impatto su IVA Liquidata (Warning level: rosso)
  -- Controlla se la scrittura contabile ha righe IVA
  for v_codice_iva_riga in select distinct r.causale_iva_codice from public.prima_nota_righe r where r.prima_nota_id = p_prima_nota_id and r.causale_iva_codice is not null loop
    -- Controlla se la data di registrazione ricade in un periodo con liquidazione IVA già elaborata o definitiva
    
    if exists (
      select 1 from public.liquidazione_iva liq
      where liq.societa_id = p_societa_id
        and liq.periodo_inizio <= v_pn.data_registrazione
        and liq.periodo_fine >= v_pn.data_registrazione
    ) then
      v_warning_level := 'rosso';
      v_warnings := v_warnings || array[format('Impatto su IVA elaborata: la scrittura possiede righe con codice IVA %s in un periodo (%s) in cui la liquidazione IVA è già calcolata o chiusa.', v_codice_iva_riga, to_char(v_pn.data_registrazione, 'MM/YYYY'))];
      v_impacted_outputs := v_impacted_outputs || array['liquidazione_iva_periodica', 'registri_iva_stampati', 'lipe_elaborazione'];
      v_required_followups := v_required_followups || array['Ricalcolo e invio integrativo della liquidazione IVA e LIPE per il periodo interessato'];
      v_requires_recalculation := true;
      v_suggested_workflow := 'richiede_conferma';
    end if;
  end loop;

  -- 9. Controllo Impatto su Partitario e Scadenze (Warning level: giallo)
  select exists (
    select 1 from public.partitario
    where societa_id = p_societa_id
      and (prima_nota_id = p_prima_nota_id or chiusa_da_prima_nota_id = p_prima_nota_id)
  ) into v_has_payments;

  select exists (
    select 1 from public.prima_nota_righe r
    join public.piano_conti pc on pc.id = r.conto_id
    where r.prima_nota_id = p_prima_nota_id
      and pc.codice in ('411101', '451101', '411102', '451102') -- Clienti / Fornitori base
  ) into v_is_payment;

  if (v_has_payments or v_is_payment) and v_warning_level <> 'nero' and v_warning_level <> 'rosso' then
    v_warning_level := 'giallo';
    v_warnings := v_warnings || array['Scrittura associata a scadenze o movimenti di pagamento nel partitario. La modifica disallineerà lo stato delle partite aperte.'];
    v_impacted_outputs := v_impacted_outputs || array['scheda_partitario_clienti_fornitori', 'partite_aperte_scadenziario'];
    v_required_followups := v_required_followups || array['Riallineamento e verifica manuale dello stato delle scadenze e dei pagamenti del partitario'];
    v_suggested_workflow := 'procedi_con_avviso';
  end if;

  v_can_execute := (cardinality(v_blocking_reasons) = 0);

  return jsonb_build_object(
    'allowed', v_can_execute,
    'can_execute', v_can_execute,
    'warning_level', v_warning_level,
    'blocking_reasons', to_jsonb(v_blocking_reasons),
    'warnings', to_jsonb(v_warnings),
    'required_permission', v_required_permission,
    'requires_reason', v_requires_reason,
    'requires_recalculation', v_requires_recalculation,
    'impacted_outputs', to_jsonb(v_impacted_outputs),
    'required_followups', to_jsonb(v_required_followups),
    'suggested_workflow', v_suggested_workflow,
    'can_force', v_can_force,
    'force_requires_role_or_permission', v_force_requires_role_or_permission
  );
end;
$$;

grant execute on function public.rpc_get_prima_nota_operation_guards(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_get_prima_nota_operation_guards(uuid, uuid, text) to service_role;


-- =========================================================================
-- RPC 2: rpc_update_prima_nota_generale_controllata
-- =========================================================================
create or replace function public.rpc_update_prima_nota_generale_controllata(
  p_prima_nota_id uuid,
  p_societa_id uuid,
  p_header jsonb,
  p_rows jsonb,
  p_motivo text,
  p_utente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guards jsonb;
  v_old_state jsonb;
  v_new_state jsonb;
  v_riga record;
  v_tot_dare numeric(15,2) := 0;
  v_tot_avere numeric(15,2) := 0;
begin
  -- 0. Controllo di sicurezza sessione/tenant
  if auth.uid() is not null then
    if not coalesce(public.user_has_societa_access(p_societa_id), false) then
      raise exception 'Accesso negato: sessione non autorizzata per la società specificata.';
    end if;
    if p_utente_id is distinct from public.current_utente_studio_id() then
      raise exception 'Identificativo utente non coerente con la sessione attiva.';
    end if;
  end if;

  -- 1. Esegui controlli di sicurezza via guards
  v_guards := public.rpc_get_prima_nota_operation_guards(p_prima_nota_id, p_societa_id, 'UPDATE');
  if not (v_guards->>'can_execute')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', 'Operazione bloccata dai controlli di integrità contabile.',
      'blockers', v_guards->'blocking_reasons'
    );
  end if;

  -- 2. Verifica quadratura Dare/Avere delle righe in input
  for v_riga in select * from jsonb_to_recordset(p_rows) as (importo_dare numeric, importo_avere numeric) loop
    v_tot_dare := v_tot_dare + coalesce(v_riga.importo_dare, 0);
    v_tot_avere := v_tot_avere + coalesce(v_riga.importo_avere, 0);
  end loop;

  if v_tot_dare <> v_tot_avere then
    return jsonb_build_object(
      'success', false,
      'error', 'La registrazione modificata non è quadrata in Dare e Avere.',
      'blockers', jsonb_build_array(format('Totale Dare (%s) non coincide con Totale Avere (%s)', v_tot_dare, v_tot_avere))
    );
  end if;

  if length(coalesce(p_motivo, '')) < 15 then
    return jsonb_build_object(
      'success', false,
      'error', 'Il motivo della modifica è obbligatorio (minimo 15 caratteri).',
      'blockers', jsonb_build_array('Giustificazione della modifica insufficiente o mancante.')
    );
  end if;

  -- 3. Acquisizione dello stato Before
  select json_build_object(
    'header', row_to_json(pn),
    'righe', (select jsonb_agg(r) from public.prima_nota_righe r where r.prima_nota_id = p_prima_nota_id)
  ) into v_old_state
  from public.prima_nota pn where pn.id = p_prima_nota_id;

  -- 4. Esecuzione dell'aggiornamento controllato in-place dell'header
  update public.prima_nota set
    data_registrazione = (p_header->>'data_registrazione')::date,
    data_documento = nullif(p_header->>'data_documento', '')::date,
    numero_documento = nullif(p_header->>'numero_documento', ''),
    causale_codice = p_header->>'causale_codice',
    descrizione = p_header->>'descrizione',
    cliente_fornitore_id = nullif(p_header->>'cliente_fornitore_id', '')::uuid,
    cliente_fornitore_nome = nullif(p_header->>'cliente_fornitore_nome', ''),
    totale_dare = v_tot_dare,
    totale_avere = v_tot_avere,
    stato = coalesce(p_header->>'stato', stato),
    motivo_operazione = p_motivo,
    versione = versione + 1,
    updated_by = p_utente_id,
    updated_at = now()
  where id = p_prima_nota_id and societa_id = p_societa_id;

  -- 5. Sostituzione atomica delle righe contabili (Allineata a schema prima_nota_righe reale)
  delete from public.prima_nota_righe where prima_nota_id = p_prima_nota_id;

  for v_riga in select * from jsonb_to_recordset(p_rows) as (
    riga_numero int, conto_id uuid, conto_codice varchar,
    conto_descrizione varchar, descrizione_riga text,
    importo_dare numeric, importo_avere numeric,
    causale_iva_codice varchar, imponibile numeric, iva numeric
  ) loop
    insert into public.prima_nota_righe (
      prima_nota_id, riga_numero, conto_id, conto_codice,
      conto_descrizione, descrizione_riga, importo_dare, importo_avere,
      causale_iva_codice, imponibile, iva
    ) values (
      p_prima_nota_id, v_riga.riga_numero, v_riga.conto_id, v_riga.conto_codice,
      v_riga.conto_descrizione, v_riga.descrizione_riga, coalesce(v_riga.importo_dare, 0), coalesce(v_riga.importo_avere, 0),
      nullif(v_riga.causale_iva_codice, ''), coalesce(v_riga.imponibile, 0), coalesce(v_riga.iva, 0)
    );
  end loop;

  -- 6. Acquisizione dello stato After
  select json_build_object(
    'header', row_to_json(pn),
    'righe', (select jsonb_agg(r) from public.prima_nota_righe r where r.prima_nota_id = p_prima_nota_id)
  ) into v_new_state
  from public.prima_nota pn where pn.id = p_prima_nota_id;

  -- 7. Scrittura immutabile nel registro di audit
  insert into public.audit_contabile (
    societa_id, entity_type, entity_id, operation_type, operation_reason, before_data, after_data, performed_by, source_module
  ) values (
    p_societa_id, 'prima_nota', p_prima_nota_id, 'UPDATE', p_motivo, v_old_state, v_new_state, p_utente_id, 'registrazione_manual'
  );

  return jsonb_build_object(
    'success', true,
    'primaNotaId', p_prima_nota_id,
    'versione', v_new_state->'header'->>'versione',
    'message', 'Registrazione contabile modificata e registrata nell''audit trail con successo.'
  );
end;
$$;

grant execute on function public.rpc_update_prima_nota_generale_controllata(uuid, uuid, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.rpc_update_prima_nota_generale_controllata(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;


-- =========================================================================
-- RPC 3: rpc_storna_prima_nota_generale
-- =========================================================================
create or replace function public.rpc_storna_prima_nota_generale(
  p_prima_nota_id uuid,
  p_societa_id uuid,
  p_motivo text,
  p_data_storno date,
  p_utente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guards jsonb;
  v_orig_pn public.prima_nota%rowtype;
  v_next_num integer;
  v_storno_id uuid := gen_random_uuid();
  v_riga record;
  v_orig_righe jsonb;
  v_storno_righe jsonb;
  v_today date := coalesce(p_data_storno, current_date);
begin
  -- 0. Controllo di sicurezza sessione/tenant
  if auth.uid() is not null then
    if not coalesce(public.user_has_societa_access(p_societa_id), false) then
      raise exception 'Accesso negato: sessione non autorizzata per la società specificata.';
    end if;
    if p_utente_id is distinct from public.current_utente_studio_id() then
      raise exception 'Identificativo utente non coerente con la sessione attiva.';
    end if;
  end if;

  -- 1. Controlli preventivi di ammissibilità dello storno
  v_guards := public.rpc_get_prima_nota_operation_guards(p_prima_nota_id, p_societa_id, 'STORNO');
  if not (v_guards->>'can_execute')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', 'Generazione dello storno contabile bloccata.',
      'blockers', v_guards->'blocking_reasons'
    );
  end if;

  if length(coalesce(p_motivo, '')) < 15 then
    return jsonb_build_object(
      'success', false,
      'error', 'Giustificazione storno contabile obbligatoria (minimo 15 caratteri).',
      'blockers', jsonb_build_array('Fornire un motivo valido e dettagliato dello storno.')
    );
  end if;

  -- 2. Carica scrittura originale
  select * into v_orig_pn from public.prima_nota
  where id = p_prima_nota_id and societa_id = p_societa_id;

  -- 3. Ottieni numero progressivo per lo storno
  select coalesce(max(numero_registrazione), 0) + 1 into v_next_num
  from public.prima_nota where societa_id = p_societa_id;

  -- 4. Cattura righe originali prima dello storno
  select jsonb_agg(r) into v_orig_righe
  from public.prima_nota_righe r where r.prima_nota_id = p_prima_nota_id;

  -- 5. Creazione testata storno contabile (Dare e Avere invertiti) con stato = 'storno'
  insert into public.prima_nota (
    id, societa_id, company_id, tenant_id, numero_registrazione, data_registrazione,
    data_documento, numero_documento, causale_id, causale_codice, descrizione,
    cliente_fornitore_id, cliente_fornitore_nome, totale_dare, totale_avere,
    stato, storno_of_id, motivo_operazione, created_by
  ) values (
    v_storno_id, p_societa_id, v_orig_pn.company_id, v_orig_pn.tenant_id, v_next_num, v_today,
    v_orig_pn.data_documento, v_orig_pn.numero_documento, v_orig_pn.causale_id, v_orig_pn.causale_codice,
    'STORNO REGISTRAZIONE N. ' || coalesce(v_orig_pn.numero_registrazione::text, ''),
    v_orig_pn.cliente_fornitore_id, v_orig_pn.cliente_fornitore_nome, v_orig_pn.totale_avere, v_orig_pn.totale_dare,
    'storno', p_prima_nota_id, p_motivo, p_utente_id
  );

  -- 6. Inversione e creazione righe di storno Dare <-> Avere (Allineata a schema prima_nota_righe reale)
  for v_riga in select * from jsonb_to_recordset(v_orig_righe) as (
    riga_numero int, conto_id uuid, conto_codice varchar,
    conto_descrizione varchar, descrizione_riga text,
    importo_dare numeric, importo_avere numeric,
    causale_iva_codice varchar, imponibile numeric, iva numeric
  ) loop
    insert into public.prima_nota_righe (
      prima_nota_id, riga_numero, conto_id, conto_codice,
      conto_descrizione, descrizione_riga, importo_dare, importo_avere,
      causale_iva_codice, imponibile, iva
    ) values (
      v_storno_id, v_riga.riga_numero, v_riga.conto_id, v_riga.conto_codice,
      v_riga.conto_descrizione, 'STORNO - ' || coalesce(v_riga.descrizione_riga, ''),
      coalesce(v_riga.importo_avere, 0), coalesce(v_riga.importo_dare, 0),
      nullif(v_riga.causale_iva_codice, ''), -coalesce(v_riga.imponibile, 0), -coalesce(v_riga.iva, 0)
    );
  end loop;

  -- 7. Aggiorna stato della registrazione originaria in 'stornata'
  update public.prima_nota set
    stato = 'stornata',
    stornata_at = now(),
    stornata_by = p_utente_id,
    storno_id = v_storno_id,
    annullamento_motivo = 'Stornata in data ' || v_today::text || '. Motivo: ' || p_motivo,
    updated_at = now()
  where id = p_prima_nota_id;

  -- 8. Cattura righe dello storno
  select jsonb_agg(r) into v_storno_righe
  from public.prima_nota_righe r where r.prima_nota_id = v_storno_id;

  -- 9. Persistenza audit trail per lo storno
  insert into public.audit_contabile (
    societa_id, entity_type, entity_id, operation_type, operation_reason, before_data, after_data, performed_by, source_module
  ) values (
    p_societa_id, 'prima_nota', v_storno_id, 'STORNO', p_motivo,
    json_build_object('originale_id', p_prima_nota_id, 'originale_righe', v_orig_righe),
    json_build_object('storno_id', v_storno_id, 'storno_righe', v_storno_righe),
    p_utente_id, 'registrazione_manual'
  );

  return jsonb_build_object(
    'success', true,
    'stornoId', v_storno_id,
    'numeroStorno', v_next_num,
    'message', 'Storno contabile generato con successo e collegato alla registrazione originaria.'
  );
end;
$$;

grant execute on function public.rpc_storna_prima_nota_generale(uuid, uuid, text, date, uuid) to authenticated;
grant execute on function public.rpc_storna_prima_nota_generale(uuid, uuid, text, date, uuid) to service_role;


-- =========================================================================
-- RPC 4: rpc_annulla_prima_nota_logica
-- =========================================================================
create or replace function public.rpc_annulla_prima_nota_logica(
  p_prima_nota_id uuid,
  p_societa_id uuid,
  p_motivo text,
  p_utente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guards jsonb;
  v_old_state jsonb;
  v_new_state jsonb;
begin
  -- 0. Controllo di sicurezza sessione/tenant
  if auth.uid() is not null then
    if not coalesce(public.user_has_societa_access(p_societa_id), false) then
      raise exception 'Accesso negato: sessione non autorizzata per la società specificata.';
    end if;
    if p_utente_id is distinct from public.current_utente_studio_id() then
      raise exception 'Identificativo utente non coerente con la sessione attiva.';
    end if;
  end if;

  -- 1. Controlli preventivi di ammissibilità
  v_guards := public.rpc_get_prima_nota_operation_guards(p_prima_nota_id, p_societa_id, 'ANNULLA');
  if not (v_guards->>'can_execute')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', 'Annullamento negato dai controlli di sicurezza.',
      'blockers', v_guards->'blocking_reasons'
    );
  end if;

  if length(coalesce(p_motivo, '')) < 15 then
    return jsonb_build_object(
      'success', false,
      'error', 'Giustificazione obbligatoria per l''annullamento (minimo 15 caratteri).',
      'blockers', jsonb_build_array('Motivo dell''annullamento insufficiente o vuoto.')
    );
  end if;

  -- 2. Acquisizione dello stato Before
  select json_build_object(
    'header', row_to_json(pn),
    'righe', (select jsonb_agg(r) from public.prima_nota_righe r where r.prima_nota_id = p_prima_nota_id)
  ) into v_old_state
  from public.prima_nota pn where pn.id = p_prima_nota_id;

  -- 3. Esecuzione dell'annullamento logico
  update public.prima_nota set
    stato = 'annullata',
    annullata_at = now(),
    annullata_by = p_utente_id,
    annullamento_motivo = p_motivo,
    updated_at = now()
  where id = p_prima_nota_id and societa_id = p_societa_id;

  -- 4. Acquisizione dello stato After
  select json_build_object(
    'header', row_to_json(pn),
    'righe', (select jsonb_agg(r) from public.prima_nota_righe r where r.prima_nota_id = p_prima_nota_id)
  ) into v_new_state
  from public.prima_nota pn where pn.id = p_prima_nota_id;

  -- 5. Persistenza nell'audit
  insert into public.audit_contabile (
    societa_id, entity_type, entity_id, operation_type, operation_reason, before_data, after_data, performed_by, source_module
  ) values (
    p_societa_id, 'prima_nota', p_prima_nota_id, 'ANNULLA', p_motivo, v_old_state, v_new_state, p_utente_id, 'registrazione_manual'
  );

  return jsonb_build_object(
    'success', true,
    'primaNotaId', p_prima_nota_id,
    'message', 'Scrittura contabile annullata logicamente con successo.'
  );
end;
$$;

grant execute on function public.rpc_annulla_prima_nota_logica(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.rpc_annulla_prima_nota_logica(uuid, uuid, text, uuid) to service_role;
