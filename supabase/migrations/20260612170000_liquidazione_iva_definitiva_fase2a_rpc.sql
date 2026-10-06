-- Migration additiva per Liquidazione IVA Definitiva - Fase 2A (RPC e Patch Guards)
-- Timestamp: 20260612170000

-- =========================================================================
-- 1. PROCEDURA MEMORIZZATA PER IL CONSOLIDAMENTO TRANSAZIONALE
-- =========================================================================
CREATE OR REPLACE FUNCTION public.consolida_periodo_iva_transazionale(
  p_societa_id uuid,
  p_periodo_inizio date,
  p_periodo_fine date,
  p_tipo_periodicita text,
  p_operatore_studio_id uuid,
  p_motivo text default 'Consolidamento liquidazione IVA definitiva',
  p_payload_calcolo jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_liq_id uuid;
  v_rows_inserted integer := 0;
  v_anno integer;
  v_numero integer;
begin
  -- 0. Controllo di sicurezza sessione/tenant
  if auth.uid() is not null then
    if not coalesce(public.user_has_societa_access(p_societa_id), false) then
      raise exception 'Accesso negato: sessione non autorizzata per la società specificata.';
    end if;
  end if;

  -- Calcola anno e periodo_numero basati sulle date
  v_anno := extract(year from p_periodo_inizio)::int;
  if p_tipo_periodicita = 'mensile' then
    v_numero := extract(month from p_periodo_inizio)::int;
  else
    v_numero := ceil(extract(month from p_periodo_inizio)::numeric / 3)::int;
  end if;

  -- 1. Verifica se esiste già una liquidazione definitiva per questo periodo
  if exists (
    select 1 from public.liquidazione_iva
    where societa_id = p_societa_id
      and stato = 'definitiva'
      and (
        (periodo_tipo = p_tipo_periodicita and periodo_anno = v_anno and periodo_numero = v_numero)
        or
        (periodo_inizio <= p_periodo_fine and periodo_fine >= p_periodo_inizio)
      )
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Periodo già consolidato: esiste già una liquidazione IVA definitiva per questo periodo o parte di esso.'
    );
  end if;

  -- 2. Inserimento testata in public.liquidazione_iva
  -- Scrive sia le colonne legacy che le nuove colonne per compatibilità totale
  insert into public.liquidazione_iva (
    societa_id,
    periodicita,
    anno,
    mese,
    trimestre,
    periodo_inizio,
    periodo_fine,
    iva_debito,
    iva_credito,
    saldo,
    note,
    stato,
    periodo_tipo,
    periodo_anno,
    periodo_numero,
    iva_vendite_lorda,
    iva_split_esclusa,
    iva_debito_effettiva,
    iva_acquisti_detraibile,
    iva_acquisti_indetraibile,
    iva_reverse_debito,
    iva_reverse_credito,
    iva_per_cassa_differita,
    iva_per_cassa_rilasciata,
    credito_periodo_precedente,
    credito_anno_precedente,
    credito_compensato_f24,
    acconto_iva_versato,
    interessi_trimestrali,
    debito_periodo,
    debito_da_versare,
    credito_periodo,
    credito_da_riportare,
    definitiva_at,
    operatore_studio_id
  ) values (
    p_societa_id,
    p_tipo_periodicita,
    v_anno,
    case when p_tipo_periodicita = 'mensile' then v_numero else null end,
    case when p_tipo_periodicita = 'trimestrale' then v_numero else null end,
    p_periodo_inizio,
    p_periodo_fine,
    coalesce((p_payload_calcolo->>'ivaVenditeLorda')::numeric, (p_payload_calcolo->>'iva_debito')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaAcquistiDetraibile')::numeric, (p_payload_calcolo->>'iva_credito')::numeric, 0),
    coalesce((p_payload_calcolo->>'saldoPeriodo')::numeric, (p_payload_calcolo->>'saldo')::numeric, 0),
    p_motivo,
    'definitiva',
    p_tipo_periodicita,
    v_anno,
    v_numero,
    coalesce((p_payload_calcolo->>'ivaVenditeLorda')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaSplitEsclusa')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaDebitoEffettiva')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaAcquistiDetraibile')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaAcquistiIndetraibile')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaReverseDebito')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaReverseCredito')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaPerCassaDifferita')::numeric, 0),
    coalesce((p_payload_calcolo->>'ivaPerCassaRilasciata')::numeric, 0),
    coalesce((p_payload_calcolo->>'creditoPeriodoPrecedente')::numeric, 0),
    coalesce((p_payload_calcolo->>'creditoAnnoPrecedente')::numeric, 0),
    coalesce((p_payload_calcolo->>'creditoCompensatoF24')::numeric, 0),
    coalesce((p_payload_calcolo->>'accontoIvaVersato')::numeric, 0),
    coalesce((p_payload_calcolo->>'interessiTrimestrali')::numeric, 0),
    coalesce((p_payload_calcolo->>'debitoPeriodo')::numeric, 0),
    coalesce((p_payload_calcolo->>'debitoDaVersare')::numeric, 0),
    coalesce((p_payload_calcolo->>'creditoPeriodo')::numeric, 0),
    coalesce((p_payload_calcolo->>'creditoDaRiportare')::numeric, 0),
    now(),
    p_operatore_studio_id
  )
  returning id into v_liq_id;

  -- 3. Inserimento snapshot righe in public.liquidazioni_iva_righe
  if p_payload_calcolo ? 'righe' then
    insert into public.liquidazioni_iva_righe (
      liquidazione_id,
      societa_id,
      tipo,
      descrizione,
      registro,
      periodo,
      aliquota,
      natura,
      imponibile,
      imposta,
      iva_debito,
      iva_credito,
      data_documento,
      numero_documento,
      metadata,
      registro_iva_id,
      prima_nota_id,
      tipo_riga,
      registro_tipo,
      iva_indetraibile,
      split_payment,
      esigibilita,
      inclusa_in_liquidazione,
      motivo_esclusione,
      iva
    )
    select
      v_liq_id,
      p_societa_id,
      coalesce(r.tipo, 'non_iva'),
      coalesce(r.descrizione_riga, r.descrizione, ''),
      coalesce(r.registro_codice, r.registro, ''),
      p_tipo_periodicita || ' ' || v_anno::text,
      coalesce(r.aliquota, 0),
      r.natura,
      coalesce(r.imponibile, 0),
      coalesce(r.iva, 0),
      case when r.tipo = 'vendita' then coalesce(r.iva, 0) else 0 end,
      case when r.tipo = 'acquisto' then coalesce(r.iva_detraibile, r.iva, 0) else 0 end,
      r.data_documento,
      r.numero_documento,
      coalesce(r.metadata, '{}'::jsonb),
      coalesce(r.registro_iva_id, r.id),
      r.prima_nota_id,
      r.tipo_riga,
      r.registro_tipo,
      coalesce(r.iva_indetraibile, 0),
      coalesce(r.split_payment, false),
      r.esigibilita,
      coalesce(r.inclusa_in_liquidazione, true),
      r.motivo_esclusione,
      coalesce(r.iva, 0)
    from jsonb_to_recordset(p_payload_calcolo->'righe') as r(
      id uuid,
      tipo text,
      descrizione text,
      descrizione_riga text,
      registro text,
      registro_codice text,
      aliquota numeric,
      natura text,
      imponibile numeric,
      iva numeric,
      iva_detraibile numeric,
      iva_indetraibile numeric,
      data_documento date,
      numero_documento text,
      metadata jsonb,
      registro_iva_id uuid,
      prima_nota_id uuid,
      tipo_riga text,
      registro_tipo text,
      split_payment boolean,
      esigibilita text,
      inclusa_in_liquidazione boolean,
      motivo_esclusione text
    );
    
    get diagnostics v_rows_inserted = row_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'liquidazioneId', v_liq_id,
    'stato', 'definitiva',
    'periodoInizio', p_periodo_inizio,
    'periodoFine', p_periodo_fine,
    'righeSnapshot', v_rows_inserted,
    'message', 'Consolidamento della liquidazione IVA periodica completato con successo.'
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', SQLSTATE
    );
end;
$$;


-- =========================================================================
-- 2. PATCH DI SICUREZZA PER LE GUARDS DI PRIMA NOTA
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_prima_nota_operation_guards(
  p_prima_nota_id uuid,
  p_societa_id uuid,
  p_operation_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pn public.prima_nota%rowtype;
  v_allowed boolean := true;
  v_blocking_reasons jsonb := '[]'::jsonb;
  v_warning_level text := 'verde';
  v_warnings jsonb := '[]'::jsonb;
  v_required_permission text := null;
  v_requires_reason boolean := true;
  v_requires_recalculation boolean := false;
  v_impacted_outputs jsonb := '[]'::jsonb;
  v_required_followups jsonb := '[]'::jsonb;
  v_suggested_workflow text := 'procedi';
  v_can_force boolean := true;
  v_force_requires_role_or_permission text := null;

  -- Variabili di computazione e verifica integrità
  v_sum_dare numeric(15,2) := 0;
  v_sum_avere numeric(15,2) := 0;
  v_rows_count integer := 0;

  v_is_liquidated boolean := false;
  v_has_fiscal_outputs boolean := false;
  v_has_iva boolean := false;
  v_has_payments boolean := false;
  v_has_withholding boolean := false;
  v_has_fiscal_impact boolean := false;
  v_is_admin boolean := false;
  v_has_delegated_perm boolean := false;
begin
  -- 0. Controllo di sicurezza sessione/tenant (Società non autorizzata)
  if auth.uid() is not null then
    if not coalesce(public.user_has_societa_access(p_societa_id), false) then
      return jsonb_build_object(
        'allowed', false,
        'can_execute', false,
        'blocking_reasons', jsonb_build_array('Accesso negato: sessione non autorizzata per la società specificata.'),
        'warning_level', 'nero',
        'warnings', jsonb_build_array('Sessione non autorizzata o tenant non valido.'),
        'required_permission', 'accesso_societa',
        'requires_reason', false,
        'requires_recalculation', false,
        'impacted_outputs', '[]'::jsonb,
        'required_followups', '[]'::jsonb,
        'suggested_workflow', 'blocca',
        'can_force', false,
        'force_requires_role_or_permission', 'owner'
      );
    end if;
  end if;

  -- 1. Verifica esistenza record (Record corrotto / inesistente)
  select * into v_pn from public.prima_nota
  where id = p_prima_nota_id and societa_id = p_societa_id;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'can_execute', false,
      'blocking_reasons', jsonb_build_array('Registrazione contabile non trovata o non appartenente alla società selezionata.'),
      'warning_level', 'nero',
      'warnings', jsonb_build_array('Record inesistente o cancellato.'),
      'required_permission', null,
      'requires_reason', false,
      'requires_recalculation', false,
      'impacted_outputs', '[]'::jsonb,
      'required_followups', '[]'::jsonb,
      'suggested_workflow', 'blocca',
      'can_force', false,
      'force_requires_role_or_permission', null
    );
  end if;

  -- 2. Verifica quadratura Dare/Avere delle righe contabili e record corrotto
  select
    coalesce(sum(coalesce(r.importo_dare, 0)), 0),
    coalesce(sum(coalesce(r.importo_avere, 0)), 0),
    count(*)
  into v_sum_dare, v_sum_avere, v_rows_count
  from public.prima_nota_righe r
  where r.prima_nota_id = p_prima_nota_id;

  if v_rows_count = 0 then
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('La registrazione contabile è corrotta o non contiene alcuna riga contabile.');
    v_can_force := false;
  elsif v_sum_dare <> v_sum_avere then
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array(format('Squadratura Dare/Avere: il totale Dare (%s) non coincide con il totale Avere (%s).', v_sum_dare, v_sum_avere));
    v_can_force := false;
  elsif v_pn.totale_dare <> v_sum_dare or v_pn.totale_avere <> v_sum_avere then
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Record corrotto: il totale specificato in testata non coincide con la somma delle righe contabili.');
    v_can_force := false;
  end if;

  -- 3. Verifica Conto Inesistente
  if exists (
    select 1 from public.prima_nota_righe r
    where r.prima_nota_id = p_prima_nota_id
      and (r.conto_id is null or not exists (select 1 from public.piano_conti pc where pc.id = r.conto_id))
  ) then
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Conto inesistente: una o più righe contabili fanno riferimento a conti non esistenti nel piano dei conti.');
    v_can_force := false;
  end if;

  -- 4. Verifica Stato ed Incoerenze Tecniche (Operazione che lascia dati incoerenti)
  if v_pn.stato = 'annullata' then
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('La scrittura contabile è già in stato annullata e non può subire ulteriori modifiche o annullamenti.');
    v_can_force := false;
  end if;

  if v_pn.storno_of_id is not null and p_operation_type = 'STORNO' then
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Impossibile effettuare lo storno di una scrittura che è già essa stessa una scrittura di storno.');
    v_can_force := false;
  end if;

  -- 5. Verifica Cancellazione Fisica di Scrittura Registrata
  if p_operation_type = 'DELETE_FISICA' then
    if v_pn.stato <> 'bozza' and v_pn.stato <> 'provvisoria' then
      v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Operazione contraria a regole contabili: la cancellazione fisica è inibita per scritture già registrate. Utilizzare l''annullamento logico o lo storno.');
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
    v_warnings := v_warnings || jsonb_build_array('Esercizio contabile chiuso o stampato in definitivo. La modifica richiede privilegi amministrativi.');
    v_impacted_outputs := v_impacted_outputs || jsonb_build_array('registri_definitivi', 'bilancio_esercizio');
    v_required_followups := v_required_followups || jsonb_build_array('Sarà necessario riaprire l''esercizio, richiudere e ristampare i registri definitivi in caso di forzatura.');
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
      v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Utente senza permesso richiesto: l''esercizio è chiuso e l''utente non possiede il permesso "modifica_esercizio_chiuso" o il ruolo di Amministratore/Owner.');
    end if;
  end if;

  -- 8. Controllo Impatti Fiscali e Warning Giallo / Rosso / Blocco
  select exists (select 1 from public.registri_iva where prima_nota_id = p_prima_nota_id) into v_has_iva;
  select exists (select 1 from public.partitario where prima_nota_id = p_prima_nota_id or chiusa_da_prima_nota_id = p_prima_nota_id) into v_has_payments;
  select exists (select 1 from public.ritenute_dacconto where note like '%' || p_prima_nota_id::text || '%') into v_has_withholding;

  v_has_fiscal_impact := v_has_iva or v_has_payments or v_has_withholding;

  if v_has_fiscal_impact then
    -- Verifica consolidamento fiscale (solo se stato è 'definitiva'!)
    select exists (
      SELECT 1 FROM public.liquidazione_iva
      WHERE societa_id = p_societa_id
        AND stato = 'definitiva'
        AND periodo_inizio <= v_pn.data_registrazione
        AND periodo_fine >= v_pn.data_registrazione
    ) into v_is_liquidated;

    select exists (
      select 1 from public.fiscal_outputs
      where periodo_inizio <= v_pn.data_registrazione
        and periodo_fine >= v_pn.data_registrazione
        and tipo in ('LIPE', 'F24_IVA', 'CU', 'DICHIARAZIONE_770')
    ) into v_has_fiscal_outputs;

    -- Caso A: Adempimenti già elaborati o inviati (Warning level: rosso)
    if v_has_fiscal_outputs or v_is_liquidated then
      if v_warning_level <> 'nero' then
        v_warning_level := 'rosso';
      end if;
      
      if v_has_fiscal_outputs then
        v_warnings := v_warnings || jsonb_build_array('Adempimenti fiscali (LIPE/F24/CU/770) già elaborati o inviati per questo periodo. Procedere potrebbe comportare sanzioni.');
        v_impacted_outputs := v_impacted_outputs || jsonb_build_array('LIPE', 'F24_IVA', 'CU', 'DICHIARAZIONE_770');
        v_required_followups := v_required_followups || jsonb_build_array('Ricalcolo Liquidazione IVA', 'Riemissione LIPE correttiva / ravvedimento operoso', 'Rigenerazione file telematico F24/CU/770');
      else
        v_warnings := v_warnings || jsonb_build_array('Il periodo IVA relativo a questa registrazione è già stato consolidato con liquidazione definitiva.');
        v_impacted_outputs := v_impacted_outputs || jsonb_build_array('liquidazione_iva');
        v_required_followups := v_required_followups || jsonb_build_array('Ricalcolo della liquidazione IVA e snapshot righe previa riapertura del periodo');
      end if;

      v_requires_recalculation := true;
      if v_required_permission is null then
        v_required_permission := 'modifica_periodo_liquidato';
        v_force_requires_role_or_permission := 'admin';
      end if;
      v_suggested_workflow := 'storno';

      if auth.uid() is not null then
        select coalesce((us.permessi -> 'contabilita' ->> 'modifica_periodo_liquidato')::boolean, false) into v_has_delegated_perm
        from public.utenti_studio us where us.auth_user_id = auth.uid() and us.attivo = true;
      else
        v_has_delegated_perm := true;
      end if;

      if not v_is_admin and not v_has_delegated_perm then
        v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Utente senza permesso richiesto: il periodo ha già una liquidazione definitiva o adempimenti consolidati. Richiesto il permesso "modifica_periodo_liquidato" o ruolo Amministratore/Owner.');
      end if;

    -- Caso B: Operazione IVA ordinaria non consolidata (Warning level: giallo)
    else
      if v_warning_level = 'verde' then
        v_warning_level := 'giallo';
      end if;
      v_warnings := v_warnings || jsonb_build_array('Operazione con impatto IVA. La modifica comporta la necessità di ricalcolare i registri IVA e la liquidazione provvisoria.');
      v_requires_recalculation := true;
      v_impacted_outputs := v_impacted_outputs || jsonb_build_array('registri_iva');
      v_required_followups := v_required_followups || jsonb_build_array('Verifica e ricalcolo registri IVA per il periodo coinvolto');
      v_suggested_workflow := 'procedi_con_ricalcolo';
    end if;

    -- C. Controlli separati per pagamenti/partitario
    if v_has_payments then
      if v_warning_level in ('verde', 'giallo') then
        v_warning_level := 'rosso';
      end if;
      v_warnings := v_warnings || jsonb_build_array('Scrittura associata a scadenze o movimenti di pagamento nel partitario. La modifica disallineerà lo stato delle partite aperte.');
      v_impacted_outputs := v_impacted_outputs || jsonb_build_array('partitario');
      v_required_followups := v_required_followups || jsonb_build_array('Riallineamento e verifica manuale dello stato delle scadenze e dei pagamenti del partitario');
      if v_required_permission is null then
        v_required_permission := 'modifica_scritture_pagamenti';
        v_force_requires_role_or_permission := 'admin';
      end if;
      v_suggested_workflow := 'storno';

      if auth.uid() is not null then
        select coalesce((us.permessi -> 'contabilita' ->> 'modifica_scritture_pagamenti')::boolean, false) into v_has_delegated_perm
        from public.utenti_studio us where us.auth_user_id = auth.uid() and us.attivo = true;
      else
        v_has_delegated_perm := true;
      end if;

      if not v_is_admin and not v_has_delegated_perm then
        v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Utente senza permesso richiesto: esistono pagamenti registrati nel partitario. Richiesto il permesso "modifica_scritture_pagamenti" o ruolo Amministratore/Owner.');
      end if;
    end if;

    -- D. Controlli separati per ritenute d'acconto
    if v_has_withholding then
      if v_warning_level in ('verde', 'giallo') then
        v_warning_level := 'rosso';
      end if;
      v_warnings := v_warnings || jsonb_build_array('Scrittura legata a ritenute d''acconto gestite o certificate. Una modifica lascerà sbilanciati i dati del percipiente e della certificazione unica (CU/770).');
      v_impacted_outputs := v_impacted_outputs || jsonb_build_array('ritenute_dacconto');
      v_required_followups := v_required_followups || jsonb_build_array('Verifica e riallineamento manuale delle ritenute certificate e della certificazione unica (CU)');
      if v_required_permission is null then
        v_required_permission := 'modifica_scritture_ritenute';
        v_force_requires_role_or_permission := 'admin';
      end if;
      v_suggested_workflow := 'storno';

      if auth.uid() is not null then
        select coalesce((us.permessi -> 'contabilita' ->> 'modifica_scritture_ritenute')::boolean, false) into v_has_delegated_perm
        from public.utenti_studio us where us.auth_user_id = auth.uid() and us.attivo = true;
      else
        v_has_delegated_perm := true;
      end if;

      if not v_is_admin and not v_has_delegated_perm then
        v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Utente senza permesso richiesto: esistono ritenute d''acconto registrate. Richiesto il permesso "modifica_scritture_ritenute" o ruolo Amministratore/Owner.');
      end if;
    end if;

  else
    -- Flusso PN semplice o pagamento normale senza impatto IVA, ritenute o partitario
    if v_warning_level = 'verde' then
      v_warnings := v_warnings || jsonb_build_array('Scrittura ordinaria senza impatti IVA, ritenute o partitari contabili. Modificabile previa giustificazione.');
      v_suggested_workflow := 'procedi';
    end if;
  end if;

  -- 10. Computo finale del verdetto
  if jsonb_array_length(v_blocking_reasons) > 0 then
    v_allowed := false;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'can_execute', v_allowed,
    'blocking_reasons', v_blocking_reasons,
    'warning_level', v_warning_level,
    'warnings', v_warnings,
    'required_permission', v_required_permission,
    'requires_reason', v_requires_reason,
    'requires_recalculation', v_requires_recalculation,
    'impacted_outputs', v_impacted_outputs,
    'required_followups', v_required_followups,
    'suggested_workflow', v_suggested_workflow,
    'can_force', v_can_force,
    'force_requires_role_or_permission', v_force_requires_role_or_permission
  );
end;
$$;

-- Concessione dei diritti di esecuzione
GRANT EXECUTE ON FUNCTION public.consolida_periodo_iva_transazionale(uuid, date, date, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consolida_periodo_iva_transazionale(uuid, date, date, text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_prima_nota_operation_guards(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_prima_nota_operation_guards(uuid, uuid, text) TO service_role;
