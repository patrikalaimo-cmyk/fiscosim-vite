# FINAL-COMMIT-06A.22 - Bootstrap base `public.liquidazioni_iva_righe`

## Obiettivo

Materializzare la tabella base `public.liquidazioni_iva_righe` prima della migration RLS/policy che la usa, senza toccare runtime, DB o la migration RLS esistente.

## File creato

- [supabase/migrations/20260412125600_liquidazioni_iva_righe_base_bootstrap.sql](../../supabase/migrations/20260412125600_liquidazioni_iva_righe_base_bootstrap.sql)

## Cosa mostra l'audit

La tabella compare nello schema legacy/completo in [schema_v3.sql](../../schema_v3.sql) come `create table if not exists liquidazioni_iva_righe` con:

- `liquidazione_id`
- `tipo`
- `descrizione`
- `imponibile`
- `aliquota`
- `iva`
- `data_documento`
- `numero_documento`

La migration RLS che la usa è [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql), dove viene eseguito il `drop policy if exists allow_all_liq_righe on public.liquidazioni_iva_righe`.

## Colonne minime adottate

Per il bootstrap locale sono state portate colonne minime coerenti con il legacy e con la chain fiscale:

- `id`
- `liquidazione_id`
- `societa_id`
- `tipo`
- `descrizione`
- `registro`
- `periodo`
- `aliquota`
- `natura`
- `imponibile`
- `imposta`
- `iva_debito`
- `iva_credito`
- `data_documento`
- `numero_documento`
- `metadata`
- `created_at`
- `updated_at`

Non è stata aggiunta alcuna FK verso `public.liquidazione_iva` per evitare una dipendenza prematura nel bootstrap.

## Diagnosi sintetica

Il problema era una tabella presente nello schema legacy ma non ancora materializzata nel grafo migrations locale. La migration RLS la assumeva già esistente prima del `drop policy`.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration esistente è stata modificata.

## Prossimo step

Rieseguire il bootstrap locale controllato per verificare che il punto di caduta su `public.liquidazioni_iva_righe` sia risolto e individuare l'eventuale blocker successivo.

## Verdetto

**FINAL-COMMIT-06A.22: A**

La causa è chiara e il fix minimo è una migration base ante-RLS/policy.