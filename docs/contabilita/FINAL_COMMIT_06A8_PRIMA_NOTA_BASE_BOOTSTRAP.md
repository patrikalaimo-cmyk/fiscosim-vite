# FINAL-COMMIT-06A8 - Base bootstrap `prima_nota` / `prima_nota_righe`

## Errore rilevato

Il bootstrap locale Supabase si ferma su [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql) perché `public.prima_nota_righe` non esiste nel grafo migration locale.

Errore osservato:

- `relation "public.prima_nota_righe" does not exist`

## File migration creato

- [supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql)

## Perché non è un legacy finto

`prima_nota` e `prima_nota_righe` non sono una tabella compatibilità inventata: fanno parte del modello contabile reale e sono già presenti in [schema_contabilita.sql](../../schema_contabilita.sql) e [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql).

La mancanza riguarda il grafo delle migration Supabase locale, non il nome del dominio.

## Struttura `prima_nota`

La migration base materializza la testata con i campi minimi coerenti con lo schema contabile e con le migration successive:

- `id`
- `societa_id`
- `company_id`
- `tenant_id`
- `numero_registrazione`
- `data_registrazione`
- `data_documento`
- `numero_documento`
- `causale_id`
- `causale_codice`
- `descrizione`
- `cliente_fornitore_id`
- `cliente_fornitore_nome`
- `totale_dare`
- `totale_avere`
- `stato`
- `fattura_xml_id`
- `documento_import_id`
- `documento_contabilita_id`
- `created_by`
- `owner_user_id`
- `visibility`
- `locked_by`
- `locked_at`
- `created_at`
- `updated_at`

## Struttura `prima_nota_righe`

La migration base materializza le righe con i campi minimi richiesti dal bootstrap e dalle migration successive:

- `id`
- `prima_nota_id`
- `societa_id`
- `company_id`
- `tenant_id`
- `created_by`
- `owner_user_id`
- `visibility`
- `locked_by`
- `locked_at`
- `riga_numero`
- `conto_id`
- `conto_codice`
- `conto_descrizione`
- `descrizione_riga`
- `importo_dare`
- `importo_avere`
- `causale_iva_id`
- `causale_iva_codice`
- `imponibile`
- `iva`
- `partita_aperta`
- `partita_id`
- `created_at`

## Scelte sulle FK

- `prima_nota_righe.prima_nota_id` referenzia `public.prima_nota(id)`.
- Non sono state aggiunte altre FK verso tabelle esterne nel bootstrap base.
- Le colonne `societa_id`, `company_id`, `tenant_id`, `created_by`, `owner_user_id` restano campi semplici, perché nel grafo locale non è stato verificato in questa fase che tutti i riferimenti esterni siano già materializzati in modo stabile.

Questa scelta riduce il rischio di nuovi blocker in bootstrap mantenendo il legame interno indispensabile tra testata e righe.

## Cosa sblocca

La migration base dovrebbe permettere a [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql) di trovare la tabella target della FK `prima_nota_riga_id`.

Inoltre prepara il terreno per le migration successive che assumono l’esistenza di `prima_nota` e `prima_nota_righe`, incluse:

- [20260412093000_access_scope_columns.sql](../../supabase/migrations/20260412093000_access_scope_columns.sql)
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [20260430220000_prima_nota_documento_contabilita_link.sql](../../supabase/migrations/20260430220000_prima_nota_documento_contabilita_link.sql)
- [20260430230000_registri_iva_prima_nota_link.sql](../../supabase/migrations/20260430230000_registri_iva_prima_nota_link.sql)

## Cosa non fa

- non applica seed;
- non introduce policy `allow_all`;
- non esegue insert/update/delete;
- non crea funzioni o trigger;
- non avvia il database;
- non applica migration;
- non tocca il DB remoto.

## Test statici

Comando eseguito:

- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`

Esito:

- `Migration guard passed: review-ready SQL still blocks the real commit path and does not contain unsafe final writes.`

## Search finale

La ricerca statica conferma che:

- `public.prima_nota_righe` è referenziata da [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql);
- `prima_nota` e `prima_nota_righe` esistono nello schema contabile esteso;
- non risultano migration Supabase che le creino prima della nuova base bootstrap.

## Rischi residui

- possono emergere blocker successivi su altre tabelle legacy o sullo schema access scope;
- la base è volutamente minima, quindi potrebbe servire una seconda iterazione se una migration successiva pretende altre colonne o relazioni;
- la presenza di colonne nullable senza FK è una scelta di bootstrap, non una dichiarazione del runtime finale.

## Prossimo step

1. Rilanciare `npx supabase start` in modo controllato per verificare se il grafo arriva oltre [20260404200000_ai_feedback_log.sql](../../supabase/migrations/20260404200000_ai_feedback_log.sql).
2. Se emergono nuovi blocker, trattarli come audit di dipendenza schema, non come modifica del modello operativo.

## Verdetto finale

**FINAL-COMMIT-06A.8: A**

La migration base è pronta, coerente con il modello contabile, priva di seed/policy permissive e posizionata prima della migration che la richiede.