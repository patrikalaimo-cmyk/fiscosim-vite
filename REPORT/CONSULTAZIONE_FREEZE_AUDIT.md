# CONSULTAZIONE-FREEZE — AUDIT AUTOMATICO

Data: 2026-10-07  
Branch: `mio-branch`  
Commit codice validato: `66952c229a9b6e6dd8bac329b664a5537c2f88d3`  
CI ufficiale: run `37664771687`

## Esito

**AUTOMATICO VERDE / MANUALE PENDENTE**

Ubuntu e Windows verdi su:
1. `npm run test:import`;
2. `npm run test:manual`;
3. `npm run test:consultazione`;
4. `npm run test:core`;
5. `npm run test:all`;
6. `npm run build`.

Conteggi Ubuntu:
- Import: 231/231 PASS;
- Manuale: 413/413 PASS;
- Consultazione: 38/38 PASS su 5 file;
- Core: 575/575 PASS;
- All safe: 950/950 PASS;
- build Vite: PASS.

## Contratto del modulo

Consultazione Prima Nota è un modulo **strettamente read-only**.

Sono ammessi:
- ricerca e filtri;
- vista compatta/completa;
- dettaglio scrittura;
- saldo precedente e saldo progressivo;
- identificazione di scritture ordinarie, simulate, stornate/storno;
- export CSV;
- navigazione e ispezione.

Non sono ammessi dalla superficie Consultazione:
- insert/update/delete/upsert su prima nota, righe, registri IVA, partitario o ritenute;
- RPC mutative;
- `persistPrimaNotaDraft` o commit canonico;
- modifica/storno via callback verso Inserimento Manuale;
- cancellazione diretta delle simulazioni.

Le operazioni contabili restano responsabilità dei workflow dedicati, separati dalla Consultazione.

## Gap reale emerso dall'audit

Il contratto read-only era già documentato, ma la sidebar dettaglio conservava:
- callback `onEditScrittura` per modifica e storno;
- cancellazione simulata tramite `deleteScritturaControllata`;
- handoff dal `PrimaNotaHubView` verso Registrazione Manuale con `operationMode=edit/storno`.

Il guard storico non analizzava la sidebar e non intercettava il bypass.

## Hardening eseguito

- rimosse le azioni operative dalla sidebar;
- rimosso l'handoff mutativo Consultazione → Manuale;
- rimosso l'helper legacy `buildDraftFromPrimaNota` usato unicamente da quell'handoff;
- aggiunto banner UI esplicito read-only;
- mantenuto il dettaglio con sola lettura tramite `getScritturaDettaglioById`;
- hardenizzato `scripts/dev/test-consultazione-prima-nota-no-write.mjs` su tutta la superficie Consultazione;
- aggiunto `tests/consultazioneReadOnlyGuard.test.js`;
- aggiunto profilo ufficiale `npm run test:consultazione`;
- aggiunto step CI dedicato Windows + Ubuntu;
- aggiunta al profilo `test:all` anche la suite application `consultazioneOperations.test.js`.

## Copertura automatica

La baseline verifica:
- normalizzazione filtri;
- query params server/client;
- filtri conto per ID/codice/testo;
- filtri stati ordinarie/stornate/simulate;
- mapping righe PN verso view model;
- collegamento storno bilaterale;
- saldo precedente per conto e stati selezionati;
- saldo progressivo ordinato numericamente;
- summary Dare/Avere/saldo/conti;
- export CSV compatto/full e numero Prima Nota;
- guard statico no-write su View, componenti e application operations;
- assenza dell'handoff mutativo nel parent.

## Triage failure

Il primo hardening ha fatto emergere un test storico che pretendeva ancora `onEditScrittura`.
Classificazione: **test obsoleto** rispetto al contratto CORE-CLOSURE read-only.

Il test è stato riallineato senza ridurre la protezione. Un successivo errore era esclusivamente sintattico nella regex del test e non riguardava codice produttivo.

## Vincoli rispettati

- nessuna migration Supabase;
- nessuna modifica a `.env`, `.env.local`, `.env.example`;
- nessuna modifica auth/login/RLS/policy;
- nessuna scrittura su società reali;
- nessun test browser/manuale dichiarato eseguito;
- nessun force push;
- ref aggiornata con `force:false` e `expected_sha`;
- Riconciliazione Bancaria non avviata.

## Debito manuale

Registrato in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.

## Stato

**CONSULTAZIONE-FREEZE = AUTOMATICO VERDE / MANUALE PENDENTE**

## Gate successivo

`IVA-REGISTRI-LIQUIDAZIONE`.
