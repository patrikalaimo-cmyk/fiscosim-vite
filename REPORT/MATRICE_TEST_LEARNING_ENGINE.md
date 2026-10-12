# MATRICE TEST — Motore di apprendimento contabile

**Data:** 2026-10-12  
**Uso:** risultati attesi indipendenti dall’algoritmo; oracle = decisione contabile corretta predefinita nei fixture.  
**Legenda prove:** UNIT · PG · HTTP_JWT · UI_E2E · INTEGRATED  
**Stato corrente:** baseline parziale già coperta da unit Import history/IVA; resto NOT_EXECUTED fino a Fase B.

---

## A. Import — classificazione e storico

| ID | Scenario | Oracle atteso | Livello | Stato oggi |
|---|---|---|---|---|
| LE-I01 | Stesso fornitore, prodotto A → conto X; prodotto B → conto Y | Due proposte diverse per categoria/descrizione | UNIT→PG | **FAIL gap** (mode unico) |
| LE-I02 | Stesso fornitore, società A regime ordinario vs B forfettario/altro | Nessun leak A→B; detraibilità/regime coerenti | PG+HTTP | PARTIAL isolation load; regime **MISSING** |
| LE-I03 | Regola studio vs storico divergente (IVA) | Standard Studio vince + warning | UNIT | **PASS** `IMPORT-25A-HISTORY-1` |
| LE-I04 | Aliquota 22 vs 10 stessa controparte | Causali IVA distinte per aliquota | UNIT | **PASS** vat history index |
| LE-I05 | Override manuale su conto già scelto | Storico non sovrascrive | UNIT | **PASS** accounting history contract |
| LE-I06 | Correzione operatore poi nuovo XML stesso contesto | Secondo doc propone scelta corretta | PG+INTEGRATED | **PARTIAL** 20261012: feedback LAB local scritto post-commit; consume→proposal ancora via history adapters |
| LE-I07 | Storia scarsa (1 campione) | requiresConfirmation=true / bassa affidabilità | UNIT | PARTIAL (sampleCount esposto) |
| LE-I08 | Storia ambigua (50/50 due conti) | Conflitto esposto; no silent pick senza conferma | UNIT | **MISSING** (mode sceglie comunque) |
| LE-I09 | Storia superata (conto dismesso) | Pattern invalidato; fallback standard | UNIT+PG | **MISSING** |
| LE-I10 | Import duplicato / retry idempotente | Un solo feedback; una sola PN | PG+HTTP | Claim PN OK; feedback N/A |
| LE-I11 | Storno/annullamento documento storico | Escluso da indice; pattern declassato | PG | **MISSING** |
| LE-I12 | Placeholder IVA 0/0 | Esclusi come oggi | UNIT | PASS (regole esistenti) |
| LE-I13 | NC / reverse / split / parcella | contract_kind corretto; non riusare mode FA ordinario | PG | PARTIAL commit LAB; learning contesto **MISSING** |
| LE-I14 | Cross-company suggestion API | 403 / zero rows società aliena | HTTP_JWT | TBD Fase B API |
| LE-I15 | Fail mid-commit | Zero feedback scritto | PG | **PARTIAL** guard dryRun/committed=false in builder; PG mid-fail TBD |

---

## B. Bank — matching e apprendimento

| ID | Scenario | Oracle | Livello | Stato oggi |
|---|---|---|---|---|
| LE-B01 | Partita esatta importo+doc in descrizione | Match partita corretta | UNIT | PARTIAL: engine+fixture PASS; UI live su import+partitario |
| LE-B00 | Import CSV/PDF esegue matcher su partitario live società | Proposte non “Nessun match” finto | UI_E2E+PG | **PARTIAL** 20261012: wire `getPartitarioAperto` + matcher; browser E2E ancora debito |
| LE-B0X | Id demo `bm-*` ≠ fixture economics | Nessuna collisioni id | UNIT | **PASS** 20261012 mock `demo-bm-*` vs fixture `bm-*` |
| LE-B02 | Pagamento parziale | Chiusura parziale; residuo corretto | UNIT+PG | PARTIAL planning |
| LE-B03 | Un movimento → N partite | Split proposal; no silent single | UNIT | **MISSING**/LIMITED |
| LE-B04 | N movimenti → 1 partita | Aggregate o review | UNIT | **MISSING** |
| LE-B05 | Ricorrente senza fattura (canone/POS) | Spesa/ricorrente; no partita inventata | UNIT | PARTIAL classify |
| LE-B06 | Giroconto banche | Nessuna IVA; PN giroconto | UNIT+PG | PARTIAL classify diretta |
| LE-B07 | F24 non dettagliato | requiresReview; no auto-commit | UNIT | PARTIAL classify `f24` |
| LE-B08 | Commissione bancaria | Spesa bancaria senza partita cliente | UNIT | PARTIAL |
| LE-B09 | Conferma match poi stesso pattern | Suggestion da precedenti società | PG | **PARTIAL** 20261012: localStorage LAB boost; DB gated |
| LE-B10 | Mass confirm solo high-confidence | Commit solo gated; altri restano aperti | UI_E2E | **MISSING** |
| LE-B11 | Isolamento A/B partite | Zero candidati cross-società | PG+HTTP | TBD |
| LE-B12 | Dry-run / fail commit | Nessun apprendimento | UNIT+PG | OK oggi (no learn); preservare |

---

## C. Sicurezza e studio

| ID | Scenario | Oracle | Stato |
|---|---|---|---|
| LE-S01 | Operatore società A non legge feedback B | Deny | TBD |
| LE-S02 | Regola studio non inietta UUID conti società C in D | Resolve by code/natura only | TBD |
| LE-S03 | Studio X non vede pattern studio Y | Deny | TBD |
| LE-S04 | AI opzionale non posta senza conferma | No silent fiscal post | Policy esistente LAB flags |

---

## D. Prestazioni e regressione qualità

| ID | Metrica | Target iniziale | Metodo |
|---|---|---|---|
| LE-P01 | Tempo build indice ≤ N docs (es. 800) | p95 < 2s client / o server job | bench LAB |
| LE-P02 | Precision proposte accettate vs baseline mode attuale | ≥ baseline su LE-I01..I05 | A/B fixture |
| LE-P03 | Tasso correzione operatore | ≤ baseline dopo LE-I06 attivo | log feedback |
| LE-P04 | Conflitti spiegati | 100% casi LE-I08 | unit |
| LE-P05 | L6 pack invariato | L6CORE3 all PASS | `run-stage3w-l6-lab-regression.mjs` |

---

## E. Tracciamento implementazione

| Blocco Fase B | Test minimi da verde |
|---|---|
| B1 Resolver unificato | LE-I03, I04, I05, I07 + L6 smoke |
| B2 Feedback log | LE-I06, I10, I15, B12 |
| B3 Contesto multi-prodotto | LE-I01, I08, I09 |
| B4 Studio rules | LE-I03 esteso, S02 |
| B5 Bank memory | LE-B01, B09, B11 |
| B6 UI explain / mass | LE-B10, UI_E2E |
| B7 Hardening | LE-S01–S03, P01–P05 |

---

## F. Baseline già verde (non rieseguire inutilmente)

- Unit Import accounting/VAT history esistenti  
- Stage3W P3-01/P3-02 HISTORY_API (commit audit, non learning)  
- L6 `l6_lab_core_v3`  
- Non rieseguire Stage 3S/3U senza causa
