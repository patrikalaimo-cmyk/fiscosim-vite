# ROADMAP COMPLETAMENTO STUDIO GRADE — 2026-10-10

**Derivata da:** `REPORT/AUDIT_STUDIO_GRADE_20261010.md` + `REPORT/MATRICE_TEST_CONTABILI_E2E.md`  
**Base codice:** `feat/studio-grade-accounting-e2e-20261010` ← `ceac722` (P0)  
**Principio:** non riscrivere moduli verdi; chiudere lacune di integrità, prove reali e blocchi verticali.

---

## Ordine esecutivo (dipendenze effettive)

```
SG-P0-00 porte LAB (approvazione)
        ↓
SG-P0-01 RPC fiscale ACID + idempotenza
        ↓
SG-P0-02 Stage3V JWT HTTP persistente (generale → fiscale)
        ↓
SG-P1-* ciclo ordinario Manuale/Import/IVA/partitario
        ↓
SG-P2-* regimi speciali / ritenute / liquidazione
        ↓
SG-P3-* bank / stampe / cespiti / chiusure
        ↓
SG-P4-* stabilizzazione / legacy / fascicolo / release
```

I freeze A100 automatici restano regressione L1 obbligatoria a ogni blocco.

---

## P0 — Sicurezza, integrità, atomicità

### SG-P0-00 — Contenimento porte stack P0 (LAB only) — **PASS** 20261012
| Campo | Contenuto |
|---|---|
| Problema | LAB pubblica `55321–55327` (e DB `55322`) su `0.0.0.0`/`[::]`; Stage3V fail-closed |
| File/servizi | `scripts/security_p0/run-sg-p0-00-loopback-rebind.mjs`, `verify-sg-p0-00-loopback.mjs`, `stage3v-local-stack.mjs` |
| Riutilizzabile | Topologia `fiscosim-p0-loopback`, volume `supabase_db_FiscoSim-P0-LAB-20261008-164658`, Stage3U RPC |
| Lavoro | Recreate publish `127.0.0.1:host:container`; snapshot/restore `/home/kong`; verify Stage3V+RPC |
| Dipendenze | Approvazione esplicita operatore; backup volume; nessuna touch stack ordinario `54321` |
| Rischio | **P0** — perdita volume o contaminazione stack |
| Test | Evidence `REPORT/STAGE3W_SG_P0_00_LOOPBACK_20261012130553.txt` |
| Accettazione | Tutte le porte LAB bind `127.0.0.1`; Stage3U/W RPC presenti; Stage3V `ready=true` |
| Approvazione | **Concessa** 20261012 («autorizzo tutto») |

### SG-P0-01 — Commit fiscale ACID canonico ★ PRIMO INTERVENTO CODICE
| Campo | Contenuto |
|---|---|
| Problema | `createPrimaNotaCompleta` multi-step + cleanup best-effort; UPDATE partite/ritenute non revertibili; no idempotenza prod |
| File | `services/primaNotaService.js`; `persistPrimaNotaDraft.js`; nuovo `sql/security_p0/5x_fiscal_journal_atomic_LAB_ONLY.sql`; API LAB; test matrix |
| Riutilizzabile | Contratto Stage3U (claim, membership, centesimi, late-fail); payload canonico Manuale; mapper IVA/partitario/ritenute |
| Lavoro | RPC unica: claim → PN → righe → registri_iva → partite (insert/update) → ritenute → audit; fail qualsiasi fase = rollback; replay idempotente |
| Dipendenze | Schema LAB Stage3U; non collegare UI finché L2 PASS; SG-P0-00 per L3 |
| Rischio | **P0** — dati parziali / doppia contabilizzazione |
| Test | L1 contract; L2 matrix A/B, squadratura, mid-fail, replay, cross-company; poi L3 |
| Accettazione | Un errore forzato dopo INSERT IVA lascia **zero** residui PN/IVA/partite/ritenute mutate; stesso `request_id` → stesso UUID |
| Approvazione | Install LAB persistente dopo rehearsal ROLLBACK PASS |

### SG-P0-02 — Stage3V JWT → HTTP → PostgreSQL — **PASS** 20261012
| Campo | Contenuto |
|---|---|
| Problema | `REAL_JWT_E2E=false`; harness pronto ma non eseguito |
| File | `provision-stage3v-lab-fixtures.mjs`, `run-stage3v-general-journal-write.mjs`, readiness, FA22 |
| Lavoro | Fixtures `STAGE3V-A/B`; readiness; fiscal FA22; general-journal A/B JWT persist + replay/403/400/409 |
| Rischio | P0 |
| Accettazione | `STAGE3V_REAL_SIGNED_JWT_PERSISTENT_POSTING_PASS` + evidence `STAGE3W_SG_P0_02_GENERAL_JOURNAL_*` |
| Approvazione | Write persistente opt-in (concesso) |

### SG-P0-03 — Audit + blocchi periodo su path produttivo
| Campo | Contenuto |
|---|---|
| Problema | Audit incompleto su path multi-step; stampa definitiva RPC non prova byte file |
| File | `audit_contabile`, RPC stampe, `consolidazioneStampaDefinitiva` |
| Lavoro | Audit obbligatorio in RPC fiscale; design server checksum/snapshot (migration approvata) |
| Rischio | P0 |
| Accettazione | Ogni commit fiscale ha evento audit; definitiva senza attestazione server rifiutata anche via API |

### SG-P0-04 — Residui sicurezza non contabili
| Campo | Contenuto |
|---|---|
| Problema | LIVE audit storico anon grants; Stage3T JWT CRM not executed |
| Lavoro | Solo LAB; nessun LIVE senza consenso |
| Rischio | P0 |
| Accettazione | Matrice TEN + JWT A/B CRM/AgeCon |

---

## P1 — Ciclo contabile ordinario reale

| ID | Intervento | Dipende | Accettazione misurabile |
|---|---|---|---|
| SG-P1-01 | Vertical fattura passiva 22%: XML→Import→commit RPC→PN/IVA/partita | P0-01/02 | Query PG: 1 PN, N righe IVA, 1 partita, Dare=Avere |
| SG-P1-02 | Fattura attiva + NC segni | P1-01 | Registro corretto + partita segno |
| SG-P1-03 | Multi-aliquota 22+10 + prune 0/0 | P1-01 | N righe IVA; 0/0 assenti |
| SG-P1-04 | Incasso/pagamento totale e parziale | P0-01 | Residuo partita; no overpay |
| SG-P1-05 | Equivalenza Import vs Manuale stesso doc | P1-01 | Hash effetti contabili uguali |
| SG-P1-06 | Consultazione L4 read-only su dati persistiti | P1-01 | Nessun write; filtri coerenti |

---

## P2 — Casi fiscali speciali

| ID | Intervento | Note | Accettazione |
|---|---|---|---|
| SG-P2-01 | Split payment E2E | Conto tecnico config; partitario imponibile | Liquidazione esclude debito split |
| SG-P2-02 | IVA per cassa E2E | Rilascio su cash event | Quota nel periodo corretto |
| SG-P2-03 | Reverse/estero limato | Causali policy; doppia annotazione | Neutralità IVA + partitario imponibile |
| SG-P2-04 | Parcella + ritenuta integrale + 1040 | PASS 20261012 (Import+JWT pay; fix rit updated_at) | Scadenzario + CU readiness |
| SG-P2-05 | Pagamento parziale ritenuta | PASS 20261012 (pro-quota residual+matured) | Implementare **o** escludere formalmente A100 |
| SG-P2-06 | Controllo F24 importato vs maturato | PASS 20261012 (verde/giallo/rosso su 1040) | Stati verde/giallo/rosso |
| SG-P2-07 | Liquidazione da PN reali + blocco definitiva | PASS 20261012 (dic FA+FP; definitiva blocca) | Doppio consolidamento negato |

---

## P3 — Operatività studio

| ID | Intervento | Note | Accettazione |
|---|---|---|---|
| SG-P3-01 | Bank RPC atomica + storico server | PASS 20261012 (Stage3W bank close + claim history + replay) | Commit solo via canonico; no bypass Manuale |
| SG-P3-02 | Cronologia Import UI + hash file | PASS 20261012 (claim fileHash + UI panel + history) | Storico interrogabile |
| SG-P3-03 | Stampe Partitari/Mastrini/Bilancio da PN (no mock) | PASS 20261012 (modelli da PN/partitario; no mock KPI) | UI `isOperativo` su modelli canonici |
| SG-P3-04 | Fascicolo cliente PDF | PASS 20261012 (HTML unico + hash da modelli PN; print-to-PDF) | Un file fine periodo |
| SG-P3-05 | Cespiti operativi + quote | PASS 20261012 (bridge link PN + quote; no 2nd PN) | Bridge non duplica PN |
| SG-P3-06 | Chiusura/riapertura esercizio | PASS 20261012 (continuity + periodo_chiuso_lock + auditRaccordo) | Continuity saldi; lock; audit |
| SG-P3-07 | Aging / insoluti | PASS 20261012 (aging da partitario; ≡ totaleAperto + apertura in mastrini) | Report residui coerente mastrini |

---

## P4 — Stabilizzazione Studio Grade

| ID | Intervento |
|---|---|
| SG-P4-01 | Suite L5 dataset multi-periodo sintetico — **PASS** 20261012 (fingerprint L5MP1) |
| SG-P4-02 | L6 regressione LAB ripetibile — **PASS** 20261012 (`l6_lab_core_v3` + Import P1_01/P1_05/P3_02; fingerprint L6CORE3) |
| SG-P4-03 | Isolamento DISUSO + `accounting_entries` — **PASS** 20261012 (fingerprint `P403ISO2`; allowlist 19 + anti-reintro scan; freeze audit) |
| SG-P4-04 | Performance baseline LAB — **PASS** 20261012 (L6 core ~12s; 500+ SLA resta debito manuale) |
| SG-P4-05 | Debito collaudi manuali — **documentato** 20261012 (LAB≠browser; nessuna chiusura silente) |
| SG-P4-06 | Doc operativa + backup/restore LAB — **PASS** 20261012 (`LAB_BACKUP_RESTORE_OPERATIVA.md`) |
| SG-P4-07 | Completo nel perimetro (evidence gate) — **PASS** 20261012 (automatismi LAB; browser escluso) |

---

## Fuori perimetro (invariato)

- Invio diretto SDI / AdE
- Conservazione sostitutiva
- Compilatore F24 ministeriale completo
- Scarico massivo AdE come ingresso contabile primario

---

## Avanzamento SG-P0-01 (2026-10-10)

- Contratto, scenari indipendenti, RPC candidata Stage3W, matrix SQL, API LAB e CI branch: **preparati in codice**.
- Dettaglio: `REPORT/FISCOSIM_FISCAL_ATOMIC_COMMIT_CONTRACT_20261010.md`.
- Windows P0 LAB: preflight READ-ONLY **PASS** + rehearsal ROLLBACK **PASS** + install persistente **PASS** (`…231404-750.txt`, commit `fe21da0`). RPC Stage3W presente; fixture rolled back; Stage3U OK.
- Wire Manuale/Import → Stage3W: **implementato dietro flag LAB (default OFF)**. Attivazione runtime richiede env LAB + `dev-api` + sessione owner/admin.
- Launcher UI LAB + smoke HTTP: script pronti (`start-stage3w-lab-ui-stack.ps1`, `smoke-stage3w-fiscal-lab-http.ps1`); hardening launch fino a `53e1f8e`.
- ~~L3 JWT bloccato da porte non-loopback~~ **SG-P0-00 PASS** 20261012 (porte `127.0.0.1` only; Stage3V ready).
- P3 chiusa; P4-01..07 automatismi LAB PASS; debito browser manuale ancora aperto.

## Prossima sessione

1. ~~SG-P0-00~~ / ~~SG-P0-02~~ **FATTO** (general-journal Stage3V A/B PASS).
2. ~~P4 automatismi LAB (01..07)~~ **FATTO**; L6 v3 include Import + P4-03.
3. L4 browser shell: Consultazione + Manuale + Import + Liquidazioni IVA **PASS** (smoke; non chiude debito A100 dettagliato).
4. Residuo: upload/commit Import UI, consolidamento IVA/LIPE UI, Bank UI; P0-03/P0-04; cutover prod solo con consenso.
5. Default produttivo resta `createPrimaNotaCompleta` finche UI non certificata.
Checkpoint operativo: `AI_WORKING_AREA_FISCOSIM/PROJECT_STATE.md` e append `REPORT/REPORT_CODEX.md`.
