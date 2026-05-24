# FINAL-COMMIT-06A10 - Base bootstrap `public.utenti_studio`

## Errore rilevato

Il bootstrap locale Supabase si ferma su [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql) perché `public.utenti_studio` non esiste nel grafo migration locale.

Errore osservato:

- `relation "public.utenti_studio" does not exist`
- statement di caduta:
  - `create unique index if not exists utenti_studio_auth_user_id_key on public.utenti_studio (auth_user_id) where auth_user_id is not null`

## File migration creato

- [supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql](../../supabase/migrations/20260412110000_utenti_studio_base_bootstrap.sql)

## Perché non è un legacy finto

`utenti_studio` è la tabella identità/studio usata dal ramo auth/RLS dello schema e compare nel legacy esteso in [schema_v3.sql](../../schema_v3.sql). Non è una tabella inventata per il bootstrap: è un prerequisito reale che le migration successive assumono già presente.

## Struttura `utenti_studio`

La migration base materializza la forma minima coerente con le migration successive:

- `id`
- `nome`
- `cognome`
- `email`
- `permessi`
- `clienti_assegnati`
- `password_hash`
- `ruolo`
- `attivo`
- `auth_user_id`
- `created_at`

Scelta minima:

- `password_hash` resta nullable perché la migration successiva lo azzera dove necessario;
- `permessi` è `jsonb not null default '{}'::jsonb` e serve alla funzione `user_can_access_cliente(target_cliente uuid)` creata in [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql);
- `clienti_assegnati` è `uuid[] not null default '{}'::uuid[]` e serve sempre a `user_can_access_cliente(target_cliente uuid)` quando `solo_assegnati` è attivo;
- `auth_user_id` è presente come colonna semplice, ma senza indice unico ancora in questa migration;
- `email` resta disponibile con unique index per allinearsi allo schema legacy esteso;
- `permessi` non introduce policy, trigger o logica runtime.

## Scelte sulle FK

- Nessuna FK esterna è stata aggiunta in questa base.
- La tabella `public.utenti_studio_societa` verrà soddisfatta dalle migration successive che già la definiscono come prerequisito secondario.

## Cosa sblocca

Questa migration dovrebbe permettere a [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql) di creare l’indice unico su `auth_user_id` e di completare l’aggancio dell’utente auth.

Inoltre prepara il terreno per:

- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql)
- [20260413103000_sprint1_p0_stabilization.sql](../../supabase/migrations/20260413103000_sprint1_p0_stabilization.sql)
- [20260413121500_auth_scope_membership_recovery.sql](../../supabase/migrations/20260413121500_auth_scope_membership_recovery.sql)

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

- [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql) richiede `public.utenti_studio` già esistente;
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) legge `us.permessi` nella funzione `user_can_access_cliente(target_cliente uuid)` e quindi richiede che la colonna esista già;
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) legge anche `us.clienti_assegnati` nella stessa funzione e quindi richiede che la colonna esista già;
- [schema_v3.sql](../../schema_v3.sql) contiene la definizione legacy estesa della tabella.

## Rischi residui

- potrebbero emergere blocker successivi su `utenti_studio_societa` o su altre colonne accessorie usate dalle policy;
- la base è volutamente minima e potrebbe richiedere un secondo passaggio se una migration successiva pretende ulteriori campi;
- il nome della tabella è coerente con il modello, ma il bootstrap resta sensibile alla sequenza delle migration.

## Prossimo step

1. Rilanciare `npx supabase start` in modo controllato per verificare se il grafo arriva oltre [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql).
2. Se emergono nuovi blocker, trattarli come audit di dipendenza schema in sequenza.

## Verdetto finale

**FINAL-COMMIT-06A.10: A**

La migration base è pronta, coerente con il modello auth/studio, priva di seed/policy permissive e posizionata prima della migration che la richiede.