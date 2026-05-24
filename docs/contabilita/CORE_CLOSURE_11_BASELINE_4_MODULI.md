# CORE-CLOSURE-11 - Baseline finale dei 4 moduli motore

## 1. Stato generale

I quattro moduli motore contabili sono tecnicamente stabilizzati come baseline protetta.
Non sono ancora la chiusura operativa definitiva, perche' il commit atomico reale server-side non e' ancora disponibile.

La baseline attuale copre tre livelli distinti:
- Registrazione manuale: mock/dry-run atomico attivo, save reale non atomico bloccato.
- Import Contabilita: payload e input commit canonici pronti, dry-run attivo, commit reale non introdotto.
- Riconciliazione bancaria: matching, decisione, payload canonico e input commit presenti, commit reale non introdotto.
- Consultazione Prima Nota: read-only confermato, con guard no-write dedicato.

## 2. Tabella dei 4 moduli

| Modulo | Stato tecnico | Blocco intenzionale | Mock / dry-run | Read-only | Legacy / compatibilita' |
|---|---|---|---|---|---|
| Registrazione manuale | commit input canonico presente e agganciato al mock | save reale non atomico bloccato fino alla RPC reale | si', tramite `commitCanonicalAccountingPayloadMock` | no | `createScritturaContabile` resta come legacy noto/compatibile in service e guardato |
| Import Contabilita | commit input canonico presente | commit reale non introdotto, parser/staging/workflow non alterati | si', verificato nel working view | no | `documenti_import` e `import_fatture` restano come contesto/legacy noto, non come nuovo write path |
| Riconciliazione bancaria | matching/decision/payload/input commit presenti | commit reale e write diretti bloccati fino alla RPC atomica reale | si', tramite dry-run/commit mock sui contratti | no | `movimenti_bancari` e altre primitive restano come riferimenti di dominio e compatibilita' dove documentato |
| Consultazione Prima Nota | view consolidata read-only | edit/delete/storno/commit bloccati o stub | no commit, solo export/query | si' | path write legacy non ammessi nel modulo, solo eventuali riferimenti documentali o di compatibilita' altrove |

## 3. Stato commit atomico

Il contratto comune e' consolidato a livello tecnico:
- hash canonico deterministico disponibile;
- adapter mock del commit atomico disponibile;
- idempotency key costruite nei tre moduli operativi;
- i retry e i doppio click sono coperti dal contratto mock/contract test.

Restano fuori dal perimetro di questa baseline:
- RPC reale;
- audit persistente server-side;
- RLS definitiva;
- write finale atomico in produzione.

## 4. Stato mock / dry-run

Il mock/dry-run e' presente e stabile nei moduli che lo richiedono:
- Registrazione manuale usa il commit mock per verificare il flusso atomico guidato.
- Import Contabilita costruisce il commit input e lo passa al mock per la verifica dry-run.
- Riconciliazione bancaria usa il contratto canonico e il mock per la validazione del percorso atomico.

Questo livello prova il contratto, ma non abilita il commit reale.

## 5. Stato read-only consultazione

Consultazione Prima Nota e' confermata read-only:
- export, ricerca, filtri e dettaglio restano operativi;
- Modifica, Storna e Apri partitario risultano disabilitati o stub;
- il guard statico no-write e' presente;
- non sono stati introdotti write path diretti nel modulo.

## 6. Test eseguiti e risultati

Suite finale eseguita con esito positivo:

- `node scripts/dev/test-canonical-payload-hash.mjs` - PASS 12/12
- `node scripts/dev/test-canonical-commit-adapter.mjs` - PASS 20/20
- `node scripts/dev/test-manual-registration-atomic-commit-contract.mjs` - PASS 12/12
- `node scripts/dev/test-manual-registration-no-unsafe-real-save.mjs` - PASS
- `node scripts/dev/test-import-contabilita-atomic-commit-contract.mjs` - PASS 13/13
- `node scripts/dev/test-import-contabilita-no-unsafe-real-save.mjs` - PASS
- `node scripts/dev/test-riconciliazione-matching.mjs` - PASS 16/16
- `node scripts/dev/test-riconciliazione-decisions.mjs` - PASS 80/80
- `node scripts/dev/test-riconciliazione-canonical-payload.mjs` - PASS 16/16
- `node scripts/dev/test-riconciliazione-commit-base.mjs` - PASS 16/16
- `node scripts/dev/test-riconciliazione-atomic-commit-contract.mjs` - PASS 16/16
- `node scripts/dev/test-riconciliazione-no-unsafe-real-save.mjs` - PASS
- `node scripts/dev/test-consultazione-prima-nota-no-write.mjs` - PASS
- `node scripts/dev/test-no-legacy-scrittura-contabile-callsite.mjs` - PASS
- `node --test --experimental-test-isolation=none src/modules/contabilita/application/consultazioneOperations/consultazioneOperations.test.js` - PASS 7/7
- `node --test --experimental-test-isolation=none src/modules/contabilita/application/primaNotaOperations/primaNotaOperations.test.js` - PASS 3/3
- `npm run build` - PASS con solo warning sui chunk grandi

## 7. Search legacy / write path

La search finale distingue tra definizioni ammesse, documentazione e callsite vietati.

### Definizioni ammesse / contratti noti
- `commitCanonicalAccountingPayloadMock` in `src/modules/contabilita/canonical/mockCanonicalCommitAdapter.js`
- `buildManualRegistrationCommitInput` in `src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js`
- `buildImportContabilitaCommitInput` in `src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js`
- `buildReconciliationCommitInput` in `src/modules/contabilita/canonical/buildReconciliationCommitInput.js`
- `Consultazione Prima Nota è read-only` in `src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx`

### Test / doc ammessi
- `scripts/dev/test-manual-registration-no-unsafe-real-save.mjs`
- `scripts/dev/test-import-contabilita-no-unsafe-real-save.mjs`
- `scripts/dev/test-riconciliazione-no-unsafe-real-save.mjs`
- `scripts/dev/test-consultazione-prima-nota-no-write.mjs`
- `docs/contabilita/CORE_CLOSURE_10_CONSULTAZIONE_READ_ONLY_GUARD.md`
- `docs/contabilita/CORE_CLOSURE_02_COMMIT_ATOMICO_SPEC.md`
- `docs/contabilita/CORE_CLOSURE_03_SQL_RPC_NOTES.md`
- `docs/contabilita/CORE_CLOSURE_04_HASH_CONTRACT_NOTE.md`
- `docs/contabilita/CORE_CLOSURE_05_COMMIT_ADAPTER_CONTRACT.md`

### Legacy noto / compatibilita'
- `createScritturaContabile` resta presente in `src/modules/contabilita/application/scritturaContabileService.js` come legacy noto e guardato.
- `documenti_import`, `import_fatture`, `import_nuovo`, `import_unificato`, `accounting_entries` e `movimenti_bancari` compaiono in documentazione, adapter mock, workflow legacy o repository esistenti; non equivalgono a un nuovo write path introdotto in questa baseline.

### Callsite vietati / nuovo write path
- nessun nuovo callsite reale di commit e' stato introdotto in questa fase;
- nessun DB/API/SQL/migration e' stato aggiunto;
- nessun commit reale atomico e' stato collegato.

## 8. Cosa e' tecnicamente chiuso

- il contratto canonico e l'hash deterministico sono chiusi a livello tecnico;
- il mock commit atomico e i guard no-write sono chiusi;
- la registrazione manuale non puo' riaprire il save reale non atomico senza passare dal controllo dedicato;
- Import Contabilita e Riconciliazione restano allineati al contratto canonico e non hanno commit reale introdotto;
- Consultazione Prima Nota e' consolidata come read-only.

## 9. Cosa resta bloccato intenzionalmente

- commit reale server-side;
- audit persistente definitivo;
- RLS definitiva;
- rollback reale end-to-end su RPC;
- write finale diretto dal client;
- riattivazione dei path legacy come canale operativo primario.

## 10. Cosa non e' ancora gestionale finale

Non e' ancora gestionale finale al 100% perche' manca la RPC/funzione atomica reale con audit persistente e politiche definitive. La baseline e' protetta e coerente, ma rimane una chiusura tecnica pre-operativa.

## 11. Rischi residui

- la UI completa di Consultazione Prima Nota non e' stata confermata in browser in modo stabile nella sessione precedente per instabilita' di auth/backend;
- il commit reale rimane assente, quindi la validazione finale operativa dipende ancora dalla futura RPC atomica;
- alcuni riferimenti legacy restano nel codice e nella documentazione come compatibilita' o tracciamento storico.

## 12. Prossimo step consigliato

Preparare la fase operativa finale sulla RPC atomica reale con audit persistente e RLS definitiva, mantenendo invariata la baseline protetta fino a quel passaggio.

## 13. Verdetto

**B. 4 moduli tecnicamente chiusi come baseline protetta; resta fase operativa finale su RPC/commit reale.**