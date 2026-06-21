-- Migration patch per procedure di Stampa Definitiva e Blocco Periodo - Fase 13D-B2 Patch
-- Timestamp: 20260621003000
-- Questa migration NON viene applicata automaticamente al database remoto (PROPOSTA).

-- Aggiunta colonna famiglia_numerazione in modo additivo/idempotente
alter table public.stampe_definitive add column if not exists famiglia_numerazione text;

-- Check constraint per famiglia_numerazione
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'check_famiglia_numerazione'
  ) then
    alter table public.stampe_definitive 
      add constraint check_famiglia_numerazione 
      check (famiglia_numerazione in ('iva_acquisti', 'iva_vendite_corrispettivi_liquidazione', 'libro_giornale'));
  end if;
end $$;

-- Estensione check constraint per tipo_stampa per includere liquidazione_iva_periodica
alter table public.stampe_definitive drop constraint if exists check_tipo_stampa;
alter table public.stampe_definitive 
  add constraint check_tipo_stampa 
  check (tipo_stampa in ('libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica'));

-- =========================================================================
-- 1. FUNZIONE DI PRECHECK STAMPA DEFINITIVA
-- =========================================================================
create or replace function public.precheck_stampa_definitiva(
  p_societa_id uuid,
  p_tipo_stampa text,
  p_anno_fiscale integer,
  p_periodo_inizio date,
  p_periodo_fine date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocking_reasons text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_has_overlap boolean;
  v_has_squadrati boolean;
  v_rows_count bigint := 0;
  v_simulated_count bigint := 0;
  
  -- Periodicità
  v_tipo_liq text;
  v_month int;
  
  -- Liquidazione
  v_liq_exists boolean;
begin
  -- 1. Validazione parametri essenziali
  if p_societa_id is null then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Società non specificata.');
  end if;
  if p_tipo_stampa is null or p_tipo_stampa not in ('libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica') then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Tipo stampa non ammesso o non supportato.');
  end if;
  if p_periodo_inizio is null or p_periodo_fine is null or p_periodo_inizio > p_periodo_fine then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Periodo non valido o incoerente.');
  end if;
  if p_anno_fiscale is null or p_anno_fiscale <= 0 then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Esercizio (anno fiscale) non valido.');
  end if;
  if p_periodo_inizio is not null and p_periodo_fine is not null and p_anno_fiscale is not null then
    if extract(year from p_periodo_inizio) != p_anno_fiscale or extract(year from p_periodo_fine) != p_anno_fiscale then
      v_blocking_reasons := array_append(v_blocking_reasons, 'L''anno delle date del periodo deve corrispondere all''anno fiscale specificato.');
    end if;
  end if;

  if array_length(v_blocking_reasons, 1) > 0 then
    return jsonb_build_object('success', false, 'blocking_reasons', v_blocking_reasons, 'warnings', v_warnings, 'rows_count', 0);
  end if;

  -- 2. Controllo periodicità IVA societaria
  if p_tipo_stampa in ('registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica') then
    select tipo_liquidazione_iva into v_tipo_liq
    from public.societa
    where id = p_societa_id;

    v_tipo_liq := lower(trim(v_tipo_liq));

    if v_tipo_liq is null then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Periodicità IVA della società non configurata o non rilevabile.');
    elsif v_tipo_liq = 'mensile' then
      -- Deve essere esattamente un mese
      v_month := extract(month from p_periodo_inizio);
      if p_periodo_inizio != (date_trunc('month', p_periodo_inizio))::date or 
         p_periodo_fine != (date_trunc('month', p_periodo_inizio) + interval '1 month' - interval '1 day')::date then
        v_blocking_reasons := array_append(v_blocking_reasons, 'Il periodo selezionato deve corrispondere esattamente a un mese intero per società mensili.');
      end if;
    elsif v_tipo_liq = 'trimestrale' then
      -- Deve essere esattamente un trimestre
      v_month := extract(month from p_periodo_inizio);
      if v_month not in (1, 4, 7, 10) or 
         p_periodo_inizio != (date_trunc('quarter', p_periodo_inizio))::date or
         p_periodo_fine != (date_trunc('quarter', p_periodo_inizio) + interval '3 month' - interval '1 day')::date then
        v_blocking_reasons := array_append(v_blocking_reasons, 'Il periodo selezionato deve corrispondere esattamente a un trimestre intero per società trimestrali.');
      end if;
    else
      v_blocking_reasons := array_append(v_blocking_reasons, 'Periodicità IVA societaria non riconosciuta.');
    end if;
  end if;

  -- 3. Controllo bimestralità Libro Giornale
  if p_tipo_stampa = 'libro_giornale' then
    v_month := extract(month from p_periodo_inizio);
    if v_month not in (1, 3, 5, 7, 9, 11) or 
       p_periodo_inizio != (date_trunc('year', p_periodo_inizio) + ((v_month - 1) || ' month')::interval)::date or
       p_periodo_fine != (date_trunc('year', p_periodo_inizio) + ((v_month + 1) || ' month')::interval - interval '1 day')::date then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Il periodo selezionato deve corrispondere esattamente ad uno dei bimestri standard per il Libro Giornale.');
    end if;
  end if;

  -- 4. Blocco Corrispettivi (mancanza colonna in registri_iva per discriminarlo)
  if p_tipo_stampa = 'registro_iva_corrispettivi' then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Registro corrispettivi non consolidabile: manca un criterio dati reale per distinguerlo dal registro vendite.');
  end if;

  -- 5. Controllo Liquidazione IVA periodica
  if p_tipo_stampa = 'liquidazione_iva_periodica' then
    select exists (
      select 1 
      from public.liquidazione_iva
      where societa_id = p_societa_id
        and periodo_inizio = p_periodo_inizio
        and periodo_fine = p_periodo_fine
    ) into v_liq_exists;

    if not v_liq_exists then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Liquidazione periodica non trovata o non calcolata per il periodo specificato.');
    end if;
  end if;

  if array_length(v_blocking_reasons, 1) > 0 then
    return jsonb_build_object('success', false, 'blocking_reasons', v_blocking_reasons, 'warnings', v_warnings, 'rows_count', 0);
  end if;

  -- 6. Verifica sovrapposizioni con stampe definitive già consolidate e attive
  select exists (
    select 1 
    from public.stampe_definitive
    where societa_id = p_societa_id
      and tipo_stampa = p_tipo_stampa
      and stato = 'valida'
      and (
        (periodo_inizio <= p_periodo_fine and periodo_fine >= p_periodo_inizio)
      )
  ) into v_has_overlap;

  if v_has_overlap then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Esiste già una stampa definitiva attiva che si sovrappone con il periodo selezionato.');
  end if;

  -- 7. Verifica quadratura contabile nel periodo (solo per Libro Giornale)
  if p_tipo_stampa = 'libro_giornale' then
    -- Controllo quadratura
    select exists (
      select 1 
      from public.prima_nota
      where societa_id = p_societa_id
        and data_registrazione >= p_periodo_inizio
        and data_registrazione <= p_periodo_fine
        and stato != 'simulata'
        and totale_dare != totale_avere
    ) into v_has_squadrati;

    if v_has_squadrati then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Sono presenti scritture non bilanciate (squadrate) nel periodo.');
    end if;

    -- Conta testate valide
    select count(*)
    from public.prima_nota
    where societa_id = p_societa_id
      and data_registrazione >= p_periodo_inizio
      and data_registrazione <= p_periodo_fine
      and stato != 'simulata'
    into v_rows_count;

    -- Verifica se ci sono righe già stampate
    select exists (
      select 1 from public.prima_nota
      where societa_id = p_societa_id
        and data_registrazione >= p_periodo_inizio
        and data_registrazione <= p_periodo_fine
        and stato != 'simulata'
        and stampa_giornale_id is not null
    ) into v_has_overlap;
    if v_has_overlap then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Alcune scritture di prima nota nel periodo sono già state incluse in una stampa definitiva.');
    end if;

    -- Conta testate simulate
    select count(*)
    from public.prima_nota
    where societa_id = p_societa_id
      and data_registrazione >= p_periodo_inizio
      and data_registrazione <= p_periodo_fine
      and stato = 'simulata'
    into v_simulated_count;

  elsif p_tipo_stampa in ('registro_iva_acquisti', 'registro_iva_vendite') then
    select count(*)
    from public.registri_iva r
    left join public.prima_nota p on r.prima_nota_id = p.id
    where r.societa_id = p_societa_id
      and r.data >= p_periodo_inizio
      and r.data <= p_periodo_fine
      and (p.id is null or p.stato != 'simulata')
      and (
        (p_tipo_stampa = 'registro_iva_acquisti' and r.tipo = 'acquisto') or
        (p_tipo_stampa = 'registro_iva_vendite' and r.tipo = 'vendita')
      )
    into v_rows_count;

    -- Verifica se ci sono righe già stampate
    select exists (
      select 1 from public.registri_iva r
      left join public.prima_nota p on r.prima_nota_id = p.id
      where r.societa_id = p_societa_id
        and r.data >= p_periodo_inizio
        and r.data <= p_periodo_fine
        and (p.id is null or p.stato != 'simulata')
        and (
          (p_tipo_stampa = 'registro_iva_acquisti' and r.tipo = 'acquisto') or
          (p_tipo_stampa = 'registro_iva_vendite' and r.tipo = 'vendita')
        )
        and r.stampa_iva_id is not null
    ) into v_has_overlap;
    if v_has_overlap then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Alcune righe IVA nel periodo sono già state incluse in una stampa definitiva.');
    end if;

    -- Conta simulate
    select count(*)
    from public.registri_iva r
    join public.prima_nota p on r.prima_nota_id = p.id
    where r.societa_id = p_societa_id
      and r.data >= p_periodo_inizio
      and r.data <= p_periodo_fine
      and (
        (p_tipo_stampa = 'registro_iva_acquisti' and r.tipo = 'acquisto') or
        (p_tipo_stampa = 'registro_iva_vendite' and r.tipo = 'vendita')
      )
      and p.stato = 'simulata'
    into v_simulated_count;

  elsif p_tipo_stampa = 'liquidazione_iva_periodica' then
    v_rows_count := 1; -- un solo record di liquidazione
  end if;

  if v_rows_count = 0 then
    v_blocking_reasons := array_append(v_blocking_reasons, 'Non ci sono righe contabili da stampare nel periodo selezionato.');
  end if;

  if v_simulated_count > 0 then
    v_warnings := array_append(v_warnings, 'Sono presenti scritture in stato simulata nel periodo che non verranno incluse nel consolidamento.');
  end if;

  return jsonb_build_object(
    'success', array_length(v_blocking_reasons, 1) is null,
    'blocking_reasons', v_blocking_reasons,
    'warnings', v_warnings,
    'rows_count', v_rows_count
  );
end;
$$;


-- =========================================================================
-- 2. PROCEDURA DI CONSOLIDAZIONE STAMPA DEFINITIVA
-- =========================================================================
create or replace function public.consolidazione_stampa_definitiva(
  p_societa_id uuid,
  p_tipo_stampa text,
  p_anno_fiscale integer,
  p_periodo_inizio date,
  p_periodo_fine date,
  p_creato_by uuid,
  p_checksum text,
  p_motivo text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Lock concorrenza
  v_lock_key bigint;
  
  v_precheck jsonb;
  v_success boolean;
  v_blocking_reasons text[];
  v_rows_count bigint;
  v_stampa_id uuid;
  v_famiglia text;
  
  -- Progressivi
  v_next_page int := 1;
  v_next_riga bigint := 1;
  v_last_pagina_finale int;
  v_last_riga_finale bigint;
  v_protocol_seq int := 0;
  
  v_totale_dare numeric(15, 2) := 0;
  v_totale_avere numeric(15, 2) := 0;
  v_totale_imponibile numeric(15, 2) := 0;
  v_totale_iva numeric(15, 2) := 0;
  v_totale_complessivo numeric(15, 2) := 0;
  
  v_pn_row record;
  v_iva_row record;
  
  v_current_page int;
  v_riga_count bigint := 0;
  v_line_number bigint;
  v_row_count_temp int := 0;
begin
  -- Controllo sicurezza parametri immessi
  if p_societa_id is null then
    raise exception 'Società non specificata.';
  end if;
  if p_tipo_stampa is null or p_tipo_stampa not in ('libro_giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica') then
    raise exception 'Tipo stampa non ammesso o non supportato.';
  end if;
  if p_anno_fiscale is null or p_anno_fiscale <= 0 then
    raise exception 'Esercizio (anno fiscale) non valido.';
  end if;
  if p_periodo_inizio is null or p_periodo_fine is null then
    raise exception 'Periodo non valido o incompleto.';
  end if;
  if p_periodo_inizio > p_periodo_fine then
    raise exception 'Periodo incoerente (data inizio successiva a data fine).';
  end if;
  if p_creato_by is null then
    raise exception 'Operatore creato_by obbligatorio.';
  end if;
  if p_checksum is null or trim(p_checksum) = '' then
    raise exception 'Firma checksum obbligatoria.';
  end if;

  -- 0. Acquisizione lock advisory per garantire la serializzazione dell'operazione
  v_lock_key := ('x' || substring(md5(p_societa_id::text || p_tipo_stampa) from 1 for 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- 1. Esegui precheck di coerenza
  v_precheck := public.precheck_stampa_definitiva(p_societa_id, p_tipo_stampa, p_anno_fiscale, p_periodo_inizio, p_periodo_fine);
  v_success := (v_precheck->>'success')::boolean;
  v_blocking_reasons := array(select jsonb_array_elements_text(v_precheck->'blocking_reasons'));
  v_rows_count := (v_precheck->>'rows_count')::bigint;
  
  if not v_success then
    raise exception 'Precheck fallito per consolidamento: %', array_to_string(v_blocking_reasons, '; ');
  end if;

  -- Mappatura famiglia_numerazione
  if p_tipo_stampa = 'libro_giornale' then
    v_famiglia := 'libro_giornale';
  elsif p_tipo_stampa = 'registro_iva_acquisti' then
    v_famiglia := 'iva_acquisti';
  elsif p_tipo_stampa in ('registro_iva_vendite', 'registro_iva_corrispettivi', 'liquidazione_iva_periodica') then
    v_famiglia := 'iva_vendite_corrispettivi_liquidazione';
  end if;
  
  -- 2. Recupero progressivi storici della famiglia dell'esercizio
  select pagina_finale, riga_finale
  from public.stampe_definitive
  where societa_id = p_societa_id
    and famiglia_numerazione = v_famiglia
    and anno_fiscale = p_anno_fiscale
    and stato = 'valida'
  order by periodo_fine desc, creato_at desc
  limit 1
  into v_last_pagina_finale, v_last_riga_finale;
  
  if v_last_pagina_finale is not null then
    v_next_page := v_last_pagina_finale + 1;
  end if;
  if v_last_riga_finale is not null then
    v_next_riga := v_last_riga_finale + 1;
  end if;

  v_stampa_id := gen_random_uuid();
  v_current_page := v_next_page;
  v_line_number := v_next_riga;

  -- 3. Consolidamento ed aggiornamento record
  if p_tipo_stampa = 'libro_giornale' then
    for v_pn_row in (
      select p.id, p.totale_dare, p.totale_avere
      from public.prima_nota p
      where p.societa_id = p_societa_id
        and p.data_registrazione >= p_periodo_inizio
        and p.data_registrazione <= p_periodo_fine
        and p.stato != 'simulata'
      order by p.data_registrazione asc, p.numero_registrazione asc, p.id asc
    ) loop
      v_totale_dare := v_totale_dare + coalesce(v_pn_row.totale_dare, 0);
      v_totale_avere := v_totale_avere + coalesce(v_pn_row.totale_avere, 0);
      
      select count(*)
      from public.prima_nota_righe
      where prima_nota_id = v_pn_row.id
      into v_row_count_temp;
      
      update public.prima_nota
      set stampa_giornale_id = v_stampa_id,
          giornale_pagina = v_current_page,
          giornale_riga_progressivo = v_line_number,
          periodo_chiuso_lock = true
      where id = v_pn_row.id;
      
      v_line_number := v_line_number + v_row_count_temp;
      v_riga_count := v_riga_count + v_row_count_temp;
      v_current_page := v_next_page + ((greatest(v_riga_count, 1) - 1) / 30)::int; -- Paginazione virtuale a 30 righe
    end loop;
    
    v_totale_complessivo := v_totale_dare;

  elsif p_tipo_stampa in ('registro_iva_acquisti', 'registro_iva_vendite') then
    -- Safe protocol sequence calculation: extract max number from existing registered protocols of same family & fiscal year
    select coalesce(max(coalesce(nullif(regexp_replace(split_part(r.registro_protocollo_definitivo, '/', 3), '[^0-9]', '', 'g'), ''), '0')::int), 0)
    into v_protocol_seq
    from public.registri_iva r
    join public.stampe_definitive s on r.stampa_iva_id = s.id
    where r.societa_id = p_societa_id
      and s.anno_fiscale = p_anno_fiscale
      and s.stato = 'valida'
      and s.famiglia_numerazione = v_famiglia
      and r.registro_protocollo_definitivo is not null;

    for v_iva_row in (
      select r.id, r.imponibile, r.iva, r.prima_nota_id, r.data
      from public.registri_iva r
      left join public.prima_nota p on r.prima_nota_id = p.id
      where r.societa_id = p_societa_id
        and r.data >= p_periodo_inizio
        and r.data <= p_periodo_fine
        and (p.id is null or p.stato != 'simulata')
        and (
          (p_tipo_stampa = 'registro_iva_acquisti' and r.tipo = 'acquisto') or
          (p_tipo_stampa = 'registro_iva_vendite' and r.tipo = 'vendita')
        )
      order by r.data asc, r.numero_documento asc, r.id asc
    ) loop
      v_totale_imponibile := v_totale_imponibile + coalesce(v_iva_row.imponibile, 0);
      v_totale_iva := v_totale_iva + coalesce(v_iva_row.iva, 0);
      v_protocol_seq := v_protocol_seq + 1;
      
      update public.registri_iva
      set stampa_iva_id = v_stampa_id,
          registro_pagina = v_current_page,
          registro_protocollo_definitivo = p_anno_fiscale || '/' || upper(substring(p_tipo_stampa from 14)) || '/' || lpad(v_protocol_seq::text, 6, '0')
      where id = v_iva_row.id;
      
      if v_iva_row.prima_nota_id is not null then
        update public.prima_nota
        set periodo_chiuso_lock = true
        where id = v_iva_row.prima_nota_id;
      end if;
      
      v_riga_count := v_riga_count + 1;
      v_current_page := v_next_page + ((greatest(v_riga_count, 1) - 1) / 20)::int; -- Paginazione virtuale a 20 righe
    end loop;
    
    v_totale_complessivo := v_totale_imponibile + v_totale_iva;

  elsif p_tipo_stampa = 'liquidazione_iva_periodica' then
    v_riga_count := 1;
    v_current_page := v_next_page;
    
    select coalesce(sum(iva_debito), 0), coalesce(sum(iva_credito), 0), coalesce(sum(saldo), 0)
    into v_totale_dare, v_totale_avere, v_totale_complessivo
    from public.liquidazione_iva
    where societa_id = p_societa_id
      and periodo_inizio = p_periodo_inizio
      and periodo_fine = p_periodo_fine;
  end if;

  if v_riga_count = 0 then
    v_current_page := v_next_page;
  end if;

  -- 4. Creazione record consolidato
  insert into public.stampe_definitive (
    id, societa_id, tipo_stampa, famiglia_numerazione, anno_fiscale, periodo_inizio, periodo_fine,
    pagina_iniziale, pagina_finale, riga_iniziale, riga_finale,
    totale_dare, totale_avere, totale_imponibile, totale_iva, totale_complessivo,
    checksum, stato, creato_at, creato_by, motivo, metadata
  ) values (
    v_stampa_id, p_societa_id, p_tipo_stampa, v_famiglia, p_anno_fiscale, p_periodo_inizio, p_periodo_fine,
    v_next_page, v_current_page,
    case when p_tipo_stampa = 'libro_giornale' then v_next_riga else null end,
    case when p_tipo_stampa = 'libro_giornale' then v_line_number - 1 else null end,
    v_totale_dare, v_totale_avere, v_totale_imponibile, v_totale_iva, v_totale_complessivo,
    p_checksum, 'valida', now(), p_creato_by, p_motivo, p_metadata
  );

  -- 5. Registrazione in audit_contabile
  insert into public.audit_contabile (
    societa_id, entity_type, entity_id, operation_type, operation_reason,
    before_data, after_data, performed_by, performed_at, source_module
  ) values (
    p_societa_id, 'stampe_definitive', v_stampa_id, 'CONSOLIDA_STAMPA',
    coalesce(p_motivo, 'Consolidamento stampa definitiva ' || p_tipo_stampa),
    null,
    jsonb_build_object(
      'tipo_stampa', p_tipo_stampa,
      'famiglia_numerazione', v_famiglia,
      'anno_fiscale', p_anno_fiscale,
      'periodo_inizio', p_periodo_inizio,
      'periodo_fine', p_periodo_fine,
      'pagina_iniziale', v_next_page,
      'pagina_finale', v_current_page,
      'totale_complessivo', v_totale_complessivo
    ),
    p_creato_by, now(), 'stampe'
  );

  return jsonb_build_object(
    'success', true,
    'stampa_id', v_stampa_id,
    'pagina_iniziale', v_next_page,
    'pagina_finale', v_current_page,
    'righe_elaborate', v_riga_count
  );
end;
$$;

-- Abilitazione permessi esecuzione
grant execute on function public.precheck_stampa_definitiva(uuid, text, integer, date, date) to authenticated;
grant execute on function public.consolidazione_stampa_definitiva(uuid, text, integer, date, date, uuid, text, text, jsonb) to authenticated;
