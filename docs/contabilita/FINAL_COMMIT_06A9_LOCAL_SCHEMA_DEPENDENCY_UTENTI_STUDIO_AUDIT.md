# FINAL-COMMIT-06A9 - Audit dipendenza schema locale `public.utenti_studio`

## Errore rilevato

Durante il bootstrap locale Supabase, dopo il superamento dei blocker su `public.clienti`, `public.prima_nota` e `public.prima_nota_righe`, lo stack si ferma su una nuova dipendenza mancante:

- `relation "public.utenti_studio" does not exist`
- statement di caduta:
  - `create unique index if not exists utenti_studio_auth_user_id_key on public.utenti_studio (auth_user_id) where auth_user_id is not null`

## File letti

- [supabase/migrations/20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql)
- [supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql)
- [supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql)
- [schema_v3.sql](../../schema_v3.sql)
- [schema_contabilita.sql](../../schema_contabilita.sql)
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql)
- [supabase/config.toml](../../supabase/config.toml)
- [package.json](../../package.json)
- [docs/contabilita/FINAL_COMMIT_06A8_PRIMA_NOTA_BASE_BOOTSTRAP.md](FINAL_COMMIT_06A8_PRIMA_NOTA_BASE_BOOTSTRAP.md)

## Dove compare `public.utenti_studio`

### In migration Supabase

- [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql): aggiunge `auth_user_id`, crea l’indice univoco su `public.utenti_studio(auth_user_id)` e aggiorna i record esistenti.
- [20260412130000_rls_multi_tenant_isolation.sql](../../supabase/migrations/20260412130000_rls_multi_tenant_isolation.sql): crea `public.utenti_studio_societa` con FK a `public.utenti_studio(id)`, abilita RLS e definisce policy su `public.utenti_studio`.
- [20260412153000_ai_pipeline_rls_lockdown.sql](../../supabase/migrations/20260412153000_ai_pipeline_rls_lockdown.sql): usa `public.utenti_studio` in funzioni di accesso e policy.
- [20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql): usa `public.utenti_studio(id)` come FK per `utente_id`.

### Fuori dalle migration

- [schema_v3.sql](../../schema_v3.sql): contiene `create table if not exists utenti_studio (...)` all’inizio del dump legacy/esteso.
- In [schema_contabilita.sql](../../schema_contabilita.sql) e [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql) non ho trovato la creazione diretta di `utenti_studio` nel segmento contabile letto per questa fase.

## Dove viene / non viene creata

### Viene creata nello schema legacy fuori migrations

- `schema_v3.sql` definisce `utenti_studio` come tabella legacy/di supporto per l’identità studio.

### Non viene creata nel grafo migration Supabase

- Non ho trovato una migration che faccia `create table if not exists public.utenti_studio` o `create table public.utenti_studio`.
- Le migration la trattano come prerequisito già esistente e si limitano ad aggiungere colonne, indici, trigger, policy e FK.

## Classificazione del problema

Il problema è principalmente:

- **migration mancante** nel grafo Supabase locale;
- **schema legacy non portato integralmente** nel bootstrap;
- **refactor parziale**: il nuovo assetto RLS/policy assume la presenza di `public.utenti_studio`, ma la sua creazione non è materializzata nelle migration locali.

Non sembra un semplice errore di ordine: la migration [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql) è un prerequisito logico, ma la tabella base non risulta presente da nessuna parte nel grafo.

## Risposte puntuali

1. `public.utenti_studio` viene creata da qualche migration? **No, non l’ho trovata nel grafo Supabase.**
2. `public.utenti_studio` esiste solo in schema legacy fuori migrations? **Sì, è presente in `schema_v3.sql`.**
3. La migration [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql) è fuori ordine? **È dipendente da `public.utenti_studio`, ma il problema principale resta la tabella mancante.**
4. La tabella è coerente con il modello nuovo? **Sì, è coerente con il sottosistema autenticazione/studio usato dalle migration successive.**
5. Il riferimento è legacy o coerente? **Coerente con il modello operativo dello stack, ma non materializzato nel bootstrap locale.**
6. Il problema è: **migration mancante + schema incompleto + refactor parziale**.

## Fix possibili

1. Aggiungere una migration base che materializzi `public.utenti_studio` prima di [20260412113000_auth_user_link.sql](../../supabase/migrations/20260412113000_auth_user_link.sql).
2. Verificare che la base includa anche i prerequisiti minimi per `public.utenti_studio_societa`, perché la migration RLS successiva lo usa come FK.
3. Se lo schema legacy non deve più esistere, riscrivere le migration RLS/auth in modo da non dipendere da `public.utenti_studio`.

## Fix consigliato

Fix minimo per sbloccare il bootstrap locale senza toccare il modello nuovo:

- introdurre una migration base per `public.utenti_studio` nel grafo Supabase locale, con `id` e `auth_user_id` almeno disponibili prima dell’indice unico e delle migration RLS che la referenziano.

Motivo: le migration successive assumono esplicitamente questa tabella come entità di identità/studio; senza di essa il bootstrap non può proseguire.

## Rischi

- aggiungere solo `utenti_studio` potrebbe esporre ulteriori blocker su `utenti_studio_societa` o su colonne accessorie usate dalle policy;
- una ricostruzione troppo ampia dello schema legacy rischierebbe di introdurre superfici non necessarie;
- la presenza di `schema_v3.sql` come fonte legacy non equivale alla presenza nel grafo migration locale.

## Conferme operative

- Nessun DB remoto è stato toccato.
- Nessun SQL live è stato eseguito.
- Nessuna migration è stata applicata manualmente.
- Nessun `npx supabase start` è stato rilanciato in questa fase di audit.

## Prossimo step

1. Se l’obiettivo è sbloccare il bootstrap, portare `public.utenti_studio` nel grafo migration prima delle migration che la usano.
2. Se emergono nuovi blocker dopo quello, trattarli come audit di dipendenza schema in sequenza.

## Verdetto finale

**FINAL-COMMIT-06A.9: A**

La causa è chiara: `public.utenti_studio` manca nel grafo migration locale, mentre lo schema legacy la prevede e le migration successive la usano come prerequisito. Il fix minimo è materializzare la tabella base prima dell’indice unico e delle migration RLS che la referenziano.