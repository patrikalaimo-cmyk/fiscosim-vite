-- Migration incrementale per correggere lo schema-alignment di Liquidazione IVA
-- Timestamp: 20260615110000

CREATE OR REPLACE FUNCTION public.consolida_periodo_iva_transazionale(
  p_societa_id uuid,
  p_periodo_inizio date,
  p_periodo_fine date,
  p_tipo_periodicita text,
  p_operatore_studio_id uuid,
  p_motivo text default 'Consolidamento liquidazione IVA periodica',
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
  v_operatore_nome text;
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

  -- Ottieni il nome dell'operatore studio per inserirlo nel campo note
  select coalesce(nome || ' ' || cognome, 'Operatore Studio')
  into v_operatore_nome
  from public.utenti_studio
  where id = p_operatore_studio_id;

  if v_operatore_nome is null then
    v_operatore_nome := 'Operatore Studio';
  end if;

  -- 1. Verifica se esiste già una liquidazione definitiva per questo periodo in note
  if exists (
    select 1 from public.liquidazione_iva
    where societa_id = p_societa_id
      and note like '%[stato:definitiva]%'
      and (
        (periodicita = p_tipo_periodicita and anno = v_anno and (
          (p_tipo_periodicita = 'mensile' and mese = v_numero) or
          (p_tipo_periodicita = 'trimestrale' and trimestre = v_numero)
        ))
        or
        (periodo_inizio <= p_periodo_fine and periodo_fine >= p_periodo_inizio)
      )
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Periodo bloccato: la liquidazione per questo periodo è definitiva e non può essere riconsolidata.'
    );
  end if;

  -- 1.1 Rimuove eventuale consolidamento precedente (non definitivo) per lo stesso periodo
  delete from public.liquidazione_iva
  where societa_id = p_societa_id
    and (note is null or note not like '%[stato:definitiva]%')
    and periodicita = p_tipo_periodicita
    and anno = v_anno
    and (
      (p_tipo_periodicita = 'mensile' and mese = v_numero) or
      (p_tipo_periodicita = 'trimestrale' and trimestre = v_numero)
    );

  -- 2. Inserimento testata in public.liquidazione_iva
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
    note
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
    coalesce(p_motivo, 'Consolidamento liquidazione IVA periodica') || ' | [stato:provvisoria] | Operatore: ' || v_operatore_nome
  )
  returning id into v_liq_id;

  -- 3. Inserimento snapshot righe in public.liquidazioni_iva_righe - SOSPESO PER INCOMPATIBILITÀ FK LEGACY
  -- (La FK liquidazioni_iva_righe_liquidazione_id_fkey referenzia la tabella liquidazioni_iva plurale, mentre usiamo liquidazione_iva singolare)
  v_rows_inserted := 0;

  return jsonb_build_object(
    'success', true,
    'liquidazioneId', v_liq_id,
    'stato', 'provvisoria',
    'periodoInizio', p_periodo_inizio,
    'periodoFine', p_periodo_fine,
    'righeSnapshot', 0,
    'message', 'Consolidamento liquidazione IVA completato; snapshot righe sospeso per FK legacy liquidazioni_iva_righe → liquidazioni_iva'
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

GRANT EXECUTE ON FUNCTION public.consolida_periodo_iva_transazionale(uuid, date, date, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consolida_periodo_iva_transazionale(uuid, date, date, text, uuid, text, jsonb) TO service_role;
