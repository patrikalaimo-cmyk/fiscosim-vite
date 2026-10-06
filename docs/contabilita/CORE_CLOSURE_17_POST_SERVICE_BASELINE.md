# CORE-CLOSURE-17 - Baseline operativa post-service comune

## 1. Stato generale

La baseline post-service comune e' approvata a livello tecnico: i tre moduli scriventi passano dal servizio canonico condiviso in modalita' gated/dry-run, mentre Consultazione Prima Nota resta read-only/no-write.

Non e' stato introdotto alcun commit reale definitivo. Non ci sono migration, SQL o change di API/DB introdotti in questa fase. Il perimetro resta audit + test + documentazione.

## 2. Tabella dei 4 moduli

| Modulo | Input builder | Commit service | Stato commit reale | Stato read-only | Note |
|---|---|---|---|---|---|
| Registrazione manuale | `buildManualRegistrationCommitInput` | `commitCanonicalAccountingPayload` | bloccato / gated | no | `handleMockAtomicCommit()` resta gated/dry-run; save reale non atomico ancora bloccato |
| Import Contabilita | `buildImportContabilitaCommitInput` | `commitCanonicalAccountingPayload` | bloccato / gated | no | dry-run import e commit input canonico allineati; parser/staging/working table non toccati |
| Riconciliazione bancaria | `buildReconciliationCommitInput` | `commitCanonicalAccountingPayload` | bloccato / gated | no | blocker R9A e invalid payload preservati; ignored resta senza prima nota |
| Consultazione Prima Nota | n/a | n/a | nessun write | si' | export, filtri e dettaglio restano read-only |

## 3. Verifica service comune per i 3 moduli scriventi

### Registrazione manuale

- Usa `commitCanonicalAccountingPayload`: si', nel flusso gated di verifica commit atomico.
- Usa `buildManualRegistrationCommitInput`: si'.
- Il vecchio save reale non atomico e' ancora bloccato: si', `handleSave()` continua a mostrare il blocco temporaneo.
- Esistono callsite a `createPrimaNotaCompleta` dalla UI manuale: no nel path operativo di commit; la UI usa il service comune gated.
- Esistono callsite a `createScritturaContabile`: no nel path operativo della UI manuale; resta solo il riferimento legacy noto nel servizio/guard.
- `dryRun` / `allowRealCommit` / `auditWriteEnabled` sono sicuri: si', vengono passati con `dryRun: true`, `allowRealCommit: false`, `auditWriteEnabled: false`.

### Import Contabilita

- Usa `commitCanonicalAccountingPayload`: si'.
- Usa `buildImportContabilitaCommitInput`: si'.
- Parser, staging, anagrafiche e working table non sono stati toccati: confermato.
- `runCommitWorkflow()` resta stub/preflight oppure non e' path reale: si', il flusso operativo resta di verifica/dry-run, senza commit reale.
- Esistono callsite legacy: non nel path operativo del commit; restano solo riferimenti storici/compatibilita' nel codice legacy noto.
- `dryRun` / `allowRealCommit` / `auditWriteEnabled` sono sicuri: si', `dryRun: true`, `allowRealCommit: false`, `auditWriteEnabled: false`.

### Riconciliazione bancaria

- Usa `commitCanonicalAccountingPayload`: si'.
- Usa `buildReconciliationCommitInput`: si'.
- Blocker R9A / invalid payload sono preservati: si'.
- Ignored resta gestito senza prima nota: si'.
- Guided import / template auto-learning non sono stati toccati: confermato.
- Esistono scritture dirette su `movimenti_bancari`, `prima_nota`, `partitario`, `registri_iva`: no nel path operativo; la guard finale non ha rilevato write reali nella superficie riconciliazione.
- `dryRun` / `allowRealCommit` / `auditWriteEnabled` sono sicuri: si', il wrapper forza dry-run e disabilita il commit reale.

## 4. Stato read-only consultazione

Consultazione Prima Nota resta read-only.

- I bottoni modifica/storno/apri partitario risultano disabilitati o stub.
- Il guard no-write dedicato e' presente.
- Export, filtri, ricerca e dettaglio restano in sola lettura.
- Non sono emersi write path diretti nella superficie di consultazione.

## 5. Stato commit reale

Nessun commit reale definitivo e' stato introdotto.

Il service comune rimane configurato per la baseline operativa in dry-run/gated. Il commit reale continua a essere bloccato dai guardrail e dai contract test.

## 6. Stato dry-run/gated

La baseline e' coerente su tutti e tre i moduli scriventi:

- Registrazione manuale: dry-run gated.
- Import Contabilita: dry-run gated.
- Riconciliazione bancaria: dry-run gated.

Il comportamento atteso e' allineato su hash, idempotency key, audit preview e replay.

## 7. Test eseguiti

### Canonical core

- `node scripts/dev/test-canonical-real-commit-contract.mjs` - PASS
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs` - PASS
- `node scripts/dev/test-canonical-commit-adapter.mjs` - PASS
- `node scripts/dev/test-canonical-payload-hash.mjs` - PASS

### Registrazione manuale

- `node scripts/dev/test-manual-registration-atomic-commit-contract.mjs` - PASS
- `node scripts/dev/test-manual-registration-no-unsafe-real-save.mjs` - PASS

### Import Contabilita

- `node scripts/dev/test-import-contabilita-atomic-commit-contract.mjs` - PASS
- `node scripts/dev/test-import-contabilita-no-unsafe-real-save.mjs` - PASS

### Riconciliazione bancaria

- `node scripts/dev/test-riconciliazione-matching.mjs` - PASS
- `node scripts/dev/test-riconciliazione-decisions.mjs` - PASS
- `node scripts/dev/test-riconciliazione-canonical-payload.mjs` - PASS
- `node scripts/dev/test-riconciliazione-commit-base.mjs` - PASS
- `node scripts/dev/test-riconciliazione-atomic-commit-contract.mjs` - PASS
- `node scripts/dev/test-riconciliazione-no-unsafe-real-save.mjs` - PASS

### Consultazione e legacy guard

- `node scripts/dev/test-consultazione-prima-nota-no-write.mjs` - PASS
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs` - PASS

### Test unitari selezionati

- `node --test --experimental-test-isolation=none src/modules/contabilita/application/consultazioneOperations/consultazioneOperations.test.js` - PASS
- `node --test --experimental-test-isolation=none src/modules/contabilita/application/primaNotaOperations/primaNotaOperations.test.js` - PASS

### Build

- `npm run build` - PASS

## 8. Search finale legacy / write path

### Classificazione: definizione ammessa

- `commitCanonicalAccountingPayload` in [services/canonicalAccountingCommitService.js](../../services/canonicalAccountingCommitService.js)
- `buildManualRegistrationCommitInput` in [src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js](../../src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js)
- `buildImportContabilitaCommitInput` in [src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js](../../src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js)
- `buildReconciliationCommitInput` in [src/modules/contabilita/canonical/buildReconciliationCommitInput.js](../../src/modules/contabilita/canonical/buildReconciliationCommitInput.js)
- `mockCanonicalCommitAdapter` in [src/modules/contabilita/canonical/mockCanonicalCommitAdapter.js](../../src/modules/contabilita/canonical/mockCanonicalCommitAdapter.js)

### Classificazione: uso corretto gated

- `commitCanonicalAccountingPayload` con `dryRun: true`, `allowRealCommit: false`, `auditWriteEnabled: false` nei tre flussi scriventi.
- `dryRun`, `allowRealCommit`, `auditWriteEnabled`, `payloadHash`, `idempotencyKey` nei contract test e nei panel di dry-run.

### Classificazione: test/doc ammesso

- `Verifica commit atomico` nei pannelli di verifica dry-run.
- I test `test-*-atomic-commit-contract.mjs` e `test-*-no-unsafe-real-save.mjs`.
- Le baseline doc CORE_CLOSURE_05/10/11/12 e questa baseline CORE_CLOSURE_17.

### Classificazione: legacy noto

- `createScritturaContabile(` in [src/modules/contabilita/application/scritturaContabileService.js](../../src/modules/contabilita/application/scritturaContabileService.js) come legacy noto/compatibilita'.
- `documenti_import`, `import_fatture`, `import_nuovo`, `import_unificato` come contesto storico o dominio di import, non come nuovo write path introdotto qui.
- `accounting_entries` come riferimento storico/dominio nei file legacy e nei test guard.

### Classificazione: callsite vietato

- Nessun nuovo callsite diretto a `createPrimaNotaCompleta(`, `createScritturaContabile(` o a write diretti sulle tabelle contabili e' stato introdotto in questa baseline.
- Nessuna scrittura diretta nuova su `movimenti_bancari`, `prima_nota`, `prima_nota_righe`, `partitario`, `registri_iva` e' emersa nella superficie controllata.

### Classificazione: nuovo write path

- Nessuno.

### Classificazione: nessun problema

- Consultazione Prima Nota read-only.
- I tre moduli scriventi sono allineati al service comune gated.

## 9. Cosa e' chiuso

- Registrazione manuale passa dal service comune gated.
- Import Contabilita passa dal service comune gated.
- Riconciliazione bancaria passa dal service comune gated.
- Consultazione Prima Nota resta read-only/no-write.
- Nessun commit reale definitivo e' stato introdotto.
- Nessun write legacy e' riemerso come path operativo.

## 10. Cosa non e' ancora chiuso

- Il commit reale atomico server-side non e' stato attivato in questa fase.
- Restano presenti adapter/mock e contratti di dry-run per test e regressione.
- Alcuni riferimenti legacy rimangono nel codice come compatibilita' o memoria storica, non come nuovo path operativo.

## 11. Rischi residui

- La baseline e' protetta ma ancora non operativa in commit reale.
- I contratti dry-run dipendono ancora dai test di guardrail e dalla stabilita' del common service.
- Alcuni riferimenti legacy e file di compatibilita' restano nel repository per motivi di storia del progetto, ma non sono attivi come write path.

## 12. Prossimo step consigliato

Mantenere questa baseline congelata e passare solo alla fase operativa finale con commit atomico reale, audit persistente e policy RLS definitive quando sara' approvata una fase dedicata.

## 13. Verdetto finale

**A. Baseline post-service comune approvata; i 3 moduli scriventi sono allineati al service gated e Consultazione resta read-only.**
