-- Migration patch to fix foreign key check order in consolidazione_stampa_definitiva
-- Timestamp: 20260621230000

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

  -- 2.1 Pre-creazione record consolidato per evitare violazione di foreign key immediata durante l'update delle righe
  insert into public.stampe_definitive (
    id, societa_id, tipo_stampa, famiglia_numerazione, anno_fiscale, periodo_inizio, periodo_fine,
    pagina_iniziale, pagina_finale, riga_iniziale, riga_finale,
    totale_dare, totale_avere, totale_imponibile, totale_iva, totale_complessivo,
    checksum, stato, creato_at, creato_by, motivo, metadata
  ) values (
    v_stampa_id, p_societa_id, p_tipo_stampa, v_famiglia, p_anno_fiscale, p_periodo_inizio, p_periodo_fine,
    v_next_page, v_next_page, -- placeholder temporaneo
    null, null,
    0, 0, 0, 0, 0,
    p_checksum, 'valida', now(), p_creato_by, p_motivo, p_metadata
  );

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

  -- 4. Aggiornamento record consolidato con i dati finali calcolati
  update public.stampe_definitive
  set pagina_finale = v_current_page,
      riga_iniziale = case when p_tipo_stampa = 'libro_giornale' then v_next_riga else null end,
      riga_finale = case when p_tipo_stampa = 'libro_giornale' then v_line_number - 1 else null end,
      totale_dare = v_totale_dare,
      totale_avere = v_totale_avere,
      totale_imponibile = v_totale_imponibile,
      totale_iva = v_totale_iva,
      totale_complessivo = v_totale_complessivo
  where id = v_stampa_id;

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

grant execute on function public.consolidazione_stampa_definitiva(uuid, text, integer, date, date, uuid, text, text, jsonb) to authenticated;
