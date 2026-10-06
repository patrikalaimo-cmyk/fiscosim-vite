# FINAL-COMMIT-06A.12 - Base bootstrap `public.societa`

## Errore rilevato

Il bootstrap locale Supabase si ferma su [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) perché `public.societa` non esiste nel grafo migration locale.

Errore osservato:

- `relation "public.societa" does not exist`
- statement di caduta:
  - `societa_id uuid not null references public.societa(id) on delete cascade`

## File migration creato

- [supabase/migrations/20260412124000_societa_base_bootstrap.sql](../../supabase/migrations/20260412124000_societa_base_bootstrap.sql)

## Perché non è un legacy finto

`public.societa` è la radice dello scope multi-tenant usata da tutto il ramo auth/RLS e dal modello contabile. Non è una tabella inventata per il bootstrap: è già definita negli schema contabili fuori migration e serve come prerequisito reale per le migration successive.

## Struttura `societa`

La migration base materializza la forma minima coerente con lo schema contabile e con i riferimenti del grafo migration:

- `id`
- `codice`
- `denominazione`
- `ragione_sociale`
- `codice_fiscale`
- `partita_iva`
- `indirizzo`
- `cap`
- `citta`
- `provincia`
- `nazione`
- `regime_contabile`
- `attiva`
- `anno_iva_corrente`
- `anno_contabile_corrente`
- `ultimo_protocollo_vendite`
- `ultimo_protocollo_acquisti`
- `ultimo_protocollo_corrispettivi`
- `ultimo_numero_registrazione`
- `note`
- `created_at`
- `updated_at`

Scelte minime:

- `codice` e `denominazione` sono `not null` per allinearsi all’uso strutturale nello schema contabile;
- `attiva` resta `not null default true` perché le migration successive filtrano le società attive;
- i numeratori sono inclusi perché compaiono nello schema contabile completo e sono usati come base del tenant;
- non vengono aggiunte policy o trigger.

## Scelte sulle FK

- Nessuna FK esterna è stata aggiunta in questa base.
- La tabella `public.utenti_studio_societa` verrà soddisfatta dalla migration successiva che già la crea con FK verso `public.societa(id)`.

## Cosa sblocca

Questa migration dovrebbe permettere a [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) di creare `public.utenti_studio_societa` e di procedere con le migration RLS/scope successive.

Inoltre prepara il terreno per:

- [20260412143000_fiscal_societa_scope.sql](../../supabase/migrations/20260412143000_fiscal_societa_scope.sql)
- [20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql)
- [20260413103000_sprint1_p0_stabilization.sql](../../supabase/migrations/20260413103000_sprint1_p0_stabilization.sql)
- [20260413121500_auth_scope_membership_recovery.sql](../../supabase/migrations/20260413121500_auth_scope_membership_recovery.sql)
- [20260413143000_auth_session_profile_consolidation.sql](../../supabase/migrations/20260413143000_auth_session_profile_consolidation.sql)
- [20260414170000_admin_reset_operations.sql](../../supabase/migrations/20260414170000_admin_reset_operations.sql)
- [20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql)

## Cosa non fa

- non introduce seed;
- non introduce policy `allow_all`;
- non esegue insert/update/delete;
- non crea funzioni o trigger;
- non tocca il DB remoto;
- non avvia Supabase;
- non applica migration.

## Test statici

Comando eseguito:

- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`

Esito:

- `Migration guard passed: review-ready SQL still blocks the real commit path and does not contain unsafe final writes.`

## Search finale

La ricerca statica conferma che:

- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) richiede `public.societa` già esistente;
- [20260412143000_fiscal_societa_scope.sql](../../supabase/migrations/20260412143000_fiscal_societa_scope.sql) e le migration successive assumono `societa_id`/`attiva`/`denominazione`;
- [schema_contabilita.sql](../../schema_contabilita.sql) e [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) contengono la definizione base/estesa di `societa`.

## Rischi residui

- potrebbero emergere blocker successivi su colonne accessorie o su policy che leggono ulteriori campi di `societa`;
- la base è volutamente minima e potrebbe richiedere un secondo passaggio se una migration successiva pretende altri attributi;
- la presenza dello schema contabile fuori migrations non equivale alla presenza nel grafo Supabase locale.

## Prossimo step

1. Rilanciare `npx supabase start` in modo controllato per verificare se il grafo arriva oltre [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql).
2. Se emergono nuovi blocker, trattarli come audit di dipendenza schema in sequenza.

## Verdetto finale

**FINAL-COMMIT-06A.12: A**

La migration base è pronta, coerente con il modello multi-tenant, priva di seed/policy permissive e posizionata prima della migration che la richiede.