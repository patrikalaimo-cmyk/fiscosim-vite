-- Migration: 20260529120000_fase_3c_patch_storno_states.sql
-- Descrizione: Aggiorna le stored procedure contabili per supportare gli stati 'stornata' e 'storno' per le operazioni di storno contabile.

-- 1. Aggiornamento delle guardie di sicurezza per verificare tutti gli stati di neutralizzazione
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

  if v_pn.storno_of_id is not null and p_operation_type = 'STORNO' then
    v_blocking_reasons := v_blocking_reasons || array['Impossibile effettuare lo storno di una scrittura che è già essa stessa una scrittura di storno.'];
    v_can_force := false;
  end if;

  -- 5. Verifica Cancellazione Fisica di Scrittura Registrata
  if p_operation_type = 'DELETE_FISICA' then
    if v_pn.stato <> 'bozza' and v_pn.stato <> 'provvisoria' then
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
    v_periodo_iva := date_trunc('month', v_pn.data_registrazione)::date;
    
    if exists (
      select 1 from public.liquidazione_iva liq
      where liq.societa_id = p_societa_id
        and liq.periodo = v_periodo_iva
        and liq.stato in ('elaborata', 'definitiva', 'chiusa')
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

-- 2. Aggiornamento dello storno contabile per applicare lo stato 'stornata' e 'storno'
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

  -- 6. Inversione e creazione righe di storno Dare <-> Avere
  for v_riga in select * from jsonb_to_recordset(v_orig_righe) as (
    riga_numero int, conto_id uuid, conto_codice varchar,
    conto_descrizione varchar, descrizione_riga text,
    importo_dare numeric, importo_avere numeric,
    causale_iva_codice varchar, imponibile numeric, iva numeric
  ) loop
    insert into public.prima_nota_righe (
      prima_nota_id, societa_id, riga_numero, conto_id, conto_codice,
      conto_descrizione, descrizione_riga, importo_dare, importo_avere,
      causale_iva_codice, imponibile, iva
    ) values (
      v_storno_id, p_societa_id, v_riga.riga_numero, v_riga.conto_id, v_riga.conto_codice,
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
