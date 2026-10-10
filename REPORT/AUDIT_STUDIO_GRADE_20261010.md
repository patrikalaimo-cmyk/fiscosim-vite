# AUDIT STUDIO GRADE — 2026-10-10

**Branch:** `feat/studio-grade-accounting-e2e-20261010`  
**Base verificata:** `security/p0-isolated-hardening-20261008` @ `ceac722f9d8f100c6844c3f5e4ec655a064bf06e`  
**Worktree isolato (Cloud):** `/home/ubuntu/FiscoSim-StudioGrade-E2E-20261010`  
**Worktree proposto (PC operatore):** `%USERPROFILE%\FiscoSim-StudioGrade-E2E-20261010`  
**Ambiente:** nessuna scrittura PostgreSQL, nessuna migration, nessuno Stage 3S/3U rieseguito.  
**Gerarchia evidenze:** codice/schema > test eseguiti in questa sessione > report cronologicamente recenti > documentazione storica.

---

## 1. Esito determinante

FiscoSim ha un **motore contabile/fiscale avanzato in codice** (Manuale, Import, IVA, split, ritenute, consultazione, stampe) con **CI Node ampia e verde**, ma **non è certificabile Studio Grade** finché:

1. il salvataggio definitivo resta multi-step client-side senza transazione ACID fiscale completa;
2. Stage 3V (JWT firmato → HTTP → PostgREST → PostgreSQL persistente) è `NOT_EXECUTED` e bloccato da porte LAB pubblicate su `0.0.0.0`;
3. nessun gate E2E L2–L5 del ciclo contabile ha evidenza PostgreSQL/browser reale.

I freeze A100 “AUTOMATICO VERDE / MANUALE PENDENTE” restano validi come **gate unitari**, non come certificazione di ciclo reale.

---

## 2. Checkpoint e continuità

| Voce | Valore |
|---|---|
| Repository | `patrikalaimo-cmyk/fiscosim-vite` |
| Branch ordinario preservato | `mio-branch` @ `38bfbc7` (non toccato) |
| Branch P0 sync | `ceac722` = remoto, CI recente SUCCESS (es. `38076788699`) |
| PR P0 | #2 Draft, NON APPLICARE |
| Stage 3S | PASS LAB PostgreSQL (CRM/AgeCon/revisioni) — non rieseguito |
| Stage 3U | PASS install persistente LAB RPC generale — non rieseguito |
| Stage 3V | BLOCKED porte non-loopback + JWT E2E NOT_EXECUTED |
| Baseline questa sessione | `npm run test:all` → **1183/1183 PASS**; `npm run build` → PASS |

---

## 3. Inventario moduli (codice × prove)

Legenda codice: **IMPLEMENTED / PARTIAL / MISSING / BROKEN / LEGACY / BLOCKED**  
Legenda prove: **UNIT_PASS / DB_PASS / HTTP_SIGNED_PASS / UI_E2E_PASS / NOT_EXECUTED / FAIL / BLOCKED**

| # | Modulo | Codice | Prove | Note chiave |
|---|---|---|---|---|
| 1 | Config studio/società/esercizi/piano conti/causali | PARTIAL | UNIT_PASS / NOT_EXECUTED DB-UI | AnagraficheContabiliView operativa; piano conti top-level stub; esercizio = campi società, non calendario periodi |
| 2 | Anagrafiche C/F/prof/percipienti | PARTIAL | UNIT_PASS / HTTP NOT_EXECUTED | Doppio concetto CRM `clienti` vs controparti `piano_conti`; percipienti via TaxCompliance |
| 3 | Registrazione Manuale / PN / Consultazione | IMPLEMENTED (dominio) / **BROKEN (ACID)** | UNIT_PASS / DB NOT_EXECUTED / UI NOT_EXECUTED | Persistenza via `createPrimaNotaCompleta` multi-step; Consultazione read-only freeze OK |
| 4 | Import Contabilità + storico | PARTIAL | UNIT_PASS / UI NOT_EXECUTED | Pipeline canonica avanzata; UI “Cronologia import” placeholder; commit reale non certificato |
| 5 | Registri IVA e liquidazioni | IMPLEMENTED (core) | UNIT_PASS / DB NOT_EXECUTED | Freeze automatico; LIPE XML ministeriale incompleto |
| 6 | Partitario C/F | PARTIAL | UNIT_PASS | Sync/apertura/chiusura in dominio; stampe partitari ancora mock |
| 7 | Incassi/pagamenti/scadenze/insoluti | PARTIAL | UNIT_PASS | Via Manuale + partitario; **insoluti MISSING** |
| 8 | Ritenute / CU / 770 / F24 controllo | PARTIAL / BLOCKED (parziale) | UNIT_PASS | Pagamento parziale ritenuta bloccato esplicitamente; F24 controllo importato incompleto; CU WIP |
| 9 | Riconciliazione Bancaria | PARTIAL / **BLOCKED** commit | UNIT_PASS | Dry-run forzato; nessuna RPC atomica commit; storico locale |
| 10 | Bilancio / mastrini / giornale | PARTIAL | UNIT_PASS | Giornale operativo; mastrini/bilancio modelli parziali; UI stampe spesso mock |
| 11 | Cespiti / ammortamenti / assestamenti | PARTIAL | UNIT_PASS | Bridge post-save; assestamenti/ratei non end-to-end |
| 12 | Stampe / export / fascicolo | PARTIAL / fascicolo **MISSING** | UNIT_PASS | Definitiva UI bloccata senza attestazioni server; fascicolo assente |
| 13 | Chiusura / riapertura periodi/esercizi | PARTIAL | UNIT_PASS (audit teorico) | Lock periodo via stampa/liquidazione; chiusura/riapertura esercizio NON implementata |
| 14 | Auth / ruoli / isolamento / audit | PARTIAL | DB_PASS (3S/3U scope) / HTTP_SIGNED **NOT_EXECUTED** | Hardening avanzato; porte LAB unsafe; anon residuals storici su LIVE audit |
| 15 | Accessori (AgeCon, F24, agenda, CU, AI…) | PARTIAL | misto | AgeCon API scoped in LAB; F24 scadenzario studio non collegato a liquidazione |

---

## 4. Audit prioritario integrità contabile

### 4.1 Percorso produttivo attuale

`RegistrazioneManualeView` / Import → `persistPrimaNotaDraft` → **`createPrimaNotaCompleta`** (`services/primaNotaService.js`).

Sequenza osservata (chiamate DB distinte, non una transazione PostgreSQL):

1. INSERT `prima_nota`
2. INSERT `prima_nota_righe`
3. INSERT `registri_iva`
4. INSERT aperture `partitario` + UPDATE chiusure partite
5. INSERT `ritenute_dacconto` + UPDATE maturazioni

`cleanupPrimaNotaCompleta` cancella best-effort per `prima_nota_id` e **non ripristina** UPDATE su partite/ritenute preesistenti. Nessuna chiave di idempotenza sul percorso produttivo.

### 4.2 Percorsi correlati

| Percorso | Ruolo | Limitazione |
|---|---|---|
| `fiscosim_post_general_journal` (Stage3U) | ACID LAB: testata+righe+audit+claim | **Senza** IVA/partitario/ritenute; non collegato a Manuale/UI |
| `commitCanonicalAccountingPayload` | Validazione/audit/idempotenza | Real commit SQL marcato TODO / disabled |
| Bank `commitReconciliationCanonicalPayload` | Dry-run | `allowRealCommit: false` |

**Classificazione ACID fiscale completo:** BROKEN / NOT_IMPLEMENTED  
**Prove:** UNIT_PASS (MockDb) · DB_PASS solo Stage3U generale · HTTP_SIGNED NOT_EXECUTED · UI_E2E NOT_EXECUTED

---

## 5. Infrastruttura P0 (senza ripetere 3S/3U)

| Elemento | Stato |
|---|---|
| Due stack Supabase locali | Confermato in report P0: ordinario `54321/54322` vs LAB `55321/55322` |
| Volume LAB Stage3U | Da preservare; nessuna recreate |
| Porte LAB | Pubblicate su `0.0.0.0`/`[::]` → Stage3V **BLOCKED_UNSAFE_PUBLISHED_PORTS** |
| Correzione porte | Progettata; **richiede approvazione** (recreate controllata con volume) |
| Harness Stage3V | Aggiornato in questa sessione per accettare branch/worktree Studio Grade senza indebolire SHA/rete/host |

---

## 6. Legacy e duplicati rilevanti

- Import: `import_contabilita` (canonico) vs `import_unificato` / `import_fatture` / `DISUSO`
- `src/modules/iva` non montato; percorso reale Contabilità/TaxCompliance/Stampe
- `piano_conti` top-level stub vs Anagrafiche Contabili
- BankingView legacy vs Riconciliazione nuova
- `accounting_entries` e area DISUSO da isolare in P4

---

## 7. Prima attività tecnica che sblocca il ciclo reale

**SG-P0-01 — Commit fiscale ACID canonico (estensione Stage3U)**  
Progettare e collaudare in LAB (dopo Stage3V sicuro) una RPC unica che, in una sola transazione, persista PN + IVA + partitario + ritenute + audit + idempotenza, con rollback integrale e rifiuto cross-company. Solo dopo: collegare `persistPrimaNotaDraft` dietro feature-flag LAB.

Prerequisito infrastrutturale parallelo (approvazione richiesta): **SG-P0-00** contenimento porte LAB su loopback + Stage3V JWT read-only/write opt-in.

Dettaglio roadmap: `REPORT/ROADMAP_COMPLETAMENTO_STUDIO_GRADE.md`.  
Matrice scenari: `REPORT/MATRICE_TEST_CONTABILI_E2E.md`.
