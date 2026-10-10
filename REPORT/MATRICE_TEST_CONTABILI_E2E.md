# MATRICE TEST CONTABILI E2E — 2026-10-10

**Branch/SHA base audit:** `feat/studio-grade-accounting-e2e-20261010` (da `ceac722`)  
**Regola stati esito:** `PASS` | `FAIL` | `BLOCKED` | `NOT_IMPLEMENTED` | `NOT_EXECUTED`  
**Regola codice:** `IMPLEMENTED` | `PARTIAL` | `MISSING` | `BROKEN` | `LEGACY` | `BLOCKED`  
**Livelli prova:** L1 Unit · L2 PG Integration · L3 HTTP JWT · L4 Browser · L5 Ciclo integrato · L6 Regressione

> `UNIT_PASS` della baseline Node **non** promuove un rigo a `PASS` E2E.  
> Fixture obbligatorie: prefisso sintetico dedicato, società A/B, nessun dato cliente reale.

---

## A. Prima Nota generale

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| A01 | PN generale | Scrittura bilanciata Dare=Avere | IMPLEMENTED | L1 | PASS (unit) | `test:manual` / MockDb | L2–L4 NOT_EXECUTED su path produttivo | P0 |
| A02 | PN generale | Giroconto / costo / ricavo / banca / cassa | IMPLEMENTED | L1 | PASS (unit) | suite Manuale | E2E PG/UI | P1 |
| A03 | PN generale | Operazioni multi-conto | IMPLEMENTED | L1 | PASS (unit) | suite Manuale | E2E | P1 |
| A04 | PN generale | Storno / rettifica / annullamento | PARTIAL | L1 | PASS (unit path) | RPC Fase3C + UI Manuale | E2E + policy graduata completa | P1 |
| A05 | PN generale | Conti inesistenti / disattivi / altra società | PARTIAL | L1+L2(Stage3U) | PASS Stage3U LAB (solo RPC gen.) | Stage3U matrix | Path produttivo senza stessi guard ACID | P0 |
| A06 | PN generale | Periodo chiuso / permessi insufficienti | PARTIAL | L1 | PASS (unit guards) | closed-period tests | JWT+PG | P0 |
| A07 | PN generale | Replay stessa richiesta (idempotenza) | BROKEN (prod) / IMPLEMENTED (3U) | L2 | PASS solo Stage3U | claim table Stage3U | Prod `createPrimaNotaCompleta` senza idempotenza | P0 |
| A08 | PN generale | Quadratura per scrittura e società | IMPLEMENTED | L1+L2(3U) | PASS unit / PASS 3U | Stage3U + Manuale | Full fiscal path | P0 |
| A09 | PN generale | Rollback mid-transaction | BROKEN (prod) / IMPLEMENTED (3U) | L2 | PASS Stage3U late-fail | Stage3U rehearsal/install | Cleanup best-effort non ripristina UPDATE | P0 |

---

## B. Fatture attive e passive

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| B01 | Fatture | Vendita ordinaria | IMPLEMENTED | L1 | PASS (unit) | `manualeIvaOrdinaria` | L2–L5 | P1 |
| B02 | Fatture | Acquisto ordinario | IMPLEMENTED | L1 | PASS (unit) | idem | L2–L5 | P1 |
| B03 | Fatture | IVA 22/10/5/4 e nature supportate | PARTIAL | L1 | PASS casi coperto | Manuale/Import | Elenco aliquote ufficiali vs supportate da chiudere | P1 |
| B04 | Fatture | Multi-aliquota + multi-riga | IMPLEMENTED | L1 | PASS (unit) | Manuale/Import 25A | E2E persistito | P1 |
| B05 | Fatture | Esenti / non imponibili / escluse / non soggette | PARTIAL | L1 | PASS parziale | nature in mapper | Matrice nature completa L2 | P2 |
| B06 | Fatture | NC attiva/passiva totale/parziale | IMPLEMENTED | L1 | PASS (unit) | Manuale + split NC | E2E | P1 |
| B07 | Fatture | Acconti / rettificativi | PARTIAL | L1 | NOT_EXECUTED E2E | causali | Specifica casi supportati | P2 |
| B08 | Fatture | Scadenze singole/multiple | PARTIAL | L1 | PASS apertura | partitario tests | Rate multi-scadenza E2E | P1 |
| B09 | Fatture | Effetti PN+IVA+partitario+bilancio | PARTIAL | L1 | PASS simulato | MockDb e2e-named tests | PG cross-module | P1 |

---

## C. Regimi IVA speciali

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| C01 | Split | Fattura attiva split + NC | IMPLEMENTED | L1 | PASS (unit) | `test:split` 25 | PG/UI | P2 |
| C02 | IVA cassa | Vendite/acquisti + rilascio | IMPLEMENTED | L1 | PASS (unit) | ivaPerCassa* | PG incassi reali | P2 |
| C03 | IVA cassa | Incasso/pagamento parziale proporzionale | IMPLEMENTED (dominio) | L1 | PASS (unit) | release tests | E2E | P2 |
| C04 | Reverse interno | Doppie annotazioni | PARTIAL | L1 | PASS (unit) | Manuale reverse | Policy causali + PG | P2 |
| C05 | Intra-UE | Acquisti/cessioni supportati | PARTIAL | L1 | PASS casi base | ff5/estero tests | Perimetro ufficiale | P2 |
| C06 | Extra-UE / autofatture | Integrazioni previste | PARTIAL | L1 | PASS casi base | Manuale | Matrice completa | P2 |
| C07 | Speciali | Impatto liquidazione | PARTIAL | L1 | PASS (unit) | `test:iva` | L2 liquidazione da PN reali | P2 |

---

## D. Parcelle, ritenute, percipienti

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| D01 | Ritenute | Parcella IVA+cassa+ritenuta | IMPLEMENTED | L1 | PASS (unit) | `test:ritenute` | E2E | P2 |
| D02 | Ritenute | Pagamento integrale → debito 1040 | IMPLEMENTED | L1 | PASS (unit) | ritenutePagamentoParcella | E2E | P2 |
| D03 | Ritenute | Scadenza versamento 16 mese succ. | IMPLEMENTED | L1 | PASS (unit) | scadenzario | E2E | P2 |
| D04 | Ritenute | Import F24 vs maturato | PARTIAL | L1 | NOT_EXECUTED | roadmap Fase 18 | Modulo controllo incompleto | P2 |
| D05 | Ritenute | Versato corretto/tardivo/insufficiente/assente | PARTIAL | — | NOT_IMPLEMENTED | — | Stati verde/giallo/rosso | P2 |
| D06 | Ritenute | CU/770 readiness | PARTIAL | L1 | PASS readiness unit | CF obbligatorio | Export ministeriale fuori perimetro | P2 |
| D07 | Ritenute | Pagamento parziale con ritenuta | BLOCKED | L1 | BLOCKED | guard esplicito | Implementare o escludere formalmente | P2 |

---

## E. Partitario, scadenze, incassi, pagamenti

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| E01 | Partitario | Apertura da fattura | IMPLEMENTED | L1 | PASS (unit) | partitarioDocumentiIva | PG | P1 |
| E02 | Partitario | Chiusura totale/parziale | IMPLEMENTED | L1 | PASS (unit) | partitarioPagamentiIncassi | PG + rollback UPDATE | P0 |
| E03 | Partitario | Residui / abbuoni / compensazioni / NC | PARTIAL | L1 | PASS parziale | suite partitario | Insoluti MISSING | P1 |
| E04 | Partitario | Rateizzate | PARTIAL | L1 | NOT_EXECUTED E2E | scadenze multi | UI scadenzario commerciale | P1 |
| E05 | Partitario | Pagamento duplicato / > residuo | PARTIAL | L1 | PASS guard unit | applyPartitarioClosures | Concorrenza L2 | P0 |
| E06 | Partitario | Link incasso↔PN↔IVA | PARTIAL | L1 | PASS simulato | Manuale | PG | P1 |
| E07 | Partitario | Aging vs mastrini | PARTIAL | — | NOT_IMPLEMENTED report | mock stampe | Modello aging | P3 |

---

## F. Liquidazioni IVA e adempimenti

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| F01 | Liquidazione | Mensile/trimestrale | IMPLEMENTED | L1 | PASS (unit) | `test:iva` 148 | PG | P2 |
| F02 | Liquidazione | Debito/credito/riporti | IMPLEMENTED | L1 | PASS (unit) | liquidazione service | PG | P2 |
| F03 | Liquidazione | Split / cassa / reverse / NC | IMPLEMENTED | L1 | PASS (unit) | freeze IVA/split | PG da PN | P2 |
| F04 | Liquidazione | Provvisorio/definitivo + doppio consolidamento | IMPLEMENTED | L1 | PASS (unit) | blocco definitiva | PG | P2 |
| F05 | Liquidazione | LIPE XML | PARTIAL | L1 | NOT_IMPLEMENTED ministeriale | generatori semplificati | Spec AdE | P3 |
| F06 | Liquidazione | Controlli F24 (non compilatore) | PARTIAL | — | NOT_EXECUTED | prospetto F24 | Incrocio ritenute | P2 |

---

## G. Import Contabilità e storico

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| G01 | Import | XML FatturaPA / ZIP sintetici | IMPLEMENTED | L1 | PASS (unit) | `test:import` 231 | Browser file-picker | P1 |
| G02 | Import | Attive/passive/NC/parcelle/speciali | PARTIAL | L1 | PASS casi coperto | Import freeze | Matrice completa L4 | P1 |
| G03 | Import | Matching anagrafiche/piano conti | IMPLEMENTED | L1 | PASS (unit) | history P1/P2 | Override UI | P1 |
| G04 | Import | Causali IVA standard→storico→AI | IMPLEMENTED | L1 | PASS (unit) | warning discrepanza | AI opt-in | P1 |
| G05 | Import | Placeholder IVA 0/0 non bloccante | IMPLEMENTED | L1 | PASS (unit) | pruning | — | P1 |
| G06 | Import | Dedup / anti doppio commit | IMPLEMENTED | L1 | PASS (unit) | freeze audit | PG UUID staging | P1 |
| G07 | Import | Storico completo file/hash/esito | PARTIAL | L1 | NOT_IMPLEMENTED UI | placeholder Cronologia | Persistenza storico UI | P3 |
| G08 | Import | Equivalenza Import=Manuale | PARTIAL | L1 | PASS contract unit | payload canonico | PG confronto | P1 |

---

## H. Riconciliazione Bancaria

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| H01 | Bank | Import estratto sintetico | PARTIAL | L1 | PASS (unit) | `test:bank` 11 | Formati reali | P3 |
| H02 | Bank | Match auto/manuale | PARTIAL | L1 | PASS dry-run | fixtures R8/R9A | Commit | P3 |
| H03 | Bank | Incassi/pagamenti/parziali/multi | PARTIAL | L1 | NOT_EXECUTED commit | dry-run | RPC atomica | P3 |
| H04 | Bank | Spese/F24/giroconti/Revolut | PARTIAL | L1 | NOT_EXECUTED | domain notes | Matrice casi | P3 |
| H05 | Bank | Doppio import estratto | PARTIAL | L1 | PARTIAL unit | idempotenza design | PG | P3 |
| H06 | Bank | Commit → PN canonica | BLOCKED | L1 | BLOCKED | allowRealCommit=false | SG-P0-01 + gate | P3 |
| H07 | Bank | Storico periodo/movimento/operatore | PARTIAL | — | NOT_IMPLEMENTED server | localStorage | Persistenza | P3 |

---

## I. Cespiti, bilancio, chiusure

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| I01 | Cespiti | Acquisto + libro cespiti | PARTIAL | L1 | PASS bridge unit | createCespiteFromPrimaNota | Libro completo | P3 |
| I02 | Cespiti | Ammortamento quote | PARTIAL | L1 | NOT_EXECUTED E2E | ammortamenti module | PN ammortamento auto | P3 |
| I03 | Assestamenti | Ratei/risconti | PARTIAL | — | NOT_IMPLEMENTED flusso | flag causale | Workflow | P3 |
| I04 | Bilancio | Mastrini / verifica Dare=Avere | PARTIAL | L1 | PASS modelli unit | stampe saldi | UI operativa + saldi apertura | P3 |
| I05 | Chiusura | Chiusura/riapertura esercizio | PARTIAL | L1 | NOT_IMPLEMENTED procedura | auditRaccordo read-only | RPC/UI | P3 |
| I06 | Chiusura | Periodi bloccati senza procedura | PARTIAL | L1 | PASS guards unit | freeze | Riapertura Owner+backup | P0/P3 |

---

## J. Stampe, registri, audit

| ID | Modulo | Scenario | Stato codice | Livello test | Esito reale | Evidenza | Gap | Priorità |
|---|---|---|---|---|---|---|---|---|
| J01 | Stampe | Registri IVA / giornale | PARTIAL | L1 | PASS modelli | `test:stampe` | PDF E2E | P3 |
| J02 | Stampe | Definitiva + lock | PARTIAL | L1 | BLOCKED UI senza attestazioni | gate service | RPC server checksum | P0 |
| J03 | Stampe | Fascicolo cliente | MISSING | — | NOT_IMPLEMENTED | — | PDF unico | P3 |
| J04 | Stampe | Export CSV/Excel/PDF | PARTIAL | L1 | PASS parziale | export moduli | Completezza | P3 |
| J05 | Audit | Trail append-only commit | PARTIAL | L1+L2(3U) | PASS 3U / PARZIALE prod | audit_contabile | Path produttivo incompleto | P0 |

---

## Trasversali sicurezza / robustezza

| ID | Scenario | Stato codice | Esito reale | Gap | Priorità |
|---|---|---|---|---|---|
| S01 | Società A↔B read/write isolation contabile | PARTIAL | DB_PASS Stage3U/3S perimetri; contabile prod NOT_EXECUTED | JWT contabile | P0 |
| S02 | JWT assente/scaduto/manomesso/valido | PARTIAL | HTTP boundary unit PASS; signed NOT_EXECUTED | Stage3V | P0 |
| S03 | Ruoli non autorizzati | PARTIAL | Stage3U owner/admin; UI mista | Matrice ruoli L3 | P0 |
| S04 | Duplicati / concorrenti / timeout / retry | BROKEN prod | NOT_EXECUTED | Idempotenza fiscale | P0 |
| S05 | Fallimento a metà + zero residui | BROKEN prod / PASS 3U gen. | PARTIAL | UPDATE partite | P0 |
| S06 | Periodi chiusi | PARTIAL | UNIT_PASS | PG | P0 |
| S07 | Nessun secret nei log | PARTIAL | harness Stage3V | Audit continuo | P0 |

---

## Riepilogo livelli suite (da costruire)

| Livello | Stato infrastruttura | Prossimo passo |
|---|---|---|
| L1 | Operativo (`test:*` CI) | Mantenere regressione; 1183 PASS @ sessione |
| L2 | Stage3U generale PASS; fiscale completo MISSING | SG-P0-01 RPC fiscale |
| L3 | Harness Stage3V pronto; porte BLOCKED | SG-P0-00 approvazione porte + JWT |
| L4 | Playwright/browser fiscali assenti | Dopo L3; debito manuale esistente |
| L5 | Dataset multi-periodo assente | Dopo L2–L4 verticali |
| L6 | CI Node only | Estendere a LAB isolato ripetibile |

**Prefisso fixture proposto:** `SG-E2E-20261010-` · società `SG-E2E-A` / `SG-E2E-B`.
