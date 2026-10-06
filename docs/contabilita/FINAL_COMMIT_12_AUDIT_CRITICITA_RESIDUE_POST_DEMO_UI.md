# FINAL-COMMIT-12 - Audit criticità residue post-demo UI sui 4 moduli core

## Contesto

Baseline di partenza: [FINAL_COMMIT_11_DEMO_UI_LOCALE_PROFONDA_4_MODULI_CORE.md](FINAL_COMMIT_11_DEMO_UI_LOCALE_PROFONDA_4_MODULI_CORE.md)

Stato confermato prima di questo audit:

- Supabase locale avviabile.
- Env local-only.
- Seed locale auth/società funzionante.
- UI locale navigabile.
- 4 moduli core apribili.
- No-write confermato.
- Build verde.
- Nessun DB remoto toccato.
- Nessun commit reale attivato.

## Lettura critica di FINAL-COMMIT-11

I warning descritti in 11 si dividono in tre gruppi:

- warning locali non bloccanti di console/asset-route (`404`, `400`, `405`);
- warning di packaging Vite sui chunk grandi;
- warning funzionali di demo/gated, soprattutto su Riconciliazione bancaria.

Classificazione del significato reale dei warning:

- console/asset-route: **warning tecnici locali, non bloccanti**;
- chunk grandi: **warning di build, non bloccante**;
- demo/gated su Riconciliazione: **warning funzionale reale**, perché indica che il modulo è usabile ma non ancora “operativo finale”.

## Criteri usati per l’audit

Ho distinto i seguenti stati:

- realmente operativo;
- dry-run/gated;
- demo-only;
- collegato a canonical payload;
- ancora scollegato dal commit reale.

Ho anche verificato:

- che `allowRealCommit` resti disattivato nei percorsi UI auditati;
- che il commit reale dipenda ancora da RPC e non venga attivato nei moduli UI;
- che esistano test già verdi per i flussi principali.

## Sintesi tecnica trasversale

### Commit service canonico

Il servizio canonico centrale in [services/canonicalAccountingCommitService.js](../../services/canonicalAccountingCommitService.js) è il vero confine di sicurezza:

- se `allowRealCommit !== true`, il commit reale viene bloccato;
- se `allowRealCommit === true` ma `useRpc !== true`, il commit reale viene bloccato con `real_commit_requires_rpc`;
- in `dryRun`, il servizio produce preview/audit senza write finale (`noDbWriteInDryRun: true`).

Quindi il sistema ha già un’architettura canonica, ma il commit reale non è attivabile dalla UI auditata.

### Commit repository canonico

Il repository in [services/canonicalAccountingCommitRepository.js](../../services/canonicalAccountingCommitRepository.js) conferma che:

- `callCommitCanonicalAccountingPayloadRpc()` ritorna `rpc_not_enabled` se `useRpc !== true`;
- la scrittura audit reale è bloccata se `allowRealWrites` non è attivo;
- quindi il percorso reale non è solo disattivato nella UI, ma anche protetto a livello repository.

### Stato test

Test già presenti e verdi per i flussi principali:

- consultazione prima nota: `scripts/dev/test-consultazione-prima-nota-no-write.mjs`;
- registrazione manuale: `scripts/dev/test-manual-registration-atomic-commit-contract.mjs`, `scripts/dev/test-manual-registration-no-unsafe-real-save.mjs`;
- import contabilità: `scripts/dev/test-import-contabilita-atomic-commit-contract.mjs`, `scripts/dev/test-import-contabilita-no-unsafe-real-save.mjs`;
- riconciliazione: `scripts/dev/test-riconciliazione-matching.mjs`, `scripts/dev/test-riconciliazione-decisions.mjs`, `scripts/dev/test-riconciliazione-canonical-payload.mjs`, `scripts/dev/test-riconciliazione-commit-base.mjs`, `scripts/dev/test-riconciliazione-atomic-commit-contract.mjs`, `scripts/dev/test-riconciliazione-no-unsafe-real-save.mjs`.

## Classificazione per modulo

### 1) Consultazione Prima Nota

| Modulo | Stato UI | Stato dati locali | Stato no-write | Stato canonical payload | Stato commit reale | Test verdi | Warning | Bloccanti | Cosa manca per dichiararlo operativo |
|---|---|---|---|---|---|---|---|---|---|
| Consultazione Prima Nota | B | B | A | B | A | A | warning console locali e azioni read-only protette | nessuno funzionale bloccante | definire meglio il confine tra sola consultazione e completamento operativo delle azioni protette, più pulizia dei warning locali |

Valutazione critica:

- la UI è chiaramente leggibile e funziona come read-only in [src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx](../../src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx);
- il modulo espone export, filtri, tabella e azioni di dettaglio;
- le azioni di modifica/storno/apri partitario sono esplicitamente intercettate con messaggio read-only;
- il modulo è già sicuro, ma non è un modulo operativo di scrittura.

Classificazione finale modulo: **B**.

### 2) Registrazione manuale

| Modulo | Stato UI | Stato dati locali | Stato no-write | Stato canonical payload | Stato commit reale | Test verdi | Warning | Bloccanti | Cosa manca per dichiararlo operativo |
|---|---|---|---|---|---|---|---|---|---|
| Registrazione manuale | B | B | A | A | C | A | salvataggio reale ancora bloccato, stato chiaramente gated/dry-run | commit reale non attivo | sbloccare il flusso reale solo dopo RPC/allowRealCommit controllati e conferma del modello canonico finale |

Valutazione critica:

- il form operativo è presente in [src/modules/contabilita/prima_nota_guidata.jsx](../../src/modules/contabilita/prima_nota_guidata.jsx);
- ci sono righe Dare/Avere, anteprima bozza, validazione e stato di quadratura;
- il payload canonico è costruito da [src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js](../../src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js);
- il commit reale è esplicitamente bloccato con `REAL_SAVE_TEMPORARILY_BLOCKED = true` e con `allowRealCommit: false` nel mock atomic commit;
- il button “Registra in contabilità” non esegue commit reale, ma la verifica gated/dry-run sì.

Classificazione finale modulo: **B**.

### 3) Import Contabilità

| Modulo | Stato UI | Stato dati locali | Stato no-write | Stato canonical payload | Stato commit reale | Test verdi | Warning | Bloccanti | Cosa manca per dichiararlo operativo |
|---|---|---|---|---|---|---|---|---|---|
| Import Contabilità | B | B | A | A | C | A | area ancora staging/dry-run, commit solo verificato | commit reale non attivo | passare da staging/dry-run a pipeline realmente scrivente solo con RPC reale e audit di sicurezza |

Valutazione critica:

- la working view è sostanzialmente completa e presenta staging, working table, pannelli di preview e stato di bozza;
- il dry-run panel è integrato in [src/modules/import_contabilita/components/working_view/WorkingViewCommitDryRunPanel.jsx](../../src/modules/import_contabilita/components/working_view/WorkingViewCommitDryRunPanel.jsx);
- il commit input canonico viene costruito da [src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js](../../src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js);
- il payload canonico viene derivato da [src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx](../../src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx) tramite `buildContabilitaPayloadFromImportRow`;
- il flusso invoca `commitCanonicalAccountingPayload(..., { dryRun: true, allowRealCommit: false })`, quindi il commit reale è ancora scollegato;
- il modulo è utile e coerente, ma resta una demo/staging no-write.

Classificazione finale modulo: **B**.

### 4) Riconciliazione Bancaria

| Modulo | Stato UI | Stato dati locali | Stato no-write | Stato canonical payload | Stato commit reale | Test verdi | Warning | Bloccanti | Cosa manca per dichiararlo operativo |
|---|---|---|---|---|---|---|---|---|---|
| Riconciliazione Bancaria | B | B | A | A | C | A | modulo ancora fortemente demo/R9A; molte casistiche non supportate | commit reale non attivo e diverse casistiche sono esplicitamente bloccate | estendere la copertura funzionale oltre R9A e introdurre un percorso reale solo dopo RPC e validazioni complete |

Valutazione critica:

- il modulo ha matching, decisioni e preview canonica in [src/modules/contabilita/components/riconciliazione/commitReconciliationCanonicalPayload.js](../../src/modules/contabilita/components/riconciliazione/commitReconciliationCanonicalPayload.js);
- il payload viene costruito e validato in [src/modules/contabilita/components/riconciliazione/validateReconciliationCommitPayload.js](../../src/modules/contabilita/components/riconciliazione/validateReconciliationCommitPayload.js) e [src/modules/contabilita/canonical/buildReconciliationCommitInput.js](../../src/modules/contabilita/canonical/buildReconciliationCommitInput.js);
- il planning canonico in [src/modules/contabilita/components/riconciliazione/reconciliationCommitPlanning.js](../../src/modules/contabilita/components/riconciliazione/reconciliationCommitPlanning.js) dichiara `noDbWriteInDryRun: true` e produce solo preview;
- il commit wrapper forza `allowRealCommit: false` e `dryRun: true`;
- molte casistiche restano etichettate come `Caso non ancora supportato in R9A`;
- quindi il modulo è il più maturo come demo, ma anche il più distante dall’essere “operativo finale”.

Classificazione finale modulo: **B**.

## Lettura dei warning residui

### Warning tecnici locali

- `404` / `400` / `405` in console: non bloccanti, collegati a asset/route/fetch locali o a superfici demo;
- warning Vite chunk grandi: non bloccante, ma indica che il bundle è ancora pesante.

### Warning funzionali reali

- Consultazione: warning quasi solo di rifinitura UX/console, non di correttezza funzionale;
- Registrazione manuale: warning principale è che il commit reale resta bloccato e la schermata è una bozza verificabile;
- Import Contabilità: warning principale è che il flusso resta staging/dry-run;
- Riconciliazione: warning principale è che molte casistiche sono ancora R9A/demo-only.

## Classificazione complessiva

| Modulo | Stato complessivo |
|---|---|
| Consultazione Prima Nota | B |
| Registrazione manuale | B |
| Import Contabilità | B |
| Riconciliazione bancaria | B |

## Conclusione operativa

I quattro moduli sono **usabili in locale**, con canonical payload già presente e no-write garantito, ma **non sono ancora “core operativi” nel senso pieno di scrittura finale reale**.

Il limite vero non è più il bootstrap locale; è il fatto che:

- il commit reale è ancora esplicitamente disattivato o RPC-gated;
- la riconciliazione resta parzialmente demo/R9A;
- la consultazione è read-only per design;
- import e registrazione manuale hanno buone basi canoniche, ma restano fermate a dry-run/bozza.

## Roadmap breve

1. Portare i moduli manuale e import da dry-run a commit reale solo dopo un audit esplicito di RPC, idempotenza e autorizzazioni.
2. Ridurre la dipendenza demo/R9A della riconciliazione, partendo dalle casistiche ancora bloccate.
3. Rifinire le warning console/asset-route locali per distinguere problemi veri da rumore di ambiente.
4. Tenere la consultazione come read-only, ma consolidare i messaggi e i guardrail UX.
5. Solo dopo questi passi rivalutare i moduli come “core operativi” e non solo “core demo-locali”.

## Verdetto finale di audit

**FINAL-COMMIT-12: B**

Motivo: i 4 moduli core sono localmente usabili e protetti dal no-write, ma restano ancora dry-run/gated, con commit reale disattivato e alcune parti della riconciliazione ancora demo-only o casistica non supportata.