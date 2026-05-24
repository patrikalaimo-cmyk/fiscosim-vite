# FINAL-COMMIT-04 - Review controllata della migration/RPC

## Sintesi

La migration `supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql` e la RPC `commit_canonical_accounting_payload` sono state revisionate in modo severo prima di ogni applicazione.

Verdetto finale: **C. non pronta**.

Motivo principale: la base SQL e' coerente come skeleton review-ready, ma restano blocker di design e di robustezza sul contratto idempotente server-side. In particolare, il flusso non e' ancora sufficientemente solido contro la concorrenza sull'audit e il contratto di idempotenza/dry-run non e' ancora chiuso per un futuro reale commit senza ambiguita'.

## File letti

- [supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql)
- [services/canonicalAccountingCommitService.js](../../services/canonicalAccountingCommitService.js)
- [services/canonicalAccountingCommitRepository.js](../../services/canonicalAccountingCommitRepository.js)
- [scripts/dev/test-canonical-rpc-migration-guard.mjs](../../scripts/dev/test-canonical-rpc-migration-guard.mjs)
- [scripts/dev/test-canonical-rpc-contract.mjs](../../scripts/dev/test-canonical-rpc-contract.mjs)
- [docs/contabilita/CORE_CLOSURE_02_COMMIT_ATOMICO_SPEC.md](CORE_CLOSURE_02_COMMIT_ATOMICO_SPEC.md)
- [docs/contabilita/CORE_CLOSURE_03_SQL_RPC_NOTES.md](CORE_CLOSURE_03_SQL_RPC_NOTES.md)
- [docs/contabilita/CORE_CLOSURE_17_POST_SERVICE_BASELINE.md](CORE_CLOSURE_17_POST_SERVICE_BASELINE.md)
- [docs/contabilita/CORE_CLOSURE_12_FUNCTIONAL_GAP_ADVANCED.md](CORE_CLOSURE_12_FUNCTIONAL_GAP_ADVANCED.md)
- [schema_contabilita.sql](../../schema_contabilita.sql)
- [schema_contabilita_completo.sql](../../schema_contabilita_completo.sql)
- [schema_banche.sql](../../schema_banche.sql)
- [supabase/migrations](../../supabase/migrations)

## File modificati o creati

- Modificato: [scripts/dev/test-canonical-rpc-migration-guard.mjs](../../scripts/dev/test-canonical-rpc-migration-guard.mjs)
- Creato: [docs/contabilita/FINAL_COMMIT_04_RPC_MIGRATION_REVIEW.md](FINAL_COMMIT_04_RPC_MIGRATION_REVIEW.md)

## Audit estensioni

### Esito

- `pgcrypto` e' coerente con `gen_random_uuid()` e con il resto dello schema.
- Non emergono conflitti evidenti con estensioni gia' presenti nel repository.

### Valutazione

- **OK**: l'estensione necessaria e' quella attesa per l'UUID default.
- **WARNING**: la migration non documenta esplicitamente l'eventuale dipendenza dal contesto Supabase, ma questo non blocca la review.

## Audit tabella audit

### Verifica

- Nome tabella: `canonical_accounting_commit_audit`.
- Colonne: `id`, `societa_id`, `esercizio_id`, `utente_id`, `source_module`, `source_document_id`, `idempotency_key`, `payload_hash`, `mode`, `status`, `payload_snapshot`, `result_snapshot`, `created_ids`, `warnings`, `blockers`, `error_code`, `error_message`, `created_at`, `committed_at`.
- Tipi: coerenti nel complesso con il contratto review-ready.
- Default: presenti su `id`, `created_ids`, `warnings`, `blockers`, `created_at`.
- Vincoli: unique su `idempotency_key`; check su `source_module`, `mode`, `status`.
- Indici: presenti su `societa_id/esercizio_id`, `source_module/source_document_id`, `status`, `created_at`, `payload_hash`.
- JSONB default: presenti e coerenti.

### Valutazione

- **OK**: la tabella audit e' leggibile e coerente con lo skeleton RPC.
- **WARNING**: mancano alcuni campi di arricchimento previsti nella spec iniziale (`payload_id`, `payload_version`, `updated_at`, snapshot di tenant scope, request id). Non bloccano il prototipo review-ready, ma riducono la completezza rispetto alla specifica funzionale iniziale.

## Audit RLS/grant

### Verifica

- RLS abilitata: si'.
- Nessuna policy `allow_all`: si'.
- Revoca permessi sulla tabella da `public`, `anon`, `authenticated`: si'.
- La funzione e' `security definer` con `search_path` esplicito.
- La RPC e' esposta tramite `grant execute`.

### Valutazione

- **OK**: non ci sono policy permissive o aperture ovvie verso il client anonimo.
- **WARNING**: il contratto di accesso server-side va mantenuto allineato al client backend reale usato in repository; la tabella audit non deve diventare leggibile lato browser.
- **WARNING**: la review non ha trovato un grant esplicito per la lettura diretta della tabella audit, quindi il backend deve passare dal client server-side corretto oppure la migration va allineata con i permessi attesi prima della produzione.

## Audit firma RPC

### Verifica

- Nome funzione: `commit_canonical_accounting_payload`.
- Parametri: `p_societa_id`, `p_esercizio_id`, `p_utente_id`, `p_source_module`, `p_source_document_id`, `p_idempotency_key`, `p_payload_hash`, `p_canonical_payload`, `p_options`.
- Tipo di ritorno: `jsonb`.
- Coerenza con repository: allineata con `callCommitCanonicalAccountingPayloadRpc`.
- Coerenza con service: allineata con `commitCanonicalAccountingPayload`.

### Valutazione

- **OK**: la firma e' coerente con il livello JS.

## Audit idempotenza

### Verifica

- Lookup su `idempotency_key`: presente.
- Replay stesso hash: presente.
- Conflict hash diverso: presente con `idempotency_conflict`.
- Status replay: presente.
- Result snapshot restituito: presente.

### Blocchi / rischi

- **BLOCKER**: il flusso usa select-first + insert senza una protezione esplicita contro la race tra due chiamate concorrenti con la stessa `idempotency_key`. In caso di doppio click o retry parallelo, il sistema puo' ancora produrre un `unique_violation` non classificato invece di un replay deterministico.
- **BLOCKER**: il contratto attuale consuma `idempotency_key` anche sul dry-run; per un futuro reale commit bisogna chiarire se il preview deve o no condividere la stessa chiave della scrittura finale. Con la forma attuale il replay del preview puo' bloccare o sostituire un commit reale futuro sullo stesso key-space.

## Audit payload hash

### Verifica

- Obbligatorieta': presente.
- Confronto: presente.
- Nessun calcolo SQL interno: corretto; l'hash e' atteso dal chiamante.
- Coerenza con JS: coerente con il service che calcola il payload hash lato applicazione.

### Valutazione

- **OK**: il modello e' quello giusto per il contratto corrente.
- **WARNING**: senza un controllo server-side ulteriore il valore puo' essere spoofato dal chiamante. Il rischio e' accettabile solo se l'esecuzione reale e' limitata al backend server-side e il payload e' gia' validato a monte.

## Audit dry-run

### Verifica

- Il dry-run scrive audit: si'.
- `createdIds` vuoto: si'.
- No final write: si'.
- Replay dry-run: si', tramite idempotency lookup.

### Valutazione

- **OK**: il dry-run non scrive sulle tabelle finali.
- **WARNING**: l'accumulo audit su dry-run e' intenzionale ma deve restare controllato da policy di retention e da chiavi idempotenti ben definite.

## Audit allowRealCommit false

### Verifica

- Blocco sempre: si'.
- Scrive audit blocked: si'.
- Blocker chiaro: `real_commit_disabled` / `commit_path_todo`.
- No final write: si'.

### Valutazione

- **OK**: la migration non apre il commit reale.

## Audit real_commit_not_implemented

### Verifica

- Il commit reale resta bloccato: si'.
- Non esistono `insert/update/delete` finali nella migration reviewata: corretto.
- TODO transazionali chiari: presenti nei commenti.

### Valutazione

- **OK**: il placeholder e' esplicito e non ambiguo.

## Audit legacy guard

### Verifica

- `accounting_entries`: bloccato.
- `createScritturaContabile`: bloccato.
- `createPrimaNotaCompleta`: bloccato.
- `documenti_import` come archivio finale: bloccato.
- `import_fatture`, `import_nuovo`, `import_unificato`: bloccati come reference legacy/source path.

### Valutazione

- **OK**: i marker legacy principali sono presidiate.

## Audit tenant scope

### Verifica

- `societa_id` obbligatoria: si'.
- `esercizio_id` obbligatorio: si'.
- `source_document_id` obbligatorio: si'.
- Coerenza minima con payload: presente.
- Rischio cross-company: mitigato, ma dipende dal tipo di client che invoca la RPC.

### Valutazione

- **WARNING**: il controllo tenant e' solido come prima barriera, ma il futuro path reale deve restare server-side e mai esposto direttamente al browser.

## Audit assenza write finali

### Verifica

- Nessun `insert into prima_nota`: corretto.
- Nessun `insert into prima_nota_righe`: corretto.
- Nessun `insert into partitario`: corretto.
- Nessun `insert into registri_iva`: corretto.
- Nessun `update movimenti_bancari`: corretto.
- Nessun `update documenti_contabilita`: corretto.
- Nessun `delete`: non presente come path operativo finale.

### Valutazione

- **OK**: il file reviewato non introduce write finali.

## Audit error handling

### Verifica

- Il fallback di validazione ritorna `blocked` con blockers espliciti.
- Dry-run e commit bloccato hanno snapshot di risultato persistito.
- Non c'e' un blocco `exception` generale per rendere atomiche e classificate tutte le collisioni di audit.

### Valutazione

- **WARNING**: l'errore non gestito sulla collisione di chiave resta il punto piu' fragile.
- **BLOCKER**: per una RPC idempotente di commit, questo non e' abbastanza robusto contro concorrenza e retry paralleli.

## Audit compatibilita Postgres/Supabase

### Verifica

- Sintassi PostgreSQL: coerente.
- `create function`: corretta.
- Dollar quoting: corretto.
- Operazioni `jsonb`: corrette.
- `if not exists`: presente dove serve.
- `grant execute` sulla RPC: presente.
- `search_path`: presente e ristretto.
- `security definer`: presente.

### Valutazione

- **OK**: la migration e' compatibile come skeleton SQL.
- **WARNING**: `security definer` richiede disciplina severa sui permessi e sui controlli di tenancy.

## Migliorie applicate

- Rafforzato il guard di review per verificare `security definer`, `search_path`, revoche e grant della RPC.

## Esito migration guard

- Esito atteso dopo l'aggiornamento: copre meglio il perimetro di sicurezza della migration reviewata.
- Nota: il guard resta uno strumento di coerenza testuale, non sostituisce una review architetturale su idempotenza e strategia di preview/commit.

## Esito regressione completa

Non eseguita in questa sessione dopo la review del file SQL, perché la fase corrente e' solo di audit controllato e non di applicazione.

## Esito build

Non rieseguita dopo la review del file SQL in questa sessione.

## Search finale e classificazione

### OK / previsto

- `security definer`
- `search_path`
- `grant execute`
- `commit_canonical_accounting_payload`
- `canonical_accounting_commit_audit`
- `idempotency_key`
- `payload_hash`
- `real_commit_not_implemented`
- `accounting_entries`
- `createScritturaContabile`
- `createPrimaNotaCompleta`
- `import_fatture`
- `import_nuovo`
- `import_unificato`

### WARNING / richiede controllo

- `allow_all` assente dalla migration reviewata, ma va mantenuta assenza anche in eventuali migrazioni future.
- `grant execute` va mantenuto lato server-side e non lato browser.
- `idempotency_key` unica va verificata contro i retry concorrenti e contro la politica dry-run/commit.

### BLOCKER

- Assenza di protezione esplicita contro la race di inserimento audit con stessa `idempotency_key`.
- Ambiguita' residua tra dry-run persistito e futuro commit reale sullo stesso key-space.

## Conferme esplicite

- Migration non applicata: confermato.
- SQL non eseguito: confermato.
- UI non collegata: confermato.

## Verdetto finale

**C. non pronta**.

## Prossimo step consigliato

1. Chiarire il contratto di idempotenza tra dry-run e commit reale.
2. Rendere la scrittura audit resistente alla concorrenza con gestione esplicita della race sulla `idempotency_key`.
3. Solo dopo, rieseguire la review e rivalutare se la migration diventa A o B.