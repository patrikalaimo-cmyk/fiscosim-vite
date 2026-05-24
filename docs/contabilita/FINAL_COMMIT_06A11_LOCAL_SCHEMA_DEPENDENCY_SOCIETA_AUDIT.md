# FINAL-COMMIT-06A.11 - Audit dipendenza schema locale `public.societa`

## Errore rilevato

Durante il bootstrap locale Supabase lo stack si ferma su una dipendenza mancante durante la creazione di `public.utenti_studio_societa`:

- `relation "public.societa" does not exist`
- statement di caduta in [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql):
  - `create table if not exists public.utenti_studio_societa (...)`
  - `societa_id uuid not null references public.societa(id) on delete cascade`

## File letti

- [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [supabase/migrations/20260412143000_fiscal_societa_scope.sql](../../supabase/migrations/20260412143000_fiscal_societa_scope.sql)
- [supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql)
- [supabase/migrations/20260413103000_sprint1_p0_stabilization.sql](../../supabase/migrations/20260413103000_sprint1_p0_stabilization.sql)
- [supabase/migrations/20260413121500_auth_scope_membership_recovery.sql](../../supabase/migrations/20260413121500_auth_scope_membership_recovery.sql)
- [supabase/migrations/20260413143000_auth_session_profile_consolidation.sql](../../supabase/migrations/20260413143000_auth_session_profile_consolidation.sql)
- [supabase/migrations/20260414170000_admin_reset_operations.sql](../../supabase/migrations/20260414170000_admin_reset_operations.sql)
- [supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql)
- [schema.sql](../../schema.sql)
- [schema_v3.sql](../../schema_v3.sql)
- [schema_contabilita.sql](../../schema_contabilita.sql)
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql)
- [supabase/config.toml](../../supabase/config.toml)
- [package.json](../../package.json)
- [docs/contabilita/FINAL_COMMIT_06A10_UTENTI_STUDIO_BASE_BOOTSTRAP.md](FINAL_COMMIT_06A10_UTENTI_STUDIO_BASE_BOOTSTRAP.md)

## Dove compare `public.societa`

### In migration Supabase

- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql): FK `public.utenti_studio_societa.societa_id references public.societa(id)` e policy su `public.societa`.
- [20260412143000_fiscal_societa_scope.sql](../../supabase/migrations/20260412143000_fiscal_societa_scope.sql): propaga `societa_id` su più tabelle e usa `public.societa` in query/indici/policy.
- [20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql): usa `public.user_has_societa_access(...)` e campi legati allo scope societa.
- [20260413103000_sprint1_p0_stabilization.sql](../../supabase/migrations/20260413103000_sprint1_p0_stabilization.sql): usa `public.societa` per default scope e backfill.
- [20260413121500_auth_scope_membership_recovery.sql](../../supabase/migrations/20260413121500_auth_scope_membership_recovery.sql): legge da `public.societa` per ricostruire membership/assegnazioni.
- [20260413143000_auth_session_profile_consolidation.sql](../../supabase/migrations/20260413143000_auth_session_profile_consolidation.sql): legge da `public.societa` per consolidare profili e membership.
- [20260414170000_admin_reset_operations.sql](../../supabase/migrations/20260414170000_admin_reset_operations.sql): FK verso `public.societa(id)`.
- [20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql): FK `societa_id references public.societa(id)` e check di accesso.

### Fuori dalle migration

- [schema_contabilita.sql](../../schema_contabilita.sql): crea `societa` come tabella base del modello contabile.
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql): definisce `societa` con campi più estesi e numeratori aggiuntivi.
- [schema_v3.sql](../../schema_v3.sql): non crea `societa`, ma la assume nei riferimenti di tabelle successive (`liquidazioni_iva`, `f24`, ecc.).

## Dove viene / non viene creata

### Viene creata negli schema legacy/contabili fuori migrations

- `schema_contabilita.sql` e `schema_contabilita_completo.sql` contengono entrambe una definizione diretta di `societa`.

### Non viene creata nel grafo migration Supabase

- Non ho trovato una migration in [supabase/migrations/](../../supabase/migrations/) che faccia `create table if not exists public.societa` o `create table public.societa`.
- Le migration la trattano come prerequisito già presente, in particolare quelle di scope RLS e membership studio.

## Colonne minime probabilmente necessarie

Per sbloccare il bootstrap locale senza portare il dump completo, la base di `public.societa` dovrebbe probabilmente contenere almeno:

- `id`
- `codice`
- `denominazione`
- `codice_fiscale`
- `partita_iva`
- `indirizzo`
- `cap`
- `citta`
- `provincia`
- `regime_contabile`
- `attiva`
- `created_at`
- `updated_at`

Colonne che appaiono spesso nello schema esteso e che possono diventare necessarie nelle migration successive:

- `nazione`
- `esercizio_da`
- `esercizio_a`
- `anno_iva_corrente`
- `anno_contabile_corrente`
- `ultimo_protocollo_vendite`
- `ultimo_protocollo_acquisti`
- `ultimo_protocollo_corrispettivi`
- `ultimo_numero_registrazione`
- `note`

## Classificazione del problema

La diagnosi più probabile è:

- **migration mancante** nel grafo Supabase locale;
- **schema legacy non portato integralmente** nel bootstrap;
- **refactor parziale**: il modello multi-tenant e le membership RLS assumono `public.societa` come base dello scope, ma la sua creazione non è materializzata nelle migration locali.

Non sembra un semplice errore di ordine della sola migration [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql): la tabella base non risulta proprio definita nel grafo migration.

## Risposte puntuali

1. `public.societa` viene creata da qualche migration? **No, non l’ho trovata nel grafo Supabase.**
2. `public.societa` esiste solo in schema legacy fuori migrations? **Sì, è presente in `schema_contabilita.sql` e `schema_contabilita_completo.sql`.**
3. La migration [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql) è fuori ordine? **È dipendente da `public.societa`, ma il problema principale resta la tabella mancante.**
4. Il riferimento è legacy o coerente? **Coerente con il modello multi-tenant dello stack, ma non materializzato nel bootstrap locale.**
5. Il problema è: **migration mancante + schema incompleto + refactor parziale**.

## Fix possibili

1. Aggiungere una migration base che materializzi `public.societa` prima delle migration che la referenziano.
2. Mantenere la base minimale con PK, campi anagrafici e scope, lasciando i numeratori/attributi extra alla migrazione successiva se serve.
3. Se il modello multi-tenant non deve esistere nel bootstrap locale, riscrivere le migration RLS/scope per non dipendere da `public.societa`.

## Fix consigliato

Fix minimo per sbloccare il bootstrap locale senza toccare il modello nuovo:

- introdurre una migration base per `public.societa` nel grafo Supabase locale prima di [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql);
- includere almeno la PK `id` e i campi anagrafici/scope minimi che le migration successive usano come base del tenant.

Motivo: `public.societa` è la radice dello scope multi-tenant e il prerequisito di più migration successive; senza di essa il bootstrap non può proseguire.

## Rischi

- una base troppo piccola potrebbe far emergere nuovi blocker su `utenti_studio_societa` o sulle migration di scope successive;
- una base troppo ampia rischierebbe di ricostruire l’intero dump legacy invece del minimo necessario;
- la presenza di `schema_contabilita.sql` e `schema_contabilita_completo.sql` non significa che la tabella esista nel grafo migration locale.

## Conferme operative

- Nessun DB remoto è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration è stata applicata manualmente.
- Nessun `npx supabase start` è stato rilanciato in questa fase di audit.

## Prossimo step

1. Se l’obiettivo è sbloccare il bootstrap, portare `public.societa` nel grafo migration prima delle migration che la usano.
2. Se emergono nuovi blocker dopo quello, trattarli come audit di dipendenza schema in sequenza.

## Verdetto finale

**FINAL-COMMIT-06A.11: A**

La causa è chiara: `public.societa` manca nel grafo migration locale, mentre schema legacy e migration successive la assumono come prerequisito della base multi-tenant. Il fix minimo è materializzare la tabella base prima della migration RLS che la referenzia.