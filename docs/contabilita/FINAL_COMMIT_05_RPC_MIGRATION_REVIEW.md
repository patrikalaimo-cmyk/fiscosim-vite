# FINAL-COMMIT-05 - Review del contratto idempotente RPC

## Sintesi

La migration `supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql`, la RPC `commit_canonical_accounting_payload` e i relativi guard/test sono stati riallineati per correggere i due blocker emersi nella review precedente:

- concorrenza su `idempotency_key`;
- ambiguita' tra `dry_run` e commit reale nello stesso keyspace.

Il keyspace idempotente e' ora trattato come composto da `source_module`, `idempotency_key` e `mode`.

Verdetto finale: **B. review-ready con gap intenzionale residuo**.

Motivo: il contratto idempotente e' stato corretto e validato, ma il commit reale resta esplicitamente non implementato e la migration non e' stata applicata.

## File rilevanti

- [supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql)
- [services/canonicalAccountingCommitService.js](../../services/canonicalAccountingCommitService.js)
- [services/canonicalAccountingCommitRepository.js](../../services/canonicalAccountingCommitRepository.js)
- [scripts/dev/test-canonical-rpc-migration-guard.mjs](../../scripts/dev/test-canonical-rpc-migration-guard.mjs)
- [scripts/dev/test-canonical-rpc-contract.mjs](../../scripts/dev/test-canonical-rpc-contract.mjs)
- [docs/contabilita/FINAL_COMMIT_04_RPC_MIGRATION_REVIEW.md](FINAL_COMMIT_04_RPC_MIGRATION_REVIEW.md)

## Esito correzione keyspace

### Verifica

- Unique composita sulla tabella audit: presente su `source_module`, `idempotency_key`, `mode`.
- Lookup idempotente: mode-aware.
- Dry-run e commit: separati nel contratto di lookup.
- Inserimento audit: reso compatibile con conflitti sul keyspace composito.

### Valutazione

- **OK**: la race sul solo `idempotency_key` e' stata chiusa a livello di contratto.
- **OK**: dry-run e commit non condividono piu' lo stesso spazio logico di idempotenza.

## Esito guard/test

### Verifica

- Guard migration aggiornato per la unique composita.
- Guard migration aggiornato per `on conflict (source_module, idempotency_key, mode) do nothing`.
- Contract test aggiornato per verificare lookup `dry_run` e `commit` separati.

### Valutazione

- **OK**: il nuovo contratto e' verificato anche lato test.

## Residuo intenzionale

- Il commit reale resta bloccato dal contratto corrente.
- Nessuna migration e' stata applicata.
- Nessun SQL live e' stato eseguito.

## Regresione eseguita

- `node scripts/dev/test-canonical-rpc-migration-guard.mjs`
- `node scripts/dev/test-canonical-rpc-contract.mjs`
- `node scripts/dev/test-canonical-real-commit-contract.mjs`
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`
- `node scripts/dev/test-canonical-commit-adapter.mjs`
- `npm run build`

Tutti i controlli eseguiti sono passati.

## Classificazione finale

- **C** della review precedente: superato.
- **B** attuale: contratto review-ready e validato, con commit reale ancora intenzionalmente non attivo.

## Esito FINAL-COMMIT-05B

### Test completi eseguiti

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

Tutti i controlli sono passati.

### Search finale

- `unique(idempotency_key)`: presente solo nei file legacy/draft, non nel contratto corrente reviewato.
- `unique(source_module, idempotency_key, mode)`: presente nella migration corrente e nel guard.
- `source_module, idempotency_key, mode`: presente nel contratto corrente di migration/service/repository/test.
- `on conflict`: presente come handling di race sul keyspace composito.
- `idempotency_conflict`: presente nel contratto corrente per replay/conflict nello stesso mode.
- `replayed`: presente nel contratto corrente per replay deterministico.
- `dry_run`: presente nel contratto corrente come mode separato.
- `commit`: presente nel contratto corrente come mode separato.
- `real_commit_not_implemented`: presente nella migration reviewata e nel guard.
- `insert into prima_nota`, `insert into prima_nota_righe`, `insert into partitario`, `insert into registri_iva`, `update movimenti_bancari`, `update documenti_contabilita`: assenti correttamente nel contratto reviewato; i match trovati altrove restano legacy o test/smoke preesistenti fuori dal perimetro di FINAL-COMMIT-05.
- `allow_all`: presente in schema legacy/documentazione fuori perimetro, non nella migration reviewata.
- `security definer`, `search_path`, `grant execute`: presenti nella migration reviewata.
- `callCommitCanonicalAccountingPayloadRpc`, `useRpc`, `allowRealCommit`: presenti nel service/repository e nei test di contratto.
- `accounting_entries`, `createScritturaContabile`, `createPrimaNotaCompleta`, `import_fatture`, `import_nuovo`, `import_unificato`: legacy noto o documentazione/esercizi storici fuori perimetro del fix idempotenza.

### Verifiche specifiche

1. La unique semplice su `idempotency_key` e' sparita dal contratto corrente reviewato: **si'**.
2. La unique composta su `source_module, idempotency_key, mode` esiste: **si'**.
3. Il lookup/replay/conflict e' mode-aware: **si'**.
4. Esiste `ON CONFLICT` o equivalente per gestire race: **si'**.
5. Dry-run e commit con stessa key non confliggono: **si'**.
6. Conflict avviene solo nello stesso mode con hash diverso: **si'**.
7. Non sono stati introdotti write finali: **si'**.
8. La migration resta non applicata: **si'**.
9. SQL live non eseguito: **si'**.
10. UI non collegata: **si'**.
11. Build verde: **si'**.

### Verdetto definitivo

- **A**: blocker risolti, regressione completa verde, search finale coerente, nessun write finale introdotto.

### Prossimo step consigliato

- Se si vuole procedere oltre, il passo successivo e' FINAL-COMMIT-04B / applicazione controllata della migration in un ambiente autorizzato.