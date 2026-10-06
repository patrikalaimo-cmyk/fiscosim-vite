# FINAL-COMMIT-06A.13 - Audit dipendenza locale `public.documenti_contabilita`

## Errore rilevato

Durante il bootstrap locale Supabase lo stack si ferma su `relation "public.documenti_contabilita" does not exist`.

Punto di caduta osservato:

- `update public.documenti_contabilita`

## Migration responsabile

La migration che contiene l'update è [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql#L58).

Nella stessa migration compaiono anche trigger, policy e altre referenze dirette su `public.documenti_contabilita`.

## Dove compare `documenti_contabilita`

Referenze dirette trovate nel grafo Supabase:

- [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql#L10) - `alter table if exists public.documenti_contabilita` per aggiungere `tenant_id`, `company_id`, `created_by`, `owner_user_id`, `visibility`, `locked_by`, `locked_at`;
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql#L58) - `update public.documenti_contabilita` che popola `company_id` e `tenant_id`;
- [20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql#L148) - funzioni e policy che leggono `dc.company_id`, `dc.societa_id`, `dc.created_by`, `dc.owner_user_id`, `dc.visibility`;
- [20260430220000_prima_nota_documento_contabilita_link.sql](../../supabase/migrations/20260430220000_prima_nota_documento_contabilita_link.sql#L6) - aggiunge `prima_nota.documento_contabilita_id` con FK verso `public.documenti_contabilita(id)`;
- [20260430230000_registri_iva_prima_nota_link.sql](../../supabase/migrations/20260430230000_registri_iva_prima_nota_link.sql#L24) - aggiunge `registri_iva.documento_contabilita_id` con FK verso `public.documenti_contabilita(id)`;
- [20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql#L400) - il commento finale del ramo canonical accounting include `public.documenti_contabilita` tra le tabelle coinvolte.

## Dove viene o non viene creata

Non ho trovato alcuna migration Supabase che crei `public.documenti_contabilita` con `create table`.

Nel grafo migration risulta solo il pattern `alter table if exists` e `update`, non una creazione iniziale.

La definizione completa della tabella esiste fuori migrations in [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql#L213), dove compare `CREATE TABLE IF NOT EXISTS documenti_contabilita (...)`.

Nei file letti non è emersa una definizione equivalente in [schema.sql](../../schema.sql) o [schema_v3.sql](../../schema_v3.sql) per questa tabella documentale.

## Colonne minime richieste

Per sbloccare il bootstrap locale il prerequisito minimo è la presenza della tabella, non del modello completo.

Colonne minime davvero necessarie per la catena attuale:

- `id`
- `societa_id`

Perché il bootstrap prosegua senza fermarsi al primo update, la migration di scope successiva deve poi poter aggiungere almeno:

- `company_id`
- `tenant_id`
- `created_by`
- `owner_user_id`
- `visibility`
- `locked_by`
- `locked_at`

Le colonne `workflow_status`, `validation_status`, `prima_nota_id`, `registered_at` appartengono al modello documentale completo in [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql#L213) e servono al flusso applicativo, ma non spiegano da sole il crash attuale.

## L'update richiede colonne specifiche?

L'`update public.documenti_contabilita` in [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql#L58) scrive soltanto `company_id` e `tenant_id` usando `societa_id` come sorgente.

Quindi, per il punto di caduta attuale, non sono necessarie `workflow_status`, `prima_nota_id`, `locked_by` o `locked_at` per spiegare l'errore.

Quelle colonne diventano rilevanti come parte del refactor multi-tenant e del ramo AI/pipeline, ma non sono la causa primaria del blocco corrente.

## Diagnosi causa

La causa è un refactor parziale del modello documentale nel grafo migration:

- `public.documenti_contabilita` esiste nello schema contabile esteso fuori migrations;
- la migration Supabase che la usa presume che la tabella esista già;
- il grafo locale non materializza la tabella prima della migration che fa l'update;
- di conseguenza il bootstrap si ferma su una tabella documentale nuova/non portata nel grafo.

Questa non sembra una tabella legacy inventata: è parte del modello contabile nuovo, ma non è stata portata come base iniziale nelle migration Supabase.

## Ordine migration

Il punto importante non è solo la migration che fa l'update.

La base di `public.documenti_contabilita` deve stare prima di [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql#L10), altrimenti quella migration non può aggiungere i campi di scope necessari per la chain successiva.

Quindi il problema è anche di ordine migration, non solo di assenza della tabella.

## Possibili fix

1. Aggiungere una migration base per `public.documenti_contabilita` prima di [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql#L10).
2. Lasciare che [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql#L10) aggiunga `company_id`, `tenant_id`, `created_by`, `owner_user_id`, `visibility`, `locked_by`, `locked_at`.
3. Verificare poi se il blocco successivo richiede un secondo passaggio sul modello documentale completo, senza introdurre un dump eccessivo.

## Fix consigliato

Il fix minimo consigliato è una migration base per `public.documenti_contabilita` collocata prima di [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql#L10), con una forma molto piccola ma compatibile con i riferimenti già presenti nel grafo.

Motivo: così la migration di scope può aggiungere le colonne di contesto e l'`update` del 12130000 può completarsi senza trovare la tabella mancante.

## Rischi

- una base troppo povera potrebbe esporre un blocker successivo su altre colonne del modello documentale completo;
- una base troppo ricca rischia di introdurre un modello sbagliato o prematuro nel bootstrap locale;
- la tabella è usata da più migration successive, quindi l'ordine deve essere coerente con l'intera chain RLS/pipeline.

## Conferme operative

- Nessun DB è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration è stata applicata.

## Prossimo step

Se si vuole proseguire, il passo corretto è introdurre la base di `public.documenti_contabilita` nel grafo migration prima della migration di scope del 20260412093000, poi riesaminare il prossimo blocker con lo stesso metodo read-only.

## Verdetto finale

**FINAL-COMMIT-06A.13: A**

La causa è chiara: tabella documentale nuova non materializzata nel grafo prima delle migration che la usano. Il fix minimo identificato è una migration base precedente alla migration di scope che già la referenzia.