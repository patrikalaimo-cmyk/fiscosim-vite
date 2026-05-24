# FINAL-COMMIT-06A.15 - Audit dipendenza schema locale `public.partitario`

## Obiettivo

Stabilire perché il bootstrap locale si ferma su `public.partitario`, senza toccare il DB e senza applicare fix.

## Evidenze statiche

Verifiche eseguite sul grafo migrations e sullo schema contabile:

- [supabase/migrations/20260403120000_partitari.sql](../../supabase/migrations/20260403120000_partitari.sql) crea `public.partitari` al plurale, con `soggetto_id`, `documento_id`, `accounting_entry_id`, `data`, `dare`, `avere`, `saldo_progressivo`, `descrizione`, `created_at`;
- [supabase/migrations/20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql) aggiunge i campi scope a `public.partitario` al singolare;
- [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) fa `update public.partitario pnp` e poi crea trigger e policy sullo stesso nome;
- [supabase/migrations/20260413103000_sprint1_p0_stabilization.sql](../../supabase/migrations/20260413103000_sprint1_p0_stabilization.sql) contiene un secondo `update public.partitario pt` e riafferma lo stesso ramo RLS/default;
- [schema_contabilita.sql](../../schema_contabilita.sql) contiene `CREATE TABLE IF NOT EXISTS partitario (...)` al singolare;
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) contiene anch'esso `CREATE TABLE IF NOT EXISTS partitario (...)` al singolare;
- non è emersa una migration del grafo che crei `public.partitario` prima delle migration RLS/scope che la usano.

## Distinzione rilevante

Il repo contiene due nomi diversi:

- `partitari` = tabella legacy/plurale presente nella migration del 3 aprile;
- `partitario` = modello contabile nuovo/singolare usato dagli schema contabili e dalle migration di scope/RLS di aprile 12-13.

Questa divergenza non sembra un semplice refuso locale: è un refactor parziale in cui il nome nuovo è già stato adottato dai layer successivi, ma la base migration nel grafo non lo materializza.

## Colonne minime

Per sbloccare il ramo locale, la base singolare deve esistere prima di `20260412093000_access_scope_columns.sql` e di `20260412130000_rls_multi_tenant_isolation.sql`.

Le colonne minime coerenti con lo schema contabile completo sono:

- `id`
- `societa_id`
- `prima_nota_id`
- `tipo`
- `conto_id`
- `numero_documento`
- `data_documento`
- `data_scadenza`
- `importo_originale`
- `importo_pagato`
- `importo_residuo`
- `stato`
- `chiusa_da_prima_nota_id`
- `created_at`
- `updated_at`

I campi scope `tenant_id`, `company_id`, `created_by`, `owner_user_id`, `visibility`, `locked_by`, `locked_at` vengono già aggiunti dalla migration di access-scope, quindi non devono entrare nella base bootstrap.

## Diagnosi

Il blocco locale è causato da una relazione mancante nel grafo migration, non da un problema di dati.

La prima migration che cade è [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql), perché esegue `update public.partitario pnp` quando la tabella singolare non è stata ancora materializzata.

Il problema di fondo è una divergenza di naming tra legacy e nuovo modello:

- il grafo ha `public.partitari`;
- le migration successive assumono `public.partitario`;
- lo schema contabile moderno conferma che il dominio corretto è il singolare.

## Verdetto

**FINAL-COMMIT-06A.15: A-**

La causa è stata identificata con sufficiente precisione: il grafo manca della materializzazione base di `public.partitario` nel punto corretto, e il ramo legacy `partitari` non può soddisfare le migration RLS/scope che parlano al singolare.

## Fix consigliato, non applicato

Il passo successivo, se richiesto, sarebbe introdurre una migration base minima per `public.partitario` prima della chain di scope/RLS, senza toccare il modello legacy `partitari` e senza eseguire SQL live.