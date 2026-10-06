# FINAL-COMMIT-04B - Review mirata migration/RPC post-fix idempotenza

## Sintesi

Questa review verifica esclusivamente i due blocker che avevano impedito il rilascio di FINAL-COMMIT-04:

- race su `idempotency_key`;
- ambiguita' tra `dry_run` e commit reale nello stesso keyspace.

Il contratto corrente risulta riallineato: la migration reviewata usa `source_module + idempotency_key + mode`, il lookup e' mode-aware e l'inserimento audit usa `ON CONFLICT` sul keyspace composito.

Verdetto finale: **A**.

## Confronto FINAL-COMMIT-04 vs FINAL-COMMIT-05

### FINAL-COMMIT-04

- keyspace idempotente troppo stretto sul solo `idempotency_key`;
- dry-run e commit reale potevano collidere nello stesso spazio;
- race sul primo insert non governata in modo deterministico.

### FINAL-COMMIT-05

- unique composita su `source_module, idempotency_key, mode`;
- lookup/replay/conflict mode-aware;
- `ON CONFLICT` o equivalente presente per gestire la race;
- dry-run e commit separati nel keyspace;
- regressione completa verde.

## Esito blocker 1: keyspace separato

### Verifica

- La unique semplice su `idempotency_key` non governa piu' il contratto corrente reviewato.
- La unique composta su `source_module, idempotency_key, mode` esiste nella migration reviewata.
- Dry-run e commit con la stessa `idempotency_key` non confliggono perche' il `mode` fa parte della chiave logica.

### Valutazione

- **OK**: il blocker sulla separazione del keyspace e' risolto.

## Esito blocker 2: lookup mode-aware

### Verifica

- Replay cerca per `source_module + idempotency_key + mode`.
- Conflict cerca per `source_module + idempotency_key + mode`.
- Hash uguale nello stesso mode produce `replayed`.
- Hash diverso nello stesso mode produce `idempotency_conflict`.

### Valutazione

- **OK**: il blocker di ambiguita' dry-run/commit e replay/conflict e' risolto.

## Esito race handling

### Verifica

- Il primo insert audit non e' piu' solo select-before-insert.
- La migration usa `on conflict (source_module, idempotency_key, mode) do nothing`.
- Se una richiesta concorrente trova gia' il record, il flusso rilegge il record esistente.

### Valutazione

- **OK**: la race normale sul primo insert e' governata in modo deterministico.

## Esito dry-run vs commit

### Verifica

- Dry-run con key X non blocca commit con key X.
- Commit con key X non replaya il dry-run con key X.
- `dry_run` e `commit` sono spazi distinti del contratto.

### Valutazione

- **OK**: il keyspace separato evita la collisione tra preview e commit.

## Esito assenza write finali

### Verifica

- Nessun `insert into prima_nota`.
- Nessun `insert into prima_nota_righe`.
- Nessun `insert into partitario`.
- Nessun `insert into registri_iva`.
- Nessun `update movimenti_bancari`.
- Nessun `update documenti_contabilita`.
- Nessun `delete from` operativo finale.

### Valutazione

- **OK**: la migration reviewata resta senza write finali.

## Esito guard aggiornato

### Verifica

- unique composita coperta;
- unique semplice monocolonna esclusa dal guard;
- `ON CONFLICT` coperto;
- `idempotency_conflict` coperto;
- assenza write finali coperta;
- `real_commit_not_implemented` coperto;
- `security definer`, `search_path`, `grant execute` coperti.

### Valutazione

- **OK**: il guard riflette il contratto nuovo.

## Esito service/repository

### Verifica

- Lookup mode-aware nel service.
- Repository mode-aware per il lookup.
- RPC gated invariata.
- I moduli UI non espongono `useRpc: true` né `allowRealCommit: true`.

### Valutazione

- **OK**: service e repository sono coerenti con il nuovo keyspace.

## Test eseguiti

- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`
- `node scripts/dev/test-canonical-rpc-contract.mjs`
- `node scripts/dev/test-canonical-real-commit-contract.mjs`
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`
- `node scripts/dev/test-canonical-commit-adapter.mjs`
- `node scripts/dev/test-canonical-payload-hash.mjs`
- `node scripts/dev/test-manual-registration-atomic-commit-contract.mjs`
- `node scripts/dev/test-import-contabilita-atomic-commit-contract.mjs`
- `node scripts/dev/test-riconciliazione-atomic-commit-contract.mjs`
- `node scripts/dev/test-manual-registration-no-unsafe-real-save.mjs`
- `node scripts/dev/test-import-contabilita-no-unsafe-real-save.mjs`
- `node scripts/dev/test-riconciliazione-no-unsafe-real-save.mjs`
- `node scripts/dev/test-consultazione-prima-nota-no-write.mjs`
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs`
- `npm run build`

Tutti i controlli risultano verdi.

## Search finale

- `unique(idempotency_key)`: presente solo in draft/legacy fuori perimetro, non nel contratto reviewato.
- `unique(source_module, idempotency_key, mode)`: presente nella migration reviewata.
- `source_module, idempotency_key, mode`: presente in migration, service, repository e guard.
- `on conflict`: presente come handling di race.
- `idempotency_conflict`: presente come esito conflittuale nello stesso mode.
- `replayed`: presente come esito di replay deterministico.
- `dry_run`: presente come mode separato.
- `commit`: presente come mode separato.
- `real_commit_not_implemented`: presente.
- `insert into prima_nota`, `insert into prima_nota_righe`, `insert into partitario`, `insert into registri_iva`, `update movimenti_bancari`, `update documenti_contabilita`, `delete from`: assenti correttamente dal contratto reviewato.
- `allow_all`: presente solo in legacy/documentazione fuori perimetro.
- `security definer`, `search_path`, `grant execute`: presenti.
- `callCommitCanonicalAccountingPayloadRpc`, `useRpc`, `allowRealCommit`: presenti nel service/repository/test, ma gated.

## Stato finale

- Migration non applicata: **si'**.
- SQL live non eseguito: **si'**.
- UI non collegata: **si'**.

## Verdetto FINAL-COMMIT-04B

- **A**: migration/RPC pronta per applicazione controllata.

## Prossimo step

- FINAL-COMMIT-06: applicazione controllata della migration in ambiente autorizzato.