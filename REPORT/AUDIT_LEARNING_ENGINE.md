# AUDIT — Motore di apprendimento contabile FiscoSim

**Data:** 2026-10-12  
**Branch:** `feat/studio-grade-accounting-e2e-20261010`  
**HEAD docs Fase A:** `f56cac4` (audit iniziale su base `46c60ab`; oltre checkpoint `54e883a` — non ripetere Stage 3S/3U)  
**Ambito:** Fase A — sola lettura codice esecutivo; nessuna migration.  
**Follow-up:** sezione §7 arricchita da audit codice approfondito Import/Bank.

---

## 0. Distinzione critica (non confondere)

| Sistema | Scopo | Persistenza |
|---|---|---|
| **Cronologia commit** (SG-P3-01/02, `fiscal-journal-history`) | Audit file/hash/PN dopo commit atomico LAB | Server claim + localStorage UI |
| **Storico proposte Import** (`importContabilita*History`) | Suggerimenti conto/causale/IVA in Working View | Indice **ricalcolato in memoria** da PG |
| **`ai_learning` + `historicalContoSuggestions`** | Apprendimento conto per anagrafica (Manuale / import_fatture / Archivio AI) | Tabella `ai_learning` (server) |
| **Bank matching** | Score partite aperte vs movimento | Euristica in-memory; fixture/mock |
| **Guided import templates Bank** | Layout estratto ricorrente | **localStorage only** |

Questa audit mira al **motore di apprendimento operativo** (proposte → conferma → futuro), non al solo storico commit.

---

## 1. Catena ricostruita (stato attuale)

```
documenti_contabilita / registri_iva / prima_nota(+righe)  [societa_id]
        ↓ load*BySocieta (client Supabase)
indice Map in memoria (modo statistico controparte±direzione±aliquota)
        ↓ resolve*Suggestion
Working View / draft (solo campi vuoti; override manuale protetto)
        ↓ conferma operatore + commit (Stage3W LAB o createPrimaNotaCompleta)
[GAP] nessun feedback strutturato → ri-indicizzazione solo alla prossima load
```

Bank (stato UI reale):

```
partiteAperte = SOLO ricondiliazioneMatchingFixtures (non partitario live)
        ↓
UI: demo mock usa `demo-bm-*`; matcher live su import+partitario; fixture R7A resta `bm-*` (demo R7B)
import CSV/PDF → mapBankStatementMovementToWorkingRow → "Nessun match contabile reale"
        ↓
proposal / accept locale (non in staging draft; non commit da UI bulk)
autoMatch / confirmSelected = placeholder mock
        ↓
commit: dry-run default; LAB fiscal + JWT → claim cronologia (≠ learning match)
guided templates layout: localStorage globale (non per società)
```

---

## 2. Risposte alle 10 domande obbligatorie

### 1) Tabelle sorgente reali
| Area | Tabelle | Loader |
|---|---|---|
| Accounting history Import | `documenti_contabilita` → `prima_nota` → `prima_nota_righe` | [`loadImportContabilitaAccountingHistoryBySocieta`](src/modules/import_contabilita/data/importContabilitaRepo.js) ~773 |
| VAT history Import | `registri_iva` | [`loadImportContabilitaVatHistoryBySocieta`](src/modules/import_contabilita/data/importContabilitaRepo.js) ~737 |
| AI learning (parallelo) | `ai_learning` | [`getArchivioStoricoAiLearning`](src/modules/contabilita/data/contabilitaRepo.js) ~112 |
| Bank match | partite aperte in-memory/fixture (non un loader storico decisioni dedicato) | [`runRiconciliazioneMatchForMovement`](src/modules/contabilita/components/riconciliazione/runRiconciliazioneMatchForMovement.js) |
| Commit audit | `fiscosim_fiscal_journal_claim` (LAB) | API history + list*History helpers |

### 2) Isolamento società
- Import history loaders: **IMPLEMENTED** — filtro `.eq('societa_id', sid)` / `fetchPagedRows` con `societaColumn`.
- `prima_nota_righe`: filtro per `prima_nota_id` del chunk (isolamento indiretto via PN già scoped) — **PARTIAL** hardening.
- Indici costruiti solo sul bundle della società selezionata in [`index.jsx`](src/modules/import_contabilita/index.jsx).
- `ai_learning`: query per `societa_id` — **IMPLEMENTED** a livello fetch.
- Bank: matcher **senza** parametro società; isolation = lista partite passata (oggi bag fixture globale). Staging draft keyed per società; template guided **non** per società.
- Cross-studio: **non** esiste modello studio condiviso autorizzato per Import Contabilità canonico.

### 3) Decisioni apprese
| Decisione | Import Contabilità | Bank | ai_learning |
|---|---|---|---|
| Conto costo/ricavo | Mode per P.IVA/nome + direzione | No | Sì (frequenza/conto) |
| Causale contabile | Mode | No | No |
| Causale IVA | Mode per P.IVA/nome + direzione + aliquota | No | No |
| Detraibilità % | Mode da `iva_detraibile` | No | No |
| Categoria riga / descrizione doc | **MISSING** | Parziale (text overlap) | Parziale (similarity) |
| Partita / IBAN / ricorrenza bank | N/A | Score euristico, no learn | No |

### 4) Override manuale prioritario
- Contabile: **IMPLEMENTED** — `hasOwnProperty` su mappe manuali; contratto in header di [`importContabilitaAccountingHistory.js`](src/modules/import_contabilita/domain/importContabilitaAccountingHistory.js) L6–7; apply in `index.jsx` ~3641–3654.
- IVA: **IMPLEMENTED** — `manuale > standard Studio > storico` in [`importContabilitaWorkingViewIvaDraft.js`](src/modules/import_contabilita/domain/importContabilitaWorkingViewIvaDraft.js) L97–158; warning se standard≠storico.
- Test: `IMPORT-25A-HISTORY-1` in `importContabilitaWorkingViewIvaDraft.test.js`.

### 5) Solo documenti contabilizzati/confermati?
- Accounting: filtra `prima_nota_id` + `registered_at` / workflow/validation confirmed|registered — **PARTIAL** (non richiede esplicitamente stato PN definitiva; non esclude storni).
- VAT: tutte le righe `registri_iva` della società (limit) — **PARTIAL** (nessun filtro storno/annullamento).

### 6) Annullamenti / storni / rettifiche
- **MISSING** nel motore Import Contabilità history: nessuna esclusione NC/storno né invalidazione indice.
- Retry idempotenti Stage3W: claim evita doppia PN, ma l’indice statistico può ricontare se esistono più documenti eleggibili.

### 7) Feedback operatore
- Import Contabilità: **MISSING** — non scrive proposta vs scelta finale.
- Prima Nota Guidata / `historicalContoSuggestions` / `ai_learning`: **PARTIAL** (path parallelo; non wireato al commit Import Contabilità Stage3W).
- Bank: template guided import localStorage — **PARTIAL** (layout, non match partite).

### 8) Persistenza
| Memoria | Tipo |
|---|---|
| Indice proposte Import | Ricalcolato client-side da PG |
| Scelte staging Working View | Snapshot **localStorage** società |
| Cronologia commit | Server claim LAB + localStorage |
| Bank templates | localStorage |
| `ai_learning` | Server |

### 9) Condivisione Import ↔ Bank
- **PARTIAL / debole:** stesso piano conti e partitario in dominio, ma **nessun identificativo decisioni condiviso**; Bank non legge indici Import; Import non legge match bank.
- Commit fiscal claim con `source_module` distinto (`import_contabilita` vs `riconciliazione_bancaria`).

### 10) Duplicazioni / euristiche pericolose / codice scollegato
- **Duplicato concettuale:** Import Contabilità history (mode) vs `ai_learning` / `historicalContoSuggestions` (Manuale, import_fatture, ArchivioStoricoAI) — due motori.
- **Pericoloso:** mode unico per fornitore+direzione → stesso conto per prodotti diversi (gap esplicito vs requisito “beni vs servizi”).
- **Detraibilità da storico IVA** senza regime/attività — rischio se riusata cross-contesto (oggi isolata per società, ma non per regime).
- **Bank confidence** numerica euristica (0–0.99) non calibrata su accept rate reali.
- Cronologia commit **non** è motore di proposta — già implementata; non duplicare.

---

## 3. Classificazione capacità

| ID | Capacità | Stato | Prove |
|---|---|---|---|
| L-A01 | Indice conto/causale per controparte+direzione | **IMPLEMENTED** | unit `importContabilitaAccountingHistory.test.js` |
| L-A02 | Indice IVA causale/detraibilità per controparte+dir+aliquota | **IMPLEMENTED** | unit `importContabilitaVatHistory.test.js`, WorkingView IVA draft tests |
| L-A03 | Priorità IVA standard Studio > storico + warning | **IMPLEMENTED** | `IMPORT-25A-HISTORY-1` |
| L-A04 | Non overwrite manuale | **IMPLEMENTED** | contratto + apply maps |
| L-A05 | Isolamento societa_id su load | **IMPLEMENTED** | repo loaders |
| L-A06 | Contestualizzazione per descrizione/riga/categoria economica | **MISSING** | — |
| L-A07 | Feedback conferma → apprendimento persistente | **MISSING** (Import Contabilità) | — |
| L-A08 | Invalidazione storni/cambio piano/regime | **MISSING** | — |
| L-A09 | Regole studio autorizzate (Livello B) | **PARTIAL** | solo “standard causale IVA”; no modelli studio generali |
| L-A10 | Conoscenza generale versionata (Livello C) | **PARTIAL** | classificatori/heuristics hardcoded; no tassonomia versionata |
| L-A11 | Spiegazione proposta (fonte, N, recenza, conflitti) | **PARTIAL** | badge sampleCount/lastSeen; no conflict board completo |
| L-A12 | Unificazione con `ai_learning` | **BROKEN/scollegato** | path parallelo Manuale/Archivio |
| L-B01 | Match bank vs partite (1:1 score) | **PARTIAL** | engine + 16 fixture PASS; UI solo se `movementId` fixture |
| L-B02 | 1-N / N-1 / parziali / F24 / giroconto / POS | **PARTIAL** | subset 1-N in engine; R9A blocca multi-chiusura; F24/giroconto proposal-only |
| L-B03 | Apprendimento da conferme bank | **MISSING** | accept locale; claim cronologia ≠ match memory |
| L-B04 | Template layout estratto | **PARTIAL** | localStorage globale (non scoped società) |
| L-B05 | Mass confirm proposte sicure con gate | **MISSING** | `autoMatch`/`confirmSelected` mock in view |
| L-B06 | Partitario/PN live nel matcher | **MISSING** | nessun import `contabilitaRepo` partitario in `riconciliazione/**` |
| L-B07 | Demo id collision `bm-*` mock vs fixture | **FIXED** 20261012 | mock `demo-bm-*`; fixture resta `bm-*` |
| L-C01 | Cronologia commit Import/Bank interrogabile | **IMPLEMENTED** (LAB) | P3-01/02 HISTORY_API PASS `46c60ab` |

---

## 4. Cosa riutilizzare (non riscrivere)

1. `buildImportContabilitaAccountingHistoryIndex` / `resolveImportContabilitaAccountingHistorySuggestion`
2. `buildImportContabilitaVatHistoryIndex` + priorità IVA in `resolveImportWorkingViewCausaleIvaSuggestion`
3. Loaders societa-scoped in `importContabilitaRepo.js`
4. Pipeline match bank: `classifyBankMovement` → `buildRiconciliazioneMatchCandidates` → `scoreRiconciliazioneMatch` → `buildRiconciliazioneDecisionProposal`
5. Commit canonico Stage3W + claim history API (audit, non learning)
6. Contratto payload Import ≡ Manuale (già gate L6)

## 5. Gap prioritari (per architettura)

1. **Decision feedback log** append-only per società (proposta → scelta → commit) — oggi assente su Import Contabilità.
2. **Chiave contestuale** oltre fornitore+direzione (hash descrizione/categoria riga).
3. **Dedup motori** Import history vs `ai_learning` (un solo resolver spiegabile).
4. **Bank decision memory** server-side (match confermati), distinto da claim fiscal.
5. **Livello B studio** esplicito (regole approvate, no UUID conti alieni).
6. Matrice test learning (vedi `MATRICE_TEST_LEARNING_ENGINE.md`).

---

## 6. Impatto sui gate Studio Grade

- Nessuna modifica richiesta ai gate P0–P4 già PASS per questa Fase A.
- L’implementazione (Fase B) deve restare dietro flag LAB / fail-closed e non toccare default prod `createPrimaNotaCompleta` senza consenso.
- Non applicare migration senza approvazione esplicita.

---

## 7. Follow-up audit approfondito (2026-10-12 sera)

Sintesi aggiuntiva (codice esecutivo), allineata agli audit Import/Bank:

### Import Contabilità
- Due pipeline read-only distinte: `registri_iva` → IVA/detraibilità; `documenti_contabilita`+`prima_nota*` → conto/causale; indici modali in memoria.
- Priorità Working View IVA: manuale > standard Studio > storico (test `IMPORT-25A-HISTORY-1`).
- Prefill conto/causale solo se chiave assente in mappe manuali (`index.jsx` ~3641+).
- `registri_iva` senza filtro storno/annullamento; `Math.abs` può far entrare NC nello storico — gap LE-I11.
- `automationMetaByRowId` = traccia batch-apply, **non** ML feedback.
- Doc operativo `AI_WORKING_AREA_FISCOSIM/10_IMPORT_CONTABILITA_OPERATIVO.md` può risultare stale su “residuo” conto/causale (già implementati).

### Bank
- Pipeline reale e testata: `classifyBankMovement` → `buildRiconciliazioneMatchCandidates` → `scoreRiconciliazioneMatch` → `buildRiconciliazioneDecisionProposal`.
- **Partite (20261012):** import estratto → `getPartitarioAperto` + matcher; demo R7B resta su fixture.
- **UI:** source `live_partitario` su movimenti importati; demo mock senza collisioni fixture.
- **Learning:** solo template layout guided import (localStorage); nessun learn da accept match.
- **Persistenza server:** solo claim fiscal LAB (cronologia commit), non audit proposte match.
- **Id demo:** mock `demo-bm-*` (no collision con fixture `bm-*`).

### Implicazioni roadmap SG-L*
- SG-L5 wire partitario live + id fix + memoria LAB local: **PARTIAL PASS** 20261012; DB memory gated.
- SG-L1 **PASS** 20261012 (facade); SG-L2 **PARTIAL** localStorage LAB (schema DB gated).
- L-B07 id collision: **FIXED**.
