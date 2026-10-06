# Gap analysis - da FiscoSim a gestionale italiano avanzato

## Obiettivo
Capire cosa e` gia` coperto, cosa va completato subito e cosa manca ancora per arrivare a un gestionale italiano davvero completo.

## Sintesi breve
Oggi FiscoSim copre bene il **nucleo contabile**:
- Registrazione manuale
- Consultazione Prima Nota
- Import Contabilita`
- Riconciliazione bancaria

Questo e` gia` un blocco importante, ma **non basta ancora** per un gestionale avanzato completo.

## 1. Mappa sintetica per area

| Area | Stato attuale | Cosa manca | Priorita` |
|---|---|---|---|
| Registrazione manuale | Quasi pronta, con smoke locale reale non IVA e scenario IVA semplice preparato | Stabilizzare UX, validazioni, gate real commit, chiarezza bozza/dry-run/reale | Alta |
| Consultazione Prima Nota | Buona lettura e consultazione | Modifica/storno operativi, audit piu` esplicito, collegamenti piu` completi | Alta |
| Import Contabilita` | Staging e canonical plumbing buoni | Commit reale pieno, validazioni finali, meno ambiguita` tra demo/dry-run/reale | Alta |
| Riconciliazione bancaria | Ricca lato staging/audit/preview | Matching e conferma reali, robustezza profili, meno demo/gating | Medio-bassa |
| Ciclo attivo | Molto incompleto | Fatture clienti, note di credito, incassi, scadenziario, solleciti | Molto alta |
| Ciclo passivo | Molto incompleto | Fatture fornitori, pagamenti, scadenze, collegamento documenti | Molto alta |
| IVA e fiscalita` | Supporto parziale tecnico | Liquidazioni IVA, registri IVA completi, reverse charge, split payment, IVA per cassa, ritenute, F24 | Molto alta |
| Contabilita` generale avanzata | Base presente | Bilanci, mastri, ratei/risconti, cespiti, assestamenti, chiusure/aperture | Alta |
| Documenti e workflow | Parziale | Gestione allegati, versioni, approvazioni, audit documentale | Alta |
| Anagrafiche e configurazione | Base presente | Clienti/fornitori, ruoli, causali, piani contabili piu` completi, esercizi, permessi | Alta |
| Reporting e controllo | Parziale | Dashboard, cash flow, scadenziario, export avanzati, ricerca globale | Media |
| Compliance e adempimenti | Debole | Adempimenti periodici, certificazioni, F24, controlli fiscali | Molto alta |

## 2. Cosa e` gia` pronto o quasi pronto

### Registrazione manuale
- Ha il primo commit reale locale non IVA.
- Ha replay idempotente e cleanup.
- Ha dry-run.
- Ha supporto tecnico per IVA semplice.

### Consultazione Prima Nota
- E` gia` utile come console di lettura e controllo.
- Ha filtri, export e navigazione.
- Va chiarito meglio il perimetro delle azioni operative.

### Import Contabilita`
- Ha working view e staging.
- Ha il plumbing canonical.
- Va chiuso il percorso reale.

### Riconciliazione bancaria
- Ha staging locale, audit, preview documento e review operativa.
- E` utile per verifica e diagnostica.
- E` ancora il modulo piu` lontano da una conferma reale completa.

## 3. Cosa manca per il livello “gestionale avanzato”

### Ciclo attivo
Mancano funzioni tipiche di studio/impresa:
- clienti
- fatture attive
- note di credito
- scadenziario incassi
- solleciti
- eventuale collegamento a SDI / fatturazione elettronica

### Ciclo passivo
Mancano:
- fornitori
- fatture passive
- pagamenti
- scadenze
- matching documenti-contabilita`
- gestione allegati e approvazioni

### IVA e fiscalita`
Qui manca ancora molto per essere “gestionale completo”:
- liquidazioni IVA
- registri IVA navigabili
- reverse charge
- split payment
- IVA per cassa
- ritenute
- F24
- adempimenti periodici

### Contabilita` generale avanzata
Mancano funzioni classiche:
- bilancio completo
- mastri e partitari robusti
- ratei e risconti
- cespiti
- scritture di assestamento
- chiusura e riapertura esercizio

### Documenti e workflow
Serve un livello piu` alto di:
- archivio documentale
- versioning
- approvazioni
- audit trail storico
- relazioni documento-scrittura

### Operativita` da studio
Mancano:
- dashboard giornaliera
- scadenzario
- ricerca globale
- filtri trasversali
- batch action controllate
- permessi/ruoli piu` raffinati

## 4. Classificazione pratica

### A - Quasi operativo, piccoli hardening
- Registrazione manuale

### B - Usabile ma incompleto
- Consultazione Prima Nota
- Import Contabilita`

### C - Ancora demo/fragile
- Riconciliazione bancaria

### D - Non ancora coperto a livello gestionale completo
- Ciclo attivo
- Ciclo passivo
- IVA/fiscalita` avanzata
- contabilità generale avanzata
- documenti/workflow avanzato

## 5. Priorita` reale consigliata
Ordine consigliato:
1. Registrazione manuale
2. Consultazione Prima Nota
3. Import Contabilita`
4. Riconciliazione bancaria
5. Ciclo attivo
6. Ciclo passivo
7. IVA e fiscalita` avanzata
8. Contabilita` generale avanzata

## 6. Cosa serve per dire “gestionale avanzato”
Per essere paragonabile a un gestionale italiano avanzato servono almeno:
- registrazioni affidabili su contabilita` generale
- consultazione e audit chiari
- import documentale realmente robusto
- riconciliazione bancaria completa
- ciclo attivo e passivo
- IVA e adempimenti fiscali
- chiusure di esercizio e reporting

## 7. Conclusione
FiscoSim oggi e` gia` forte sul **core accounting**.
Per essere un **gestionale italiano avanzato completo** deve ancora chiudere:
- il perimetro operativo dei 4 moduli core
- il ciclo attivo
- il ciclo passivo
- l’IVA/fiscalita` avanzata
- la contabilita` generale di fine esercizio
- i workflow documentali e di studio

## 8. Verdetto
Il progetto e` **molto avanti sul nucleo contabile**, ma **non ancora equivalente a un gestionale italiano avanzato completo**.

