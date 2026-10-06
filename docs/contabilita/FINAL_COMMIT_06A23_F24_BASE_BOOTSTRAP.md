# FINAL-COMMIT-06A.23 - Bootstrap base `public.f24`

## Obiettivo

Materializzare la tabella base `public.f24` prima della migration RLS/policy che la usa, senza toccare runtime, DB o la migration RLS esistente.

## File creato

- [supabase/migrations/20260412125700_f24_base_bootstrap.sql](../../supabase/migrations/20260412125700_f24_base_bootstrap.sql)

## Esito audit pre-fix

La tabella compare nello schema legacy/contabile in [schema_v3.sql](../../schema_v3.sql) come `create table if not exists f24 (...)` con struttura operativa semplice:

- `cliente_id` con FK verso `clienti` nello schema legacy
- `cliente_nome`
- `data_scadenza`
- `data_pagamento`
- `descrizione`
- `codice_tributo`
- `anno_riferimento`
- `periodo_riferimento`
- `importo`
- `stato`
- `note`

Nel grafo migration la tabella non risultava materializzata prima del punto di caduta su [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql), dove compare `drop policy if exists allow_all_f24 on public.f24`.

## Colonne minime adottate

Per il bootstrap locale sono state portate colonne coerenti con lo schema legacy e con il blocco RLS:

- `id`
- `cliente_id`
- `cliente_nome`
- `data_scadenza`
- `data_pagamento`
- `descrizione`
- `codice_tributo`
- `anno_riferimento`
- `periodo_riferimento`
- `importo`
- `stato`
- `note`
- `created_at`

Non sono state aggiunte FK verso `clienti` o `societa` per evitare dipendenze premature nel bootstrap.

## Diagnosi sintetica

Il problema è una tabella operativa reale presente nello schema legacy ma non ancora materializzata nel grafo migration locale. La migration RLS la assume già esistente al momento del `drop policy`.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration esistente è stata modificata.

## Prossimo step

Rieseguire il bootstrap locale controllato per verificare che il punto di caduta su `public.f24` sia risolto e individuare il successivo blocker del grafo.

## Verdetto

**FINAL-COMMIT-06A.23: A**

La causa è chiara: `public.f24` esiste nello schema legacy ma non nel grafo migrations locale, e la migration RLS la tocca prima della sua materializzazione.