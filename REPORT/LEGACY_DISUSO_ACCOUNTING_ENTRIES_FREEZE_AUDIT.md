# FREEZE AUDIT — DISUSO + accounting_entries isolation (SG-P4-03)

**Data:** 2026-10-12  
**Branch:** `feat/studio-grade-accounting-e2e-20261010`  
**Principio:** isolamento / anti-reintroduzione — **non** mass-delete né DROP TABLE.

## Scope

| In scope | Out of scope |
|---|---|
| Ban import live di `DISUSO/` | Cancellare cartella `DISUSO/` |
| Path fiscali canonici senza `accounting_entries` | DROP / revoke ACL LIVE su AE |
| Allowlist consumer legacy AE + scan fail-if-new | Smontare `import_unificato` da NAV |
| Evidence Stage3W + unit test | Rewrire AI/Da Validare off AE in questo ticket |

## DISUSO

- Cartella `DISUSO/import_nuovo/` (4 file) — archivio; **zero** import da `src|services|lib|scripts|api|qa`.
- Twin `src/modules/import_nuovo` non montato; `App.jsx` redirect `import_nuovo` → `import_contabilita`.

## accounting_entries

- Tabella **trattenuta** (pipeline AI, Da Validare, sync legacy, test_mode, qa smoke).
- Nuove scritture fiscali Studio Grade restano su `prima_nota` / Stage3W RPC.
- Allowlist completa in `legacyIsolationPolicy.js` (19 path). Qualsiasi nuovo `.from('accounting_entries')` o `insertAccountingEntry(` fuori allowlist **FAIL** test.

## Canonici (devono restare puliti)

- `persistPrimaNotaDraft.js`, `mapPersistencePlanToFiscalJournalRequest.js`
- `buildImportContabilitaCommitPayload.js`, `importContabilitaWorkflow.js`
- `lib/fiscalJournalRequest.js`, `services/primaNotaService.js`

## Prove

- Unit: `tests/legacyIsolationPolicy.test.js`
- Script: `scripts/security_p0/run-stage3w-p4-03-legacy-isolation.mjs`
- Fingerprint: `P403ISO2|disuso=PASS;canonical=PASS;allowlistScan=PASS;allowlist=N`
- Evidence: `REPORT/STAGE3W_P4_03_LEGACY_ISOLATION_*.txt`

## Accettazione

1. Nessun import `DISUSO`
2. Canonici AE-free
3. Scan allowlist PASS
4. Unit + evidence `P4_03_RESULT=PASS`
5. Nessuna modifica LIVE / nessuna mass delete
