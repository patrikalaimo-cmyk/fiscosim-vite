-- Seed locale demo per smoke Registrazione manuale IVA semplice.
-- Idempotente, solo per ambiente locale.

do $$
begin
  if not exists (
    select 1 from public.causali_contabili
    where societa_id = '3416f210-345e-4197-b391-cee4383682da'
      and codice = 'SMOKE_IVA_22'
  ) then
    insert into public.causali_contabili (
      societa_id,
      codice,
      descrizione,
      tipo,
      attiva,
      metadata,
      codice_registro_iva,
      tipo_causale,
      segno_registro_iva,
      codice_aliquota_iva,
      causale_standard_efat,
      ventilazione_corrispettivi,
      esclusa_integrazioni
    ) values (
      '3416f210-345e-4197-b391-cee4383682da',
      'SMOKE_IVA_22',
      'Causale IVA 22 smoke locale',
      'manuale',
      true,
      '{"smoke":true,"scenario":"simple_iva_22"}'::jsonb,
      'ACQ',
      'Doc. IVA normale',
      '+',
      '22',
      false,
      false,
      true
    );
  end if;

  if not exists (
    select 1 from public.piano_conti
    where societa_id = '3416f210-345e-4197-b391-cee4383682da'
      and codice = 'SMOKE_COSTO_IVA_22'
  ) then
    insert into public.piano_conti (
      societa_id,
      codice,
      descrizione,
      tipo,
      natura,
      attivo
    ) values (
      '3416f210-345e-4197-b391-cee4383682da',
      'SMOKE_COSTO_IVA_22',
      'Costo smoke IVA 22',
      'economico',
      'costo',
      true
    );
  end if;

  if not exists (
    select 1 from public.piano_conti
    where societa_id = '3416f210-345e-4197-b391-cee4383682da'
      and codice = 'SMOKE_IVA_CREDITO_22'
  ) then
    insert into public.piano_conti (
      societa_id,
      codice,
      descrizione,
      tipo,
      natura,
      attivo
    ) values (
      '3416f210-345e-4197-b391-cee4383682da',
      'SMOKE_IVA_CREDITO_22',
      'IVA credito smoke 22',
      'patrimoniale',
      'attivo',
      true
    );
  end if;

  if not exists (
    select 1 from public.piano_conti
    where societa_id = '3416f210-345e-4197-b391-cee4383682da'
      and codice = 'SMOKE_DEBITO_GENERICO_22'
  ) then
    insert into public.piano_conti (
      societa_id,
      codice,
      descrizione,
      tipo,
      natura,
      attivo
    ) values (
      '3416f210-345e-4197-b391-cee4383682da',
      'SMOKE_DEBITO_GENERICO_22',
      'Debito generico smoke 22',
      'patrimoniale',
      'passivo',
      true
    );
  end if;

  if not exists (
    select 1 from public.causali_iva
    where societa_id = '3416f210-345e-4197-b391-cee4383682da'
      and codice = 'IVA22_SMOKE'
  ) then
    insert into public.causali_iva (
      societa_id,
      codice,
      descrizione,
      aliquota,
      natura,
      detraibilita,
      attiva,
      metadata
    ) values (
      '3416f210-345e-4197-b391-cee4383682da',
      'IVA22_SMOKE',
      'IVA acquisti 22% smoke locale',
      22,
      null,
      100,
      true,
      '{"smoke":true,"scenario":"simple_iva_22","registerType":"acquisti"}'::jsonb
    );
  end if;
end $$;

