# Stage3W — Runbook LAB Windows (operatore)

**Approvazione ricevuta in chat:** procedere con prove LAB Stage3W.  
**Cloud Agent:** nessun Docker P0 disponibile → queste prove vanno eseguite sul PC Windows con lo stack `FiscoSim-P0-LAB-20261008-164658`.

## Vincoli

- Worktree: `%USERPROFILE%\FiscoSim-StudioGrade-E2E-20261010` (o equivalente) sul branch `feat/studio-grade-accounting-e2e-20261010`
- Container obbligatorio: `supabase_db_FiscoSim-P0-LAB-20261008-164658`
- Cartella report: `%USERPROFILE%\FiscoSim-P0-LAB-20261008-164658`
- **Non** usare porte `54321` / stack ordinario
- **Non** ricreare volumi/container
- Stage 3S / 3U: **non rieseguire**
- Dopo ogni prova: allegare il file report generato in chat

## 0. Allinea il worktree allo SHA da collaudare

```powershell
cd $env:USERPROFILE\FiscoSim-StudioGrade-E2E-20261010
git fetch origin feat/studio-grade-accounting-e2e-20261010
git checkout feat/studio-grade-accounting-e2e-20261010
git pull origin feat/studio-grade-accounting-e2e-20261010
git rev-parse HEAD
git status --short
```

Usa l’output di `git rev-parse HEAD` come `-ExpectedCommit` nei passi seguenti (working tree pulito).

## 1. Preflight READ ONLY (nessuna scrittura)

```powershell
.\scripts\security_p0\run-stage3w-fiscal-preflight.ps1 -ExpectedCommit <SHA_HEAD>
```

**PASS atteso nel report:** `STAGE3W_PREFLIGHT|READ_ONLY_PASS|NO_ACCOUNTING_POST`

## 2. Rehearsal ROLLBACK (approvata) — schema temporaneo, poi assente

```powershell
.\scripts\security_p0\run-stage3w-fiscal-rehearsal-rollback.ps1 -ExpectedCommit <SHA_HEAD>
```

**PASS attesi:**

- `STAGE3W_LAB_MATRIX|PASS|FIXTURE_ROLLBACK`
- `STAGE3W_ROLLBACK_VERIFIED|NO_FISCAL_SCHEMA_PERSISTED`
- notice matrix: fattura 1220, pagamento residuo 720, NC −1220, split 1000, parcella 1068.80 + ritenuta 200

### Rischi e ripristino

| Rischio | Mitigazione |
|---|---|
| Sequenze PG avanzano nonostante ROLLBACK | Accettabile solo in LAB vuoto/sintetico |
| Fallimento a metà wrapper | Script usa un solo `BEGIN`/`ROLLBACK`; postflight verifica assenza schema Stage3W |
| Contaminazione Stage3U | Script non DROP/REPLACE `fiscosim_post_general_journal`; postflight non tocca Stage3U |

**Ripristino se rehearsal FAIL:** non rieseguire alla cieca; conservare report; non installare; non `docker rm` / volume wipe senza nuova approvazione.

## 3. NON eseguire ancora (richiede nuova approvazione esplicita)

Install persistente LAB:

```powershell
# NON ESEGUIRE finché non richiesto esplicitamente dopo rehearsal PASS
.\scripts\security_p0\run-stage3w-fiscal-persistent-lab-install.ps1 `
  -ExpectedCommit <SHA_HEAD> -ApproveLabSchemaInstall
```

Wire UI Manuale/Import e JWT write: fuori perimetro di questa prova.
