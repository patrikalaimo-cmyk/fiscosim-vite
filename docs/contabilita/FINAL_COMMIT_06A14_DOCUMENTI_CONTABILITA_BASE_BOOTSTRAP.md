# FINAL-COMMIT-06A.14 - Base bootstrap `public.documenti_contabilita`

## Obiettivo

Materializzare `public.documenti_contabilita` prima di [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql) così il bootstrap locale non si ferma su `update public.documenti_contabilita` nella migration successiva [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql).

## File migration creato

- [supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql](../../supabase/migrations/20260412090000_documenti_contabilita_base_bootstrap.sql)

## Auditing pre-fix

Verifiche statiche eseguite:

- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) contiene `CREATE TABLE IF NOT EXISTS documenti_contabilita (...)` con il modello documentale completo;
- [schema_contabilita.sql](../../schema_contabilita.sql) non contiene `documenti_contabilita`;
- [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql) aggiunge i campi scope a `public.documenti_contabilita`;
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) fa `update public.documenti_contabilita` e quindi richiede la tabella già materializzata;
- [20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql) legge `company_id`, `societa_id`, `created_by`, `owner_user_id`, `visibility`;
- [20260430220000_prima_nota_documento_contabilita_link.sql](../../supabase/migrations/20260430220000_prima_nota_documento_contabilita_link.sql) aggiunge `prima_nota.documento_contabilita_id` con FK verso `public.documenti_contabilita(id)`;
- [20260430230000_registri_iva_prima_nota_link.sql](../../supabase/migrations/20260430230000_registri_iva_prima_nota_link.sql) aggiunge `registri_iva.documento_contabilita_id` con FK verso `public.documenti_contabilita(id)`.

## Colonne della migration base

La base bootstrap crea solo i campi che servono a materializzare la tabella documentale e a sbloccare le migration successive, senza portarsi dietro i campi scope che la migration di access-scope aggiunge già:

- `id`
- `societa_id`
- `filename`
- `file_path`
- `file_url`
- `mime_type`
- `file_size`
- `tipo_documento`
- `numero_documento`
- `data_documento`
- `soggetto_denominazione`
- `soggetto_piva`
- `soggetto_cf`
- `soggetto_tipo`
- `imponibile`
- `iva`
- `totale`
- `conto_id`
- `conto_match_type`
- `workflow_status`
- `validation_status`
- `ai_confidence`
- `ai_processed_at`
- `validated_by`
- `validated_at`
- `note_operatore`
- `prima_nota_id`
- `registered_at`
- `bulk_operation_id`
- `created_at`
- `updated_at`

Scelte deliberate:

- `societa_id` è una colonna semplice nella migration base, senza FK prematura verso `public.societa`, per evitare il blocco di bootstrap prima della materializzazione della società;
- i campi scope `tenant_id`, `company_id`, `created_by`, `owner_user_id`, `visibility`, `locked_by`, `locked_at` non sono inclusi, perché vengono già aggiunti da [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql);
- non vengono aggiunti `source_module`, `source_document_id`, `payload_hash`, perché appartengono al commit audit canonical e non al modello documentale di base;
- non vengono creati policy permissive, trigger o seed.

## Colonne non incluse volutamente

Non sono necessarie per il crash attuale e non devono entrare nella base bootstrap:

- `client_id`
- `company_id`
- `tenant_id`
- `created_by`
- `owner_user_id`
- `visibility`
- `locked_by`
- `locked_at`
- `source_module`
- `source_document_id`
- `payload_hash`

## Diagnosi causa

Il problema è un refactor parziale del ramo documentale:

- la tabella esiste nello schema contabile esteso;
- il grafo Supabase non la materializza prima della migration di scope;
- la migration di scope usa `alter table if exists`, quindi senza base la tabella resta assente;
- l'`update public.documenti_contabilita` del 12130000 cade subito dopo.

## Fix scelto

Il fix scelto è la migrazione base minima prima della migration di access-scope, senza cambiare il comportamento del runtime e senza introdurre il modello canonical commit.

## Rischi residui

- potrebbero emergere blocker successivi su altre tabelle del ramo documentale o su eventuali FK aggiuntive;
- se una migration futura pretende un campo non incluso qui, il prossimo passo dovrà restare un audit locale e non un dump completo.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration è stata applicata.

## Prossimo step

Se il bootstrap locale viene rilanciato in seguito, il prossimo punto da osservare sarà il primo blocker successivo alla chain access-scope / RLS su `public.documenti_contabilita`.

## Verdetto finale

**FINAL-COMMIT-06A.14: A**

La causa è chiara e il fix minimo è stato portato nel grafo migration nel punto corretto.