# Contratto salvataggio fiscale atomico — SG-P0-01 (2026-10-10)

**Branch:** `feat/studio-grade-accounting-e2e-20261010`  
**Stato:** CANDIDATO documentato + SQL/API LAB-only. **Non collegato** a Manuale/Import UI.  
**PostgreSQL LAB:** NON eseguito in Cloud Agent. Prove Windows: preflight READ ONLY → rehearsal ROLLBACK (approvazione richiesta).

---

## 1. Problema verificato

Path produttivo attuale:

`persistPrimaNotaDraft` → `createPrimaNotaCompleta` (`services/primaNotaService.js`)

Sequenza multi-round-trip: PN → righe → `registri_iva` → aperture/chiusure `partitario` → insert/update `ritenute_dacconto`, con `cleanupPrimaNotaCompleta` best-effort.  
Le **UPDATE** su partite/ritenute preesistenti non sono ripristinate dal cleanup. Nessuna idempotenza server. Nessun `audit_contabile` sul path ordinario.

Stage3U (`fiscosim_post_general_journal`) resta il modello ACID per **solo** movimento generale: **non modificato**.

---

## 2. Contratti distinti (non un JSON ambiguo)

| `contract_kind` | VAT | Ledger | Withholding | Uso |
|---|---|---|---|---|
| `fattura_attiva` | required vendita | `open` | none | Fattura cliente ordinaria |
| `fattura_passiva` | required acquisto | `open` | none | Fattura fornitore |
| `nota_credito_attiva` | required vendita (segni −) | `open` (importo −) | none | NC vendita |
| `nota_credito_passiva` | required acquisto (segni −) | `open` | none | NC acquisto |
| `pagamento` | optional (cassa rilascio futuro) | `close`/`mixed` | optional `pagamento` | Incasso/pagamento |
| `parcella_documento` | required vendita | `open` | required `documento` | Parcella + ritenuta |
| `split_attiva` | required vendita + `split_payment=true` | `open` (imponibile) | none | Split payment |

RPC: `fiscosim_post_fiscal_journal(p_societa_id, p_auth_user_id, p_request_id, p_contract_kind, p_source_module, p_header, p_rows, p_vat, p_ledger, p_withholding, p_reason)`.

Sezioni separate (jsonb), whitelist chiavi, rifiuto proprietà estranee (come Stage3U).

---

## 3. Mappa colonne PostgreSQL (path canonico)

### Testata `prima_nota`
`societa_id`, `data_registrazione`, `data_documento`, `numero_documento`, `causale_id`, `descrizione`, `cliente_fornitore_nome`, `stato='confermata'`, `totale_dare/avere` (derivati server), `created_by` (attore verificato).

**Non accettati dal client:** `stato`, `created_by`, `societa_id` in header, tenant spoof.

**Drift noto:** `esercizio` mappato dal JS produttivo ma **assente** dalle migration Supabase → escluso dalla RPC candidata.

### Righe `prima_nota_righe`
`prima_nota_id`, `riga_numero`, `conto_id` (+ codice/descrizione da `piano_conti`), `descrizione_riga`, `importo_dare/avere`.  
`societa_id` popolato **solo se la colonna esiste** (stesso pattern Stage3U / drift LAB).

### `registri_iva`
`documento_id`, `riga_idx`, `data`, `imponibile`, `iva`, `aliquota`, `tipo`, detraibilità, `prima_nota_id`, `societa_id`, documenti/soggetto, `esigibilita`, `split_payment`, `causale_iva_id`.  
`totale` è UI-only e **non** persistito (già stripped da `sanitizeRegistroIvaForInsert`).

### `partitario` aperture
`societa_id`, `tipo`, `conto_id`, `prima_nota_id`, documenti/scadenza, `importo_originale`, `importo_pagato=0`, `importo_residuo`, `stato='aperta'`, `iva_per_cassa`.

### `partitario` chiusure
`SELECT … FOR UPDATE` su riga; verifica `societa_id`; rifiuto se chiusa o `importo_chiuso` > residuo; UPDATE atomico `importo_pagato/residuo/stato/chiusa_da_prima_nota_id`.

### `ritenute_dacconto`
Insert documento: campi importi + `prima_nota_id` + `partitario_id` apertura.  
Update pagamento: `prima_nota_pagamento_id` + stato/scadenza (stessa transazione).

### `audit_contabile`
Insert obbligatorio fine commit: `source_module` ∈ {`registrazione_manual`,`import_contabilita`}.

### Claim `fiscosim_fiscal_journal_claim`
PK `(societa_id, request_id)`; payload immutabile; replay → stesso `prima_nota_id`.

---

## 4. Sicurezza e integrità

- Membership owner/admin su società attiva (profilo + `utenti_studio_societa`).
- Ogni `conto_id` ∈ `piano_conti` della società e `attivo`.
- Causale contabile della società se presente.
- Partita/ritenuta target: `societa_id` obbligatorio.
- Periodo: rifiuto se `stampe_definitive` valida copre `data_registrazione` (quando tabella presente).
- Idempotenza: conflitto su chiave con payload diverso → errore.
- Rollback totale: nessun DELETE compensativo; un fallimento (es. audit) annulla claim/PN/IVA/partite/ritenute della chiamata.
- ACL: `SECURITY INVOKER`, `EXECUTE` solo `service_role`; claim non leggibile da anon/authenticated.
- Stage3U: nessuna `DROP`/`CREATE OR REPLACE` su `fiscosim_post_general_journal`.

---

## 5. Scenari numerici indipendenti

Modulo: `domain/fiscalAtomicCommit/independentExpectedScenarios.js`  
(non importa servizi Manuale/Import).

| ID | Caso | Attesi chiave |
|---|---|---|
| SG-SC-FA22 | Fattura attiva 22% imponibile 1000 | IVA 220; totale 1220; Dare=Avere 1220; partita 1220; reg. vendita |
| SG-SC-FP22 | Fattura passiva 22% | IVA 220; partita fornitore 1220; reg. acquisto |
| SG-SC-NCA22 | NC attiva 22% | IVA −220; partita −1220 |
| SG-SC-PAY-P | Incasso 500 su 1220 | residuo 720; overpay 720.01 rifiutato |
| SG-SC-PARC | Parcella 1000 + cassa 4% + rit. 20% | IVA 228.80; rit. 200; netto 1068.80; tributo 1040 |
| SG-SC-SPLIT | Split attiva 1000 | partita 1000; IVA 220 split; debito liquidazione 0 |

---

## 6. Artefatti candidati

| File | Ruolo |
|---|---|
| `sql/security_p0/57_stage3w_fiscal_journal_atomic_LAB_ONLY.sql` | Install LAB (richiede GUC approval) |
| `sql/security_p0/58_stage3w_fiscal_journal_matrix_TEST_ONLY.sql` | Matrix SQL ROLLBACK |
| `sql/security_p0/59_stage3w_fiscal_preflight_READ_ONLY.sql` | Preflight READ ONLY |
| `scripts/security_p0/run-stage3w-fiscal-preflight.ps1` | Runner Windows read-only |
| `scripts/security_p0/run-stage3w-fiscal-rehearsal-rollback.ps1` | Rehearsal ROLLBACK |
| `lib/fiscalJournalRequest.js` | Validatore Node whitelist |
| `api/studio/fiscal-journal-post.js` | Facade LAB (`FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED`) |
| `tests/securityP0Stage3wFiscalJournalAtomic.test.js` | Guardie CI |

---

## 7. Prove da eseguire sul worktree Windows (non Cloud)

1. **Preflight READ ONLY** (nessuna scrittura):  
   `.\scripts\security_p0\run-stage3w-fiscal-preflight.ps1 -ExpectedCommit <SHA>`
2. **Su approvazione esplicita — rehearsal ROLLBACK** (schema temporaneo, poi assente):  
   `.\scripts\security_p0\run-stage3w-fiscal-rehearsal-rollback.ps1 -ExpectedCommit <SHA>`
3. Install persistente LAB e JWT Stage3V/L3: **fuori da questo blocco**, richiedono consenso separato (porte loopback SG-P0-00).

### Proposta unica per la prima operazione LAB (ferma qui)

| Voce | Dettaglio |
|---|---|
| Operazione | Rehearsal Stage3W ROLLBACK sul container `supabase_db_FiscoSim-P0-LAB-20261008-164658` |
| Rischi | Avanzamento sequenze PostgreSQL nonostante ROLLBACK; errore a metà lascia DDL Stage3W solo se wrapper fallisce fuori dal txn unico (lo script usa un solo `BEGIN`/`ROLLBACK`) |
| Ripristino | Verifica postflight `STAGE3W_ROLLBACK_VERIFIED\|NO_FISCAL_SCHEMA_PERSISTED`; Stage3U non toccato; nessun volume recreate |
| Non incluso | Install persistente, JWT write, binding UI, porte Docker |

---

## 8. Criteri di accettazione blocco corrente

- [x] Contratto documentato e mappato allo schema
- [x] Matrice numerica indipendente + test Node
- [x] RPC candidata + matrix SQL + preflight
- [x] API LAB non collegata a UI produttiva
- [x] CI estesa al branch Studio Grade / base P0
- [ ] Rehearsal PostgreSQL Windows (approvazione operatore)
- [ ] Install persistente / L3 JWT / wire Manuale (blocchi successivi)
