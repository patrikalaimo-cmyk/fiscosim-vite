# PROJECT_STATE — FiscoSim

## 1. Stato attuale sintetico
* **Fase corrente:** Studio Grade E2E — Audit/matrice/roadmap 2026-10-10 (documentazione + baseline).
* **Branch lavoro:** `feat/studio-grade-accounting-e2e-20261010` (worktree isolato).
* **Base P0:** `security/p0-isolated-hardening-20261008` @ `ceac722f9d8f100c6844c3f5e4ec655a064bf06e`.
* **Branch ordinario:** `mio-branch` — non toccato.
* **Ultimo checkpoint valido sessione:** audit + matrice + roadmap Studio Grade 20261010 + baseline `test:all` 1183 PASS.

## 2. Roadmap attiva immediata
* **Completato questa sessione:** Fase 0 worktree/branch; audit codice; matrice E2E; roadmap P0–P4; harness Stage3V accettazione branch/worktree Studio Grade.
* **Prossimo step codice:** **SG-P0-01** — RPC commit fiscale ACID (PN+IVA+partitario+ritenute+audit+idempotenza) in LAB, rehearsal ROLLBACK prima di install.
* **Prerequisito infra (approvazione):** **SG-P0-00** — porte LAB solo loopback (Stage3V ancora BLOCKED_UNSAFE_PUBLISHED_PORTS).
* **Non ripetere:** Stage 3S / Stage 3U (già PASS).
* **Bank commit reale / RELEASE A100:** ancora BLOCCATI.

## 3. Documenti ufficiali sessione
* `REPORT/AUDIT_STUDIO_GRADE_20261010.md`
* `REPORT/MATRICE_TEST_CONTABILI_E2E.md`
* `REPORT/ROADMAP_COMPLETAMENTO_STUDIO_GRADE.md`
* Append: `REPORT/REPORT_CODEX.md`

## 4. Vincoli non negoziabili
* Nessuna scrittura LIVE / merge `mio-branch` / deploy.
* Nessuna recreate Docker LAB senza consenso.
* Nessuna migrazione/RLS senza approvazione.
* Staging git selettivo (`git add .` vietato).

## 5. Nota storica
* Checkpoint locali precedenti (es. TL-ACQ-02 / `eca9fc0`) restano storici e non certificano il ciclo E2E PostgreSQL attuale.
