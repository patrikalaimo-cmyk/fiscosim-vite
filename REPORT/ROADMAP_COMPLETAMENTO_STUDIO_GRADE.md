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

### SG-P0-00 — Contenimento porte stack P0 (LAB only)
| Campo | Contenuto |
|---|---|
| Problema | LAB pubblica `55321–55327` (e DB `55322`) su `0.0.0.0`/`[::]`; Stage3V fail-closed |
| File/servizi | Docker P0 compose/CLI reale; `scripts/security_p0/stage3v-local-stack.mjs` |
| Riutilizzabile | Topologia `fiscosim-p0-loopback`, volume `supabase_db_FiscoSim-P0-LAB-20261008-164658`, Stage3U RPC |
| Lavoro | Redesign binding loopback-only; verifica volume/Stage3U post-recreate |
| Dipendenze | Approvazione esplicita operatore; backup volume; nessuna touch stack ordinario `54321` |
| Rischio | **P0** — perdita volume o contaminazione stack |
| Test | Readiness Stage3V post-fix; inventory RPC Stage3U ancora presente |
| Accettazione | Tutte le porte LAB bind `127.0.0.1`/`::1`; Stage3U schema ancora PASS; readiness non BLOCKED_UNSAFE |
| Approvazione | **OBBLIGATORIA** prima di stop/rm/recreate |

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

### SG-P0-02 — Stage3V JWT → HTTP → PostgreSQL
| Campo | Contenuto |
|---|---|
| Problema | `REAL_JWT_E2E=false`; harness pronto ma non eseguito |
| File | `stage3v-signed-jwt-general-journal-e2e.mjs`, `stage3v-lab-binding.mjs` (già aggiornato per branch/worktree Studio Grade) |
| Lavoro | Dopo SG-P0-00: readiness → binding A/B → opt-in write generale → estensione fiscale |
| Rischio | P0 |
| Accettazione | Marker esplicito PASS con SHA, società `STAGE3V-`/`SG-E2E-`, query post-commit |
| Approvazione | Write persistente opt-in |

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
| SG-P2-04 | Parcella + ritenuta integrale + 1040 | — | Scadenzario + CU readiness |
| SG-P2-05 | Pagamento parziale ritenuta | Oggi BLOCKED | Implementare **o** escludere formalmente A100 |
| SG-P2-06 | Controllo F24 importato vs maturato | Non compilatore | Stati verde/giallo/rosso |
| SG-P2-07 | Liquidazione da PN reali + blocco definitiva | — | Doppio consolidamento negato |

---

## P3 — Operatività studio

| ID | Intervento | Accettazione |
|---|---|---|
| SG-P3-01 | Bank RPC atomica + storico server | Commit solo via canonico; no bypass Manuale |
| SG-P3-02 | Cronologia Import UI + hash file | Storico interrogabile |
| SG-P3-03 | Stampe Partitari/Mastrini/Bilancio da PN (no mock) | UI `isOperativo` su modelli canonici |
| SG-P3-04 | Fascicolo cliente PDF | Un file fine periodo |
| SG-P3-05 | Cespiti operativi + quote | Bridge non duplica PN |
| SG-P3-06 | Chiusura/riapertura esercizio | Continuity saldi; lock; audit |
| SG-P3-07 | Aging / insoluti | Report residui coerente mastrini |

---

## P4 — Stabilizzazione Studio Grade

| ID | Intervento |
|---|---|
| SG-P4-01 | Suite L5 dataset multi-periodo sintetico |
| SG-P4-02 | L6 regressione LAB ripetibile + report |
| SG-P4-03 | Eliminazione/isolamento DISUSO + `accounting_entries` |
| SG-P4-04 | Performance volumi (500+ doc, stampe paginate) |
| SG-P4-05 | Chiusura debito collaudi manuali (`FISCOSIM_MANUAL_TEST_DEBT.md`) |
| SG-P4-06 | Documentazione operativa studio + backup/restore LAB |
| SG-P4-07 | Criterio “completo nel perimetro”: tutti scenari obbligatori matrice = PASS reale |

---

## Fuori perimetro (invariato)

- Invio diretto SDI / AdE
- Conservazione sostitutiva
- Compilatore F24 ministeriale completo
- Scarico massivo AdE come ingresso contabile primario

---

## Prossima sessione di sviluppo (blocco verticale #1)

1. **Non** applicare SG-P0-00 senza approvazione.  
2. Avviare **SG-P0-01**: specifica SQL + matrice L2 ROLLBACK per commit fiscale completo, riusando Stage3U.  
3. Aggiungere test che **falliscono oggi** sul path produttivo (mancanza transazione/idempotenza) come gate.  
4. Solo dopo rehearsal PASS: proporre install LAB e Stage3V write.

Checkpoint operativo: `AI_WORKING_AREA_FISCOSIM/PROJECT_STATE.md` e append `REPORT/REPORT_CODEX.md`.
