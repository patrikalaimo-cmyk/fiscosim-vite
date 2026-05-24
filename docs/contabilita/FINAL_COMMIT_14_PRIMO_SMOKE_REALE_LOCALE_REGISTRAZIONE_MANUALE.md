# FINAL-COMMIT-14 - Perimetro tecnico primo smoke reale locale: Registrazione manuale

## Scopo

Definire il perimetro tecnico minimo del primo smoke reale locale della Registrazione manuale, senza eseguire alcun commit reale e senza scrivere dati.

## Baseline di partenza

- [FINAL_COMMIT_13_ROADMAP_CHIUSURA_MODULI_CORE.md](FINAL_COMMIT_13_ROADMAP_CHIUSURA_MODULI_CORE.md) non presente nel workspace al momento della verifica.
- [FINAL_COMMIT_12_AUDIT_CRITICITA_RESIDUE_POST_DEMO_UI.md](FINAL_COMMIT_12_AUDIT_CRITICITA_RESIDUE_POST_DEMO_UI.md)
- [FINAL_COMMIT_10_LOCAL_SEED_AUTH_SOCIETA.md](FINAL_COMMIT_10_LOCAL_SEED_AUTH_SOCIETA.md)
- [FINAL_COMMIT_07_LOCAL_APP_NO_WRITE_TEST_BASELINE.md](FINAL_COMMIT_07_LOCAL_APP_NO_WRITE_TEST_BASELINE.md)

## Esito tecnico sintetico

La Registrazione manuale è il primo candidato corretto per un futuro smoke reale locale controllato, ma **non è ancora autorizzabile come reale** perché la catena canonica attuale è ancora bloccata da `allowRealCommit: false`, e il repository richiede `useRpc: true` per qualsiasi commit reale.

La migration RPC review-ready conferma inoltre che il commit reale è ancora dichiarato come non implementato:

- `real_commit_not_implemented`
- `real_commit_disabled`
- `commit_path_todo`

## Scenario ammesso per primo smoke

Scenario minimo ammesso:

- movimento semplice non IVA;
- due righe;
- dare su conto patrimoniale/costo generico;
- avere su conto patrimoniale/cassa/banca generico;
- importo uguale;
- nessun documento;
- nessuna IVA;
- nessun partitario;
- nessuna ritenuta;
- nessun cliente/fornitore obbligatorio;
- nessun `documenti_contabilita`;
- nessun `documenti_import`;
- nessun movimento bancario.

## Payload ammesso

### Input minimo richiesto dal commit canonico

Dal service canonico in [services/canonicalAccountingCommitService.js](../../services/canonicalAccountingCommitService.js):

- `societaId`
- `esercizioId`
- `utenteId`
- `sourceModule`
- `sourceDocumentId`
- `idempotencyKey`
- `canonicalPayload`

### Payload canonico manuale

Il builder manuale in [src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js](../../src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js) produce un payload già canonico con:

- `schemaVersion: 'core-closure-06-manual-1'`
- `sourceModule: 'registrazione_manual'`
- `source.company.societaId`
- `source.company.esercizioId`
- `header`
- `document`
- `accounting.rows`
- `primaNotaRighe`
- `partitarioMovements`
- `subjects`
- `validation`
- `postCommitTargets`
- `ledger.enabled = false`

Per il primo smoke reale locale, il sottoinsieme ammissibile deve essere ridotto a:

- `shouldCreatePrimaNota = true`
- `shouldCreateIva = false`
- `shouldCreateLedger = false`
- `shouldCreateDocumentiContabilita = false`
- `shouldUpdateAuditTrail = true`

## Trovabilità del commit reale oggi

### Service

Il service in [services/canonicalAccountingCommitService.js](../../services/canonicalAccountingCommitService.js):

- blocca il reale se `allowRealCommit !== true`;
- blocca il reale se `allowRealCommit === true` ma `useRpc !== true`;
- in dry-run produce preview/audit senza write finale;
- non espone alcuna scrittura diretta alle tabelle finali.

### Repository

Il repository in [services/canonicalAccountingCommitRepository.js](../../services/canonicalAccountingCommitRepository.js):

- ritorna `rpc_not_enabled` se `useRpc !== true`;
- consente la chiamata RPC solo con `useRpc: true`;
- mantiene l’audit write gated da `allowRealWrites`.

### RPC locale

La migration in [supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql) definisce la funzione RPC `public.commit_canonical_accounting_payload`, ma oggi:

- `allowRealCommit` resta bloccato;
- il ramo reale termina con `real_commit_not_implemented`;
- il commento SQL dichiara esplicitamente che il commit reale resta bloccato per scelta.

Conclusione: **il primo smoke reale locale non è ancora implementabile oggi**, se per “reale” si intende vera scrittura finale. È invece già possibile fare solo preview/dry-run o audit persistente.

## Tabelle toccabili nel primo smoke reale futuro

Se e quando il commit reale verrà abilitato, il primo scenario manuale semplice dovrebbe toccare solo:

- [prima_nota](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql)
- [prima_nota_righe](../../supabase/migrations/20260404190000_prima_nota_base_bootstrap.sql)
- [canonical_accounting_commit_audit](../../supabase/migrations/20260508140000_core_commit_canonical_accounting_payload.sql)

Eventualmente, solo se il payload contiene IVA:

- [registri_iva](../../supabase/migrations/20260403150000_registri_iva.sql)

## Tabelle vietate nel primo smoke

Devono restare fuori dal primo smoke reale locale:

- `documenti_contabilita`
- `documenti_import`
- `partitario`
- tabelle bancarie
- memoria AI
- qualunque target di riconciliazione
- qualunque target import-staging

## Controlli pre-commit obbligatori

### Contabili

- quadratura totale Dare/Avere;
- presenza di almeno una riga Dare e una riga Avere;
- importo coerente;
- conto presente per ogni riga;
- data registrazione valida;
- esercizio coerente con la data;
- sorgente manuale coerente con `sourceModule`;
- nessun dato legacy o fuori perimetro.

### Fiscali

- nessuna IVA per il primo smoke;
- nessuna ritenuta;
- nessuna casistica professionista/reverse/split payment;
- nessun cliente/fornitore obbligatorio;
- nessuna generazione di registri fiscali ulteriori;
- nessuna dipendenza da documento esterno.

### Tecnici

- `allowRealCommit: true` deve essere abilitato solo in fase dedicata;
- `useRpc: true` deve essere abilitato solo in fase dedicata;
- idempotency key obbligatoria;
- source module obbligatorio e coerente;
- tenant scope coerente;
- no legacy references.

## Controlli post-commit obbligatori

Se il primo smoke reale verrà autorizzato, dovranno essere verificati almeno:

- ritorno `committed` o replay idempotente;
- presenza di audit persistente;
- presenza delle sole righe previste in `prima_nota` e `prima_nota_righe`;
- assenza di side effect non previsti;
- nessun inserimento in `documenti_contabilita`;
- nessun inserimento in `documenti_import`;
- nessun side effect bancario;
- rollback completo riuscito su DB locale.

## Rollback / cleanup locale

Per il primo smoke reale locale il rollback minimo dovrà cancellare, nell’ordine inverso di creazione:

1. `prima_nota_righe`
2. `prima_nota`
3. eventuali `registri_iva`
4. `canonical_accounting_commit_audit` solo se il test di persistenza audit lo richiede e il cleanup è autorizzato

Devono restare intatti:

- seed auth/società;
- tabelle demo e baseline;
- dati di test non collegati allo smoke.

## Test richiesti prima di `allowRealCommit: true`

Devono esistere e passare almeno:

- test di contratto del manual commit canonico;
- test no-unsafe-write;
- test di replay idempotente;
- test di mismatch tenant/sourceModule;
- test di validazione payload mancante;
- test di rollback locale;
- smoke test controllato su DB locale disposable o snapshot dedicata.

Test già verdi verificati durante l’audit:

- `node scripts/dev/test-manual-registration-atomic-commit-contract.mjs`
- `node scripts/dev/test-manual-registration-no-unsafe-real-save.mjs`
- `node scripts/dev/test-canonical-real-commit-contract.mjs`
- `node scripts/dev/test-canonical-real-commit-no-unsafe-write.mjs`

## Dove va attivato il commit reale

Il commit reale deve essere attivato in questo ordine:

1. **service**: via flag espliciti `allowRealCommit` e `useRpc`;
2. **repository**: con RPC locale abilitata e audit/write consentiti;
3. **script dev controllato**: come primo entrypoint operativo;
4. **UI**: solo dopo che il percorso script dev è stato validato.

La UI non deve essere il primo punto di attivazione del commit reale.

## Cosa resta in dry-run

Devono restare in dry-run fino a nuova decisione:

- Import Contabilità;
- Riconciliazione bancaria;
- Consultazione Prima Nota;
- qualunque percorso manuale con documenti/IVA/ledger attivi;
- qualunque percorso che tocchi `documenti_contabilita` o tabelle bancarie.

## Classificazione A/B/C

### Registrazione manuale

**A** = pronto per il prossimo step verso commit reale locale controllato.

Motivo:

- payload canonico già presente;
- perimetro più piccolo;
- side effect più facili da controllare;
- rollback più semplice;
- test contract/no-write già presenti e verdi;
- migration RPC già definita ma commit reale ancora bloccato.

### Import Contabilità

**B** = completabile dopo piccoli hardening.

Motivo:

- canonical payload già maturo;
- ma side effect e tabelle toccate sono più numerosi;
- dipende da documenti/staging/audit;
- richiede più validazioni prima del reale.

### Riconciliazione bancaria

**C** = da tenere dry-run/demo.

Motivo:

- ancora fortemente R9A/demo;
- molte casistiche non supportate;
- il commit reale non è il primo candidato naturale;
- rischi contabili e di rollback più alti.

### Consultazione Prima Nota

**C** = da tenere read-only.

Motivo:

- è un modulo di consultazione, non di scrittura;
- il commit reale non ha senso qui per design.

## Criteri A/B/C per autorizzare la fase 15

### A

Autorizzabile solo se:

- il scenario è manuale semplice non IVA;
- il payload è minimale;
- la validazione contabile/fiscale è completa;
- il rollback locale è già definito;
- il smoke è eseguito prima via script dev controllato su DB locale.

### B

Autorizzabile con hardening aggiuntivo se:

- il payload introduce documenti o IVA;
- il perimetro tocca più tabelle;
- servono controlli fiscali aggiuntivi;
- il rollback richiede più passaggi.

### C

Non autorizzabile al commit reale finché non cambia architetturalmente il perimetro.

## Conclusione

Il primo smoke reale locale della Registrazione manuale è **tecnicamente progettato ma non ancora eseguibile oggi**, perché il commit reale è ancora bloccato dalla catena service/repository/RPC/migration.

Il perimetro corretto per la fase 15 è quindi:

- **script dev controllato**;
- **solo Registrazione manuale**;
- **scenario semplice non IVA**;
- **solo `prima_nota` + `prima_nota_righe` + audit**;
- **rollback locale completo**;
- **nessuna UI**;
- **nessun import**;
- **nessuna riconciliazione**;
- **nessun documento esterno**;
- **nessun database remoto**.
