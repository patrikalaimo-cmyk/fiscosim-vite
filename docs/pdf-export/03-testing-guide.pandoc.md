<!--

  Pandoc — PDF export (example)
  -----------------------------
  pandoc 01-operational-manual.pandoc.md -o FiscoSim-Operational-Manual.pdf \
    --from=markdown+raw_tex \
    --pdf-engine=xelatex \
    --toc --toc-depth=3 \
    -V documentclass=article \
    -V geometry:margin=2.5cm

  Use xelatex for Unicode (Italian UI terms). Install: TeX Live / MiKTeX.

-->

---
title: "FiscoSim"
subtitle: "Testing Guide — Step-by-step"
author: "FiscoSim QA / Engineering"
date: "2026"
lang: en-GB
documentclass: article
classoption:
  - oneside
geometry: margin=2.5cm
fontsize: 11pt
linestretch: 1.15
toc: true
toc-depth: 3
numbersections: false
colorlinks: true
linkcolor: Blue
urlcolor: Blue
header-includes:
  - |
    % Spacing and readability (Pandoc → LaTeX)
    \usepackage{setspace}
    \setstretch{1.15}
    \usepackage{parskip}
    \setlength{\parskip}{0.7em plus 0.2em minus 0.1em}
    \usepackage{needspace}
    \let\oldsection\section
    \renewcommand{\section}{\needspace{6\baselineskip}\oldsection}
---

```{=latex}
\thispagestyle{empty}
\vspace*{0.14\textheight}
\begin{center}
{\Huge\textbf{FiscoSim}}\\[14pt]
{\Large Testing Guide}\\[10pt]
{\large Step-by-step validation}\\[40pt]
{\normalsize \textit{PDF export edition}}\\[6pt]
{\normalsize 2026}
\end{center}
\vfill
\begin{center}
\small\textit{Generated from Markdown. Optimised for Pandoc (XeLaTeX or pdfLaTeX).}
\end{center}
\newpage
```


**Goal:** Execute repeatable checks so a tester can validate features end-to-end.  
**Format:** Each test uses **STEP n:** and **EXPECTED RESULT:** as labeled lines.  
**Screenshots:** Replace placeholders `[SCREENSHOT: …]` when publishing internally.

---



## 0. Global prerequisites

Before running suites below:

STEP 1:  
Install dependencies: `npm install` in the project root.

STEP 2:  
Start the SPA: `npm run dev` (note the URL, usually `http://localhost:5173`).

STEP 3:  
For API-backed flows (pipeline, some AI, Test Mode runs): start `npm run dev:api` and ensure `.env` contains valid Supabase variables (`SUPABASE_URL`, service role or equivalents per your setup).

STEP 4:  
Apply Supabase migrations needed for `documenti_contabilita`, `accounting_entries`, `pipeline_runs`, `test_scenarios`, `fiscal_knowledge`, `ai_insights` (as required by the tests you run).

EXPECTED RESULT:  
App loads without console errors; API responds (no 503 on health/scenario routes when env is correct).

`[SCREENSHOT: login page loaded]`

---





## 1. Basic tests

## Test 1.1 — Login and session

**Scenario:** A valid user can sign in and reach the dashboard.

STEP 1:  
Open the app URL in a supported browser.

STEP 2:  
Enter valid credentials and submit login.

STEP 3:  
Observe the main shell (navigation, user menu or initials).

EXPECTED RESULT:  
No login error; dashboard (or default home tab) is visible; session persists on refresh if your deployment configures it.

`[SCREENSHOT: dashboard after login]`

---

## Test 1.2 — Navigation and module access

**Scenario:** Main menu entries open the correct module without errors.

STEP 1:  
From the dashboard, click each primary nav item you need to certify (e.g. Import Documenti, Prima nota, Liquidazione IVA, Gestione F24).

STEP 2:  
For each module, wait for the page header/title to match the module.

STEP 3:  
Open browser devtools console and confirm no uncaught errors on navigation.

EXPECTED RESULT:  
Each module renders its main layout; console free of blocking errors for that navigation.

`[SCREENSHOT: navigation menu expanded]`

---

## Test 1.3 — Company (società) context

**Scenario:** Data shown respects the selected company when multiple companies exist.

STEP 1:  
If the UI offers a company selector, note the current company name or id.

STEP 2:  
Switch to another company (if available).

STEP 3:  
Open **Prima nota** or **Import Documenti** and verify lists change (or empty state is coherent).

STEP 4:  
Switch back to the first company.

EXPECTED RESULT:  
Lists and counts differ per company or correctly show empty state; no cross-company data leakage.

`[SCREENSHOT: società selector]`

---

## Test 1.4 — Role permissions (if applicable)

**Scenario:** A **collaborator** cannot open restricted modules (e.g. Utenti).

STEP 1:  
Log in as a user with role **collaboratore**.

STEP 2:  
Verify **Utenti** (or other admin-only items) are hidden or access is denied.

STEP 3:  
Log in as **admin** or **owner** and confirm the same item is available.

EXPECTED RESULT:  
Collaborator blocked or item absent; admin/owner can access.

`[SCREENSHOT: access denied or missing nav item]`

---





## 2. Import tests

## Test 2.1 — Import XML passive invoice

**Scenario:** Electronic invoice XML is accepted and fields are populated.

STEP 1:  
Open **Import Documenti** (unified import).

STEP 2:  
Select the test company.

STEP 3:  
Upload a valid **fattura elettronica** XML (passive purchase).

STEP 4:  
Wait for analysis to complete.

STEP 5:  
Review proposed type, totals, supplier, and dates against the XML.

EXPECTED RESULT:  
Document type suggests passive invoice; main monetary fields match XML; no hard crash; user can save/confirm per product flow.

`[SCREENSHOT: Import Documenti — XML analyzed]`

---

## Test 2.2 — Import PDF with text (AI path)

**Scenario:** PDF with extractable text is classified via AI (local or online per settings).

STEP 1:  
Set AI mode in the app to **local** (if testing Ollama) or **online** (if testing Claude), per studio policy.

STEP 2:  
Upload a PDF invoice with **selectable text**.

STEP 3:  
Wait for the AI analysis phase to finish.

STEP 4:  
Verify supplier name and totals are plausible.

EXPECTED RESULT:  
Analysis completes or shows a clear error (e.g. Ollama down); if success, fields are filled and editable before confirm.

`[SCREENSHOT: Import Documenti — PDF AI result]`

---

## Test 2.3 — Import preprocess on vs off (advanced)

**Scenario:** Toggling preprocess changes behavior only for PDF/AI path (smoke).

STEP 1:  
With the same PDF as Test 2.2, run import with **preprocess ON** (default).

STEP 2:  
Note confidence or extracted text quality.

STEP 3:  
Repeat with **preprocess OFF** (if exposed in UI).

EXPECTED RESULT:  
Both complete or fail predictably; no silent empty save; differences in extracted text length or quality may appear (document observationally).

`[SCREENSHOT: preprocess toggle]`

---

## Test 2.4 — Wrong file type

**Scenario:** User receives feedback for unsupported or corrupt file.

STEP 1:  
Attempt to upload a non-document file (e.g. `.exe` renamed) or corrupt PDF.

EXPECTED RESULT:  
Validation or error message; no blank success state.

`[SCREENSHOT: import error message]`

---





## 3. Accounting tests

## Test 3.1 — Open document in Prima nota

**Scenario:** An imported document appears in the accounting queue.

STEP 1:  
Complete Test 2.1 (or use an existing document in **proposed** / pending state).

STEP 2:  
Open **Prima nota** / **Contabilità**.

STEP 3:  
Locate the document by number, date, or supplier filter.

STEP 4:  
Open the document detail / split view.

EXPECTED RESULT:  
Document opens with lines or proposal area visible; PDF/XML preview available if implemented.

`[SCREENSHOT: Prima nota — document open]`

---

## Test 3.2 — Edit and balance double entry

**Scenario:** Operator can adjust lines so Dare = Avere.

STEP 1:  
Open a document with accounting lines (AI or manual).

STEP 2:  
Change an amount on one line.

STEP 3:  
Adjust a second line so totals balance.

STEP 4:  
Attempt save/validate per UI.

EXPECTED RESULT:  
Save blocked or warned if unbalanced; succeeds when balanced.

`[SCREENSHOT: balanced rows]`

---

## Test 3.3 — Assign cost account and causale IVA

**Scenario:** Chart of accounts and VAT cause can be set for register flow.

STEP 1:  
Open document in **Prima nota**.

STEP 2:  
Assign a **cost/revenue account** from **Piano dei conti** picker.

STEP 3:  
Set **causale IVA** (or equivalent) if the form exposes it.

STEP 4:  
Save.

EXPECTED RESULT:  
Values persist on reload; no server error toast.

`[SCREENSHOT: causale IVA field]`

---

## Test 3.4 — Validate / approve document

**Scenario:** Document moves to validated / approved state.

STEP 1:  
Use a fully filled document (Test 3.2–3.3).

STEP 2:  
Trigger **Valida** / **Approva** (exact label per UI).

STEP 3:  
Reload list and confirm status badge.

EXPECTED RESULT:  
Status updates; document may disappear from “da validare” filter depending on rules.

`[SCREENSHOT: status badge validated]`

---





## 4. IVA tests

## Test 4.1 — Liquidazione IVA — manual creation

**Scenario:** Operator creates a periodic VAT record without file import.

STEP 1:  
Open **Liquidazione IVA**.

STEP 2:  
Click **+ Nuova manuale**.

STEP 3:  
Select a **cliente** and **periodo** (month/quarter as UI provides).

STEP 4:  
Enter **IVA vendite**, **IVA acquisti**, and **credito precedente** (test figures).

STEP 5:  
Save.

STEP 6:  
Find the row in **Liquidazioni in archivio**.

EXPECTED RESULT:  
New row appears with correct figures and stato (e.g. bozza/confermata); edit and delete icons work.

`[SCREENSHOT: Liquidazione IVA — archive table]`

---

## Test 4.2 — Liquidazione IVA — import PDF/Excel

**Scenario:** Prospetto file pre-fills the liquidation form.

STEP 1:  
In **Liquidazione IVA**, use **Importa da documento** with a sample **PDF or Excel** prospetto (anonymized test file).

STEP 2:  
Wait for extraction (may show “Claude sta leggendo…” if online).

STEP 3:  
Review extracted **Cliente**, **P.IVA**, **Periodo**, amounts.

STEP 4:  
Click **Crea liquidazione con questi dati**.

STEP 5:  
Adjust any wrong field, then save.

EXPECTED RESULT:  
Form opens pre-filled; saved row matches corrected figures; warning if P.IVA not in **Clienti** is acceptable.

`[SCREENSHOT: Liquidazione IVA — import preview]`

---

## Test 4.3 — Register linkage from Prima nota (integration)

**Scenario:** After validated entry with causale, VAT register rows exist or pipeline created registri (environment-dependent).

STEP 1:  
Complete Test 3.4 with a document that has IVA lines and causale.

STEP 2:  
Run **full pipeline** from Test Mode or wait for background sync if your process uses it.

STEP 3:  
Query or UI-check **registri_iva** / reports your studio uses (Supabase or in-app report).

EXPECTED RESULT:  
Either register lines appear for the entry, or a documented skip reason appears in pipeline output (e.g. `nessuna_riga_iva`); tester records which outcome matches current product version.

`[SCREENSHOT: pipeline step iva output or register list]`

---





## 5. E2E tests (Test Mode)

## Test 5.1 — Open Test Mode

**Scenario:** Tester can access the E2E panel.

STEP 1:  
Log in as a user allowed to see **Test Mode** (per product configuration).

STEP 2:  
Open the **Test Mode** module from navigation.

STEP 3:  
Click **Ricarica elenco** (or equivalent) to load `test_scenarios`.

EXPECTED RESULT:  
List of scenarios appears or empty state with hint to apply migrations.

`[SCREENSHOT: Test Mode scenario list]`

---

## Test 5.2 — Run scenario A — single passive invoice

**Scenario:** Full flow upload → pipeline → open entry → validate for default scenario **a**.

STEP 1:  
Ensure `npm run dev:api` is running.

STEP 2:  
In Test Mode, choose scenario **E2E · Singola fattura passiva** (UUID `a0000000-0000-4000-8000-000000000001` if default).

STEP 3:  
Click **Run**; when prompted, select a valid **XML** passive invoice.

STEP 4:  
Wait until the modal shows final **PASS** or **FAIL**.

STEP 5:  
Expand **Dettaglio breakdown** and note `document_ids`, `pipeline_run_id`, `captured.summary`.

EXPECTED RESULT:  
**PASS** with no step `error` (or **FAIL** with explicit `failures[]` — file bug if inconsistent with environment); log shows `[1/4] … [4/4]` style lines when API returns `steps` array; if warning about empty DB `steps`, fallback still executed steps.

`[SCREENSHOT: Test Mode — PASS result]`

---

## Test 5.3 — Run scenario B — batch (multi-file)

**Scenario:** Batch upload processes multiple XMLs.

STEP 1:  
Select scenario **E2E · Fatture multiple (batch)**.

STEP 2:  
Choose **at least 3** XML files when prompted.

STEP 3:  
Run and wait for completion.

EXPECTED RESULT:  
**PASS** if `expected_results` and batch min satisfied; sub-steps show per-file pipeline outcome; `document_ids` length ≥ minimum.

`[SCREENSHOT: Test Mode — batch sub-steps]`

---

## Test 5.4 — Pipeline trace visibility

**Scenario:** After a run, pipeline phases are visible when `pipeline_runs` exists.

STEP 1:  
Complete Test 5.2 successfully.

STEP 2:  
Copy **pipeline_run_id** from the report.

STEP 3:  
In Supabase (or UI **Log pipeline**), open `pipeline_steps` for that id.

EXPECTED RESULT:  
Steps `parsing`, `ai_accounting`, `partitari`, `iva`, `liquidazione`, `insights` present with statuses; if migration missing, trace empty — document as environment gap.

`[SCREENSHOT: pipeline log UI or Supabase rows]`

---





## 6. AI tests

## Test 6.1 — Local AI unavailable

**Scenario:** Clear error when Ollama is down in **local** mode.

STEP 1:  
Set AI mode to **local**.

STEP 2:  
Stop Ollama (or block port 11434).

STEP 3:  
Run an import that requires local LLM (PDF with text).

EXPECTED RESULT:  
User-visible error or toast; logs mention Ollama HTTP/network; no fake success.

`[SCREENSHOT: Ollama error]`

---

## Test 6.2 — Online AI without API key (server)

**Scenario:** Server path fails fast if `ANTHROPIC_API_KEY` missing.

STEP 1:  
Unset `ANTHROPIC_API_KEY` in the **dev-api** environment.

STEP 2:  
Trigger **online** parsing or accounting via API/import.

EXPECTED RESULT:  
Error indicating key missing; 4xx/5xx with message, not silent fallback to empty JSON.

`[SCREENSHOT: server log ANTHROPIC]`

---

## Test 6.3 — Accounting proposal confidence

**Scenario:** `accounting_entries` carries confidence after AI accounting.

STEP 1:  
Run Test 5.2 or trigger pipeline on a document with **ai_accounting** success.

STEP 2:  
Open latest `accounting_entries` for that `document_id` in Supabase or debug UI.

STEP 3:  
Read `data.confidence` and `ai_confidence` if populated.

EXPECTED RESULT:  
Numeric confidence between 0 and 1 (or null only if path skipped AI entirely, e.g. memory skip — then check `data.source`).

`[SCREENSHOT: accounting entry JSON snippet]`

---

## Test 6.4 — Memory skip (operator correction replay)

**Scenario:** Same layout hash reuses operator-corrected rows without new LLM call.

STEP 1:  
Import document A; run pipeline; **correct** accounting in UI; save corrections via **save operator corrections** flow if exposed (or API `POST /api/save-operator-corrections`).

STEP 2:  
Import document B with **identical layout** (same supplier template / same PDF layout in test harness).

STEP 3:  
Run pipeline on B.

STEP 4:  
Inspect `accounting_entries.data` for `skipped_ai: true` / `source: memory_operator_match` when applicable.

EXPECTED RESULT:  
Second run may skip LLM; if layout differs, full AI runs — tester records actual behavior.

`[SCREENSHOT: memory skip payload]`

---





## 7. Insight tests

## Test 7.1 — Insights after pipeline

**Scenario:** Proactive insight engines insert rows linked to document/società.

STEP 1:  
Run **full pipeline** on a passive invoice with non-trivial amounts (Test 5.2).

STEP 2:  
Query **`ai_insights`** filtered by `societa_id` and recent `created_at`.

STEP 3:  
Check `entity_ref.document_id` matches the test document when applicable.

EXPECTED RESULT:  
Zero or more rows; if product version generates **iva_anomaly** / **fiscal_suggestion**, at least one row may appear; absence is acceptable if engines return `generated: 0` — compare with `pipeline_trace` **insights** step output.

`[SCREENSHOT: ai_insights table or UI badge]`

---

## Test 7.2 — Insight types sanity

**Scenario:** Insight `tipo` values are from known set.

STEP 1:  
Collect `tipo` from insights created in Test 7.1.

STEP 2:  
Compare to code expectations (e.g. `iva_anomaly`, `fiscal_suggestion`, `cost_analysis`, `cost_trend`).

EXPECTED RESULT:  
No unknown null tipo; JSON payload readable.

`[SCREENSHOT: insight detail JSON]`

---





## 8. Copilot tests

**Prerequisite:** `ANTHROPIC_API_KEY` set on server; Copilot entry point available from **Prima nota** or dedicated UI per version.

## Test 8.1 — Open Copilot with document context

**Scenario:** Copilot loads without error when a document is open.

STEP 1:  
Open **Prima nota** and select a document with an accounting entry.

STEP 2:  
Open **Copilot** panel (button or sidebar — exact UX per build).

STEP 3:  
Send a minimal message: “Riassumi lo stato della scrittura.”

EXPECTED RESULT:  
Response JSON or rendered answer appears; no blank panel; if key missing, clear error.

`[SCREENSHOT: Copilot panel open]`

---

## Test 8.2 — Tool: list entries

**Scenario:** Model uses `get_entries` and returns factually consistent row count.

STEP 1:  
Ask: “Quante scritture ci sono per questo documento?”

STEP 2:  
Compare assistant answer to **Prima nota** screen count.

EXPECTED RESULT:  
Numbers match or assistant states uncertainty if tool failed.

`[SCREENSHOT: Copilot answer vs list]`

---

## Test 8.3 — Tool: explain_entry / auto_validate

**Scenario:** Explanation references `auto_validate_meta` when present.

STEP 1:  
Use a document whose entry has **auto_validate_meta** populated (after auto-validate run).

STEP 2:  
Ask: “Perché il conto proposto ha questo punteggio?”

EXPECTED RESULT:  
Reasoning cites scores or meta fields; no invented IDs.

`[SCREENSHOT: Copilot reasoning block]`

---

## Test 8.4 — Out-of-domain question

**Scenario:** Copilot refuses generic chit-chat.

STEP 1:  
Ask: “Qual è la capitale della Francia?”

EXPECTED RESULT:  
Polite refusal and redirect to accounting scope (per system prompt).

`[SCREENSHOT: Copilot refusal]`

---

## Test 8.5 — Action suggestions

**Scenario:** Response includes `actions` array with labels.

STEP 1:  
Ask for a suggestion that implies a UI action (e.g. “Apri la prima nota guidata se serve”).

STEP 2:  
Parse JSON `actions` if shown in debug or network response.

EXPECTED RESULT:  
`actions` is array (possibly empty); entries have `label` and `type` when non-empty.

`[SCREENSHOT: Copilot suggested actions buttons]`

---





## 9. Regression quick matrix

| Area | Tests to run in 30 min |
|------|-------------------------|
| Basic | 1.1, 1.2 |
| Import | 2.1 |
| Accounting | 3.1, 3.4 |
| IVA | 4.1 |
| E2E | 5.2 |
| AI | 6.1 (smoke) |
| Insights | 7.1 (observe) |
| Copilot | 8.1, 8.4 |

---

## Document history

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | — | Full step-by-step testing guide |

For architecture details, see the Technical Manual (PDF export). For operator prose, see the Operational Manual (PDF export).
