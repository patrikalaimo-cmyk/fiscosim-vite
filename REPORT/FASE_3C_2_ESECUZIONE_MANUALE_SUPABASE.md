# GUIDA OPERATIVA — ESECUZIONE MANUALE MIGRATION SU SUPABASE STUDIO
## FASE 3C.2-B — Fondazione DB, RPC e Audit Contabile (Hardened & Upgraded Decision Engine)

Il presente documento fornisce le istruzioni dettagliate e lo script SQL completo per l'applicazione manuale dello schema e delle stored procedure (RPC) transazionali all'interno del database di **FiscoSim** tramite la console web di Supabase.

---

### A) Avviso di Sicurezza sull'Ambiente
> [!CAUTION]
> **VERIFICARE L'AMBIENTE ATTIVO PRIMA DI PROCEDERE**
> - **Project Ref Atteso**: `mlydfspmrkaedsocubku`
> - Accedere al portale [Supabase Dashboard](https://supabase.com/dashboard/) e verificare esplicitamente di essere collegati al progetto di **Dev/Staging** (`mlydfspmrkaedsocubku`).
> - **NON eseguire assolutamente questo script su database di produzione reali** se contenenti dati attivi di clienti o dello studio, salvo pianificazione concordata con il team sistemistico.

---

### B) Script SQL Completo (da copiare e incollare)
Copiare integralmente il seguente blocco ed incollarlo all'interno di una nuova scheda dell'**SQL Editor** di Supabase Studio:

```sql
-- FASE-3C.1 — FONDAZIONE DEFINITIVA DB/RPC/AUDIT
-- Migration YYYYMMDDHHMMSS_fase_3c_audit_modifica_annullo_storno.sql
-- Questa migration NON viene applicata automaticamente al database remoto/Supabase in questa fase.
-- Fornisce le definizioni e le stored procedure definitive studio-grade per la gestione sicura del ciclo vita di Prima Nota.

-- =========================================================================
-- 1. ESTENSIONE DELLA TABELLA prima_nota
-- =========================================================================
alter table if exists public.prima_nota
  add column if not exists storno_of_id uuid references public.prima_nota(id) on delete restrict,
  add column if not exists rettifica_of_id uuid references public.prima_nota(id) on delete restrict,
  add column if not exists motivo_operazione text,
  add column if not exists annullata_at timestamptz,
  add column if not exists annullata_by uuid, -- Riferito all'utente che annulla
  add column if not exists annullamento_motivo text,
  add column if not exists stornata_at timestamptz,
  add column if not exists stornata_by uuid,
  add column if not exists storno_id uuid references public.prima_nota(id) on delete restrict,
  add column if not exists periodo_chiuso_lock boolean default false,
  add column if not exists versione integer default 1,
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz default now();

-- Commenti descrittivi per le nuove colonne di prima_nota
comment on column public.prima_nota.storno_of_id is 'Punta alla registrazione originale di cui questa scrittura costituisce lo storno contabile.';
comment on column public.prima_nota.rettifica_of_id is 'Punta alla registrazione originale di cui questa scrittura costituisce una rettifica o integrazione.';
comment on column public.prima_nota.motivo_operazione is 'Giustificazione testuale obbligatoria per modifiche, rettifiche o storni.';
comment on column public.prima_nota.annullata_at is 'Data e ora in cui la registrazione è stata annullata logicamente.';
comment on column public.prima_nota.annullata_by is 'Identificativo dell''operatore o amministratore che ha disposto l''annullamento.';
comment on column public.prima_nota.annullamento_motivo is 'Giustificazione del motivo di annullamento logico della scrittura.';
comment on column public.prima_nota.stornata_at is 'Data e ora in cui la registrazione è stata stornata logicamente.';
comment on column public.prima_nota.stornata_by is 'Identificativo dell''operatore o amministratore che ha disposto lo storno.';
comment on column public.prima_nota.storno_id is 'Punta alla scrittura di storno che ha neutralizzato questa registrazione.';
comment on column public.prima_nota.periodo_chiuso_lock is 'Flag di sicurezza che impedisce modifiche se il periodo è stato consolidato, stampato in definitivo o liquidato.';
comment on column public.prima_nota.versione is 'Numero progressivo incrementale della versione del record (incrementato ad ogni modifica controllata).';

-- =========================================================================
-- 2. CREAZIONE DELLA TABELLA DI AUDIT CONTABILE (APPEND-ONLY)
-- =========================================================================
create table if not exists public.audit_contabile (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid not null references public.societa(id) on delete restrict,
  entity_type varchar(50) not null default 'prima_nota',
  entity_id uuid not null,
  operation_type varchar(30) not null, -- 'INSERT', 'UPDATE', 'ANNULLA', 'STORNO', 'RETTIFICA'
  operation_reason text not null,
  before_data jsonb,
  after_data jsonb,
  performed_by uuid, -- ID utente che esegue l'azione (da auth.users o utenti_studio)
  performed_at timestamptz not null default now(),
  source_module varchar(50) not null, -- 'registrazione_manual', 'import_contabilita', 'riconciliazione_bancaria'
  correlation_id uuid default gen_random_uuid(),
  metadata jsonb default '{}'::jsonb,
  constraint audit_contabile_operation_type_ck check (operation_type in ('INSERT', 'UPDATE', 'ANNULLA', 'STORNO', 'RETTIFICA')),
  constraint audit_contabile_source_module_ck check (source_module in ('registrazione_manual', 'import_contabilita', 'riconciliazione_bancaria'))
);

comment on table public.audit_contabile is 'Tabella di audit trail append-only immutabile per tutte le variazioni contabili di Prima Nota.';

-- Creazione indici ottimizzati per reportistica, verifiche e controlli di sicurezza
create index if not exists idx_audit_contabile_societa on public.audit_contabile (societa_id);
create index if not exists idx_audit_contabile_entity on public.audit_contabile (entity_type, entity_id);
create index if not exists idx_audit_contabile_operation on public.audit_contabile (operation_type);
create index if not exists idx_audit_contabile_performed_at on public.audit_contabile (performed_at desc);

-- Abilitazione della sicurezza RLS per audit_contabile
alter table public.audit_contabile enable row level security;

-- Revoca permessi ordinari per prevenire manipolazioni
revoke all on table public.audit_contabile from public, anon, authenticated;

-- Definizione policy di isolamento tenant (solo visualizzazione per utenti appartenenti alla società)
create policy audit_contabile_select_policy on public.audit_contabile
  for select to authenticated
  using (
    public.user_has_societa_access(societa_id)
  );

-- Concessione permessi di scrittura ed esecuzione controllata
grant select on table public.audit_contabile to authenticated;
grant select, insert on table public.audit_contabile to service_role;


-- =========================================================================
-- 3. stored procedure PostgreSQL (RPC)
-- =========================================================================

-- RPC 1: rpc_get_prima_nota_operation_guards
-- Controlla se un'operazione contabile è consentita e riporta motivazioni e avvisi.
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

  -- 8. Controllo Impatti Fiscali e Warning Giallo / Rosso
  select exists (select 1 from public.registri_iva where prima_nota_id = p_prima_nota_id) into v_has_iva;
  select exists (select 1 from public.partitario where prima_nota_id = p_prima_nota_id or chiusa_da_prima_nota_id = p_prima_nota_id) into v_has_payments;
  select exists (select 1 from public.ritenute_dacconto where note like '%' || p_prima_nota_id::text || '%') into v_has_withholding;

  v_has_fiscal_impact := v_has_iva or v_has_payments or v_has_withholding;

  if v_has_fiscal_impact then
    -- Verifica consolidamento fiscale
    select exists (
      SELECT 1 FROM public.liquidazione_iva
      WHERE societa_id = p_societa_id
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
    if v_has_fiscal_outputs then
      if v_warning_level <> 'nero' then
        v_warning_level := 'rosso';
      end if;
      v_warnings := v_warnings || jsonb_build_array('Adempimenti fiscali (LIPE/F24/CU/770) già elaborati o inviati per questo periodo. Procedere potrebbe comportare sanzioni.');
      v_requires_recalculation := true;
      v_impacted_outputs := v_impacted_outputs || jsonb_build_array('LIPE', 'F24_IVA', 'CU', 'DICHIARAZIONE_770');
      v_required_followups := v_required_followups || jsonb_build_array('Ricalcolo Liquidazione IVA', 'Riemissione LIPE correttiva / ravvedimento operoso', 'Rigenerazione file telematico F24/CU/770');
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
        v_blocking_reasons := v_blocking_reasons || jsonb_build_array('Utente senza permesso richiesto: il periodo ha già adempimenti fiscali consolidati/inviati. Richiesto il permesso "modifica_periodo_liquidato" o ruolo Amministratore/Owner.');
      end if;

    -- Caso B: Liquidazione calcolata ma non ancora inviata (Warning level: giallo)
    elsif v_is_liquidated then
      if v_warning_level = 'verde' then
        v_warning_level := 'giallo';
      end if;
      v_warnings := v_warnings || jsonb_build_array('Mese/periodo IVA già liquidato (non ancora inviato). Procedere comporterà la necessità di rigenerare la liquidazione periodica.');
      v_requires_recalculation := true;
      v_impacted_outputs := v_impacted_outputs || jsonb_build_array('liquidazione_iva');
      v_required_followups := v_required_followups || jsonb_build_array('Ricalcolo della liquidazione IVA periodica del mese/trimestre coinvolto');
      v_suggested_workflow := 'procedi_con_ricalcolo';

    -- Caso C: Operazione IVA ordinaria non elaborata (Warning level: giallo)
    else
      if v_warning_level = 'verde' then
        v_warning_level := 'giallo';
      end if;
      v_warnings := v_warnings || jsonb_build_array('Operazione con impatto IVA. La modifica comporta la necessità di ricalcolare i registri IVA e la liquidazione.');
      v_requires_recalculation := true;
      v_impacted_outputs := v_impacted_outputs || jsonb_build_array('registri_iva');
      v_required_followups := v_required_followups || jsonb_build_array('Verifica e ricalcolo registri IVA per il periodo coinvolto');
      v_suggested_workflow := 'procedi_con_ricalcolo';
    end if;

    -- D. Controlli separati per pagamenti/partitario
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

    -- E. Controlli separati per ritenute d'acconto
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
    'can_execute', v_allowed, -- Per retrocompatibilità al 100% con codice esistente e test
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


-- RPC 2: rpc_update_prima_nota_generale_controllata
-- Modifica una registrazione contabile in-place con transazione controllata e scrittura di audit.
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

  -- 5. Sostituzione atomica delle righe contabili
  delete from public.prima_nota_righe where prima_nota_id = p_prima_nota_id;

  for v_riga in select * from jsonb_to_recordset(p_rows) as (
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
      p_prima_nota_id, p_societa_id, v_riga.riga_numero, v_riga.conto_id, v_riga.conto_codice,
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


-- RPC 3: rpc_annulla_prima_nota_logica
-- Esegue l'annullamento logico di una scrittura, preservando i dati per finalità di numerazione.
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


-- RPC 4: rpc_storna_prima_nota_generale
-- Genera in modalità transazionale sul database una scrittura di storno speculare Dare/Avere invertiti.
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

  -- 5. Creazione testata storno contabile (Dare e Avere invertiti)
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
    'confermata', p_prima_nota_id, p_motivo, p_utente_id
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

  -- 7. Aggiorna stato e campi storno della registrazione originaria
  update public.prima_nota set
    stato = 'annullata',
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

-- Concessione dei diritti di esecuzione agli utenti autenticati e al ruolo di servizio
grant execute on function public.rpc_get_prima_nota_operation_guards(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_get_prima_nota_operation_guards(uuid, uuid, text) to service_role;

grant execute on function public.rpc_update_prima_nota_generale_controllata(uuid, uuid, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.rpc_update_prima_nota_generale_controllata(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;

grant execute on function public.rpc_annulla_prima_nota_logica(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.rpc_annulla_prima_nota_logica(uuid, uuid, text, uuid) to service_role;

grant execute on function public.rpc_storna_prima_nota_generale(uuid, uuid, text, date, uuid) to authenticated;
grant execute on function public.rpc_storna_prima_nota_generale(uuid, uuid, text, date, uuid) to service_role;
```

---

### C) Checklist Pre-Esecuzione Controllata
Prima di cliccare su **Run** o **Execute**:
1. [ ] Verificare che nell'angolo in alto del browser il progetto Supabase sia **FiscoSim Dev/Staging** (ID: `mlydfspmrkaedsocubku`).
2. [ ] Assicurarsi che le tabelle siano quelle del sandbox (verificare che `prima_nota` abbia 0 righe per sicurezza).
3. [ ] Cliccare su **SQL Editor** nella barra laterale sinistra di Supabase Studio.
4. [ ] Creare una nuova query cliccando su **"+ New Query"**.
5. [ ] Incollare l'intero codice SQL sopra descritto senza spezzarlo.
6. [ ] Cliccare sul pulsante verde **"Run"** in basso a destra.
7. [ ] Verificare che il messaggio restituito sia `"Success. No rows returned"` o simile e che non ci siano errori bloccanti.

---

### D) Query di Verifica Post-Esecuzione
Per accertare che la migration sia andata a buon fine ed abbia popolato correttamente le strutture ed i servizi, eseguire le seguenti query di test nell'SQL Editor:

#### 1. Verifica Nuove Colonne su `prima_nota`
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'prima_nota'
  AND column_name IN ('storno_of_id', 'rettifica_of_id', 'motivo_operazione', 'annullata_at', 'annullata_by', 'annullamento_motivo', 'stornata_at', 'stornata_by', 'storno_id', 'periodo_chiuso_lock', 'versione');
```
*Risultato atteso*: **11 righe** compilate con i rispettivi tipi (UUID, TEXT, TIMESTAMPTZ, BOOLEAN, INTEGER).

#### 2. Verifica Tabella `audit_contabile`
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'audit_contabile';
```
*Risultato atteso*: 1 riga con valore `audit_contabile`.

#### 3. Verifica delle RPC e Permessi
```sql
SELECT routine_name, data_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name IN ('rpc_get_prima_nota_operation_guards', 'rpc_update_prima_nota_generale_controllata', 'rpc_annulla_prima_nota_logica', 'rpc_storna_prima_nota_generale');
```
*Risultato atteso*: 4 righe visualizzate, ciascuna associata al tipo di ritorno `jsonb`.

---

### E) Smoke Test Non Distruttivi (PG query)
Per testare il corretto funzionamento della logica delle guards senza alterare in alcun modo i record reali del database, eseguire il seguente smoke test nell'SQL Editor:

```sql
SELECT public.rpc_get_prima_nota_operation_guards(
  '00000000-0000-0000-0000-000000000000'::uuid, -- UUID fittizio inesistente
  '00000000-0000-0000-0000-000000000000'::uuid, -- Società fittizia
  'UPDATE'
);
```

*Risultato atteso*: La query deve restituire un oggetto JSON perfettamente formattato:
```json
{
  "allowed": false,
  "can_execute": false,
  "blocking_reasons": ["Registrazione contabile non trovata o non appartenente alla società selezionata."],
  "warning_level": "nero",
  "warnings": ["Record inesistente."],
  "required_permission": null,
  "requires_reason": false,
  "requires_recalculation": false,
  "impacted_outputs": [],
  "required_followups": [],
  "suggested_workflow": "blocca",
  "can_force": false,
  "force_requires_role_or_permission": null
}
```
Questo conferma che la RPC risponde in modo corretto ed isolato ed intercetta lo stato del database.

---

### F) Cosa mandare a ChatGPT/Antigravity dopo l'esecuzione
Una volta completata l'applicazione, si prega di copiare ed incollare nella chat di dialogo:
1. Il risultato restituito dall'SQL Editor all'applicazione dello script (es. `Success. 0 rows affected`).
2. L'esito e le righe restituite dalle tre query di verifica al punto D (in formato tabellare o JSON).
3. L'esito dello smoke test al punto E.
4. Eventuali errori di sintassi o permessi riscontrati a schermo per permetterci di risolverli istantaneamente.
