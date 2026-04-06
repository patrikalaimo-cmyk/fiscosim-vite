# FiscoSim — Operational Manual for Accounting Operators

**Audience:** accounting staff using FiscoSim day to day (data entry, validation, VAT, F24).  
**Language:** plain English; **Italian** is used for **exact screen names** and buttons as they appear in the app.

---

## Table of contents

1. [How to use this manual](#1-how-to-use-this-manual)
2. [AI assistance vs manual work](#2-ai-assistance-vs-manual-work)
3. [Importing documents](#3-importing-documents)
4. [Accounting entries (Prima nota)](#4-accounting-entries-prima-nota)
5. [IVA (VAT) in daily work](#5-iva-vat-in-daily-work)
6. [Liquidazione IVA (periodic VAT settlement)](#6-liquidazione-iva-periodic-vat-settlement)
7. [F24 management](#7-f24-management)
8. [Quick checklist before month-end](#8-quick-checklist-before-month-end)

---

## 1. How to use this manual

Each section gives:

- **When to use** the area of the product  
- **Step-by-step** actions  
- **AI vs manual** guidance  
- **Examples** you can copy in spirit (figures are illustrative)

Throughout the document, **screenshot placeholders** look like this:

`[SCREENSHOT: short description]`

Replace them with real images when you publish the manual internally.

---

## 2. AI assistance vs manual work

FiscoSim can **suggest** classifications, text extraction, and accounting lines. **You** remain responsible for checking tax and accounting correctness.

### 2.1 What “AI mode” usually means in the app

You may see choices similar to:

| Mode (concept) | In simple terms | When operators choose it |
|----------------|-----------------|---------------------------|
| **Local** | The suggestion runs on your studio’s own AI setup (e.g. on your network). | Default for many studios; no document leaves your environment for that step. |
| **Online** | A cloud AI reads the document (e.g. for PDFs or scans). | When **local** fails, or the file is a **scan** / image-heavy PDF and you need stronger reading. |

There is also a **preprocess** option for some imports: the system can **clean and shorten** the text sent to the AI (often better for invoices) or send **raw** text. If unsure, start with **preprocess on** for long invoices.

`[SCREENSHOT: AI mode selector / Impostazioni motore AI]`

### 2.2 Golden rules for operators

1. **Never approve** a proposal you have not understood.  
2. **XML electronic invoices** are often read with **deterministic rules** (not “creative” AI): still **check** totals, VAT rates, and supplier name.  
3. **PDFs and scans** depend more on AI: **compare** to the original file side by side.  
4. If the app shows **low confidence** or **manual** source, treat the entry as **mostly your work**.

### 2.3 Example — choosing online vs local

- **Example A:** PDF invoice with **selectable text** → try **local** first; if accounts look wrong, switch to **online** and run again.  
- **Example B:** **Scanned** PDF (no selectable text) → **local** may refuse or give poor text → use **online** (if your studio allows it).  
- **Example C:** **XML** from SDI → prefer **manual review** of the structured fields; AI is less central for the initial load.

---

## 3. Importing documents

**Goal:** Get bills, notices, and other files into FiscoSim so they can be classified, linked to a client, and sent to **Prima nota** or other flows.

**Main module:** **Import Documenti** (unified import hub) in the navigation.

`[SCREENSHOT: Import Documenti — main screen]`

### 3.1 When to use this module

- New **PDF** or **image** invoices, contracts, F24, ADE notices, etc.  
- You want the system to **propose document type** and **match the client** (by VAT ID / tax code) before you post.

### 3.2 Step-by-step — import a file

1. Open **Import Documenti** from the menu.  
2. Select the **company (società)** you are working for, if your login has more than one.  
3. Click **upload** or drag the file into the drop zone.  
4. Wait for **analysis** (progress or messages may appear).  
5. Review the **proposed document type** (e.g. passive invoice, F24, other).  
6. Check **client match**: if the VAT ID matches **Clienti**, the client is linked; if not, **pick the client manually** or create/amend **Clienti** first.  
7. Adjust **fields** (amounts, dates, description) if something is wrong.  
8. **Save** or **confirm** so the document enters the workflow (e.g. available in **Prima nota**).

`[SCREENSHOT: Import Documenti — after analysis, proposal panel]`

### 3.3 AI vs manual in import

| Situation | Suggested approach |
|-----------|---------------------|
| **XML / p7m** invoice | System often parses **without** generative AI; you still **verify** lines and VAT. |
| **PDF with text** | AI (local or online) proposes type and fields; **you confirm**. |
| **Scan / photo** | Prefer **online** AI if local is weak; always **eyeball** totals. |
| **Unusual document** | Switch to **manual** field entry; use AI only as a first draft. |

### 3.4 Example — passive invoice PDF

1. Upload `fattura_fornitore_2026_03.pdf`.  
2. System suggests: **Fattura passiva**, supplier **Rossi Srl**, total **€ 1.220,00** including VAT.  
3. You open the **side preview**, notice the **due date** is wrong, correct it.  
4. You confirm; the document appears under **Prima nota** for that company.

### 3.5 Example — XML invoice

1. Upload `IT01234567890_abc.xml`.  
2. System fills **number**, **date**, **lines**, **VAT** from XML.  
3. You assign **cost account** or let **Prima nota** handle it next.  
4. No need to change AI mode for the **initial parse**; focus on **accounting** in **Prima nota**.

### 3.6 Other import paths (short pointer)

- **Import Excel:** bulk tables (e.g. clients), not typical single-invoice flow.  
- **Lettura Mail:** automatic pickup from mailbox; operators still **review** classified items.  

`[SCREENSHOT: menu showing Import Documenti vs Import Excel]`

---

## 4. Accounting entries (Prima nota)

**Goal:** Turn imported or manual documents into **double-entry** records, validated for the ledger.

**Main module:** **Prima nota** / **Contabilità** (wording may match **“Prima Nota”** in the guide).

`[SCREENSHOT: Prima nota — document list]`

### 4.1 When to use this module

- After **import**, to **propose or edit** journal lines.  
- To **validate** entries before they are “official” for the period.  
- To link **accounts** from the **Piano dei conti** and **VAT causes** where required.

### 4.2 Step-by-step — work a document

1. Open **Prima nota** and select the **company**.  
2. Use filters (**date**, **status**, **supplier**) to find the document.  
3. Open the document; review **PDF/XML preview** (if shown) next to the form.  
4. Check **debit/credit** lines: totals must **balance**.  
5. Assign or correct **accounts** (cost, VAT, payable, etc.).  
6. Set **VAT cause** if your workflow requires it for registers.  
7. **Save** draft or **validate** when you are satisfied.  
8. If the system shows **AI proposed** status, your validation may move it to a **confirmed** state (labels depend on setup).

`[SCREENSHOT: Prima nota — split view document + rows]`

### 4.3 AI vs manual in Prima nota

| Situation | Suggested approach |
|-----------|---------------------|
| **AI_PROPOSED** / similar badge | Read each line; **accept** only if economically correct. |
| **Missing account** | **Manual** pick from **Piano dei conti**; do not guess. |
| **Recurring supplier** | After you correct once, future imports may **suggest** the same account — still **spot-check**. |
| **Strict audit period** | Prefer **manual** entry for sensitive entries even if AI exists. |

### 4.4 Example — correcting AI accounts

- Document: office supplies **€ 100 + VAT**.  
- AI proposed **generic “costs”**; you change to **“Office expenses”** per studio policy.  
- You validate; **Partitario** and **IVA** downstream use this account.

### 4.5 Example — full manual line

- Small cash expense **without** PDF: create manual movement in **Prima nota** (or path your studio uses), enter **two lines** balancing to zero, choose **VAT** if applicable.

`[SCREENSHOT: Piano dei conti — account picker]`

---

## 5. IVA (VAT) in daily work

**Goal:** Understand how **VAT data** is produced day by day before you go to **Liquidazione IVA**.

There is **no separate “IVA registers only” chapter** in the menu for every studio; often:

- **Prima nota** and **import** feed **accounting lines** and **VAT causes**.  
- The system may build or suggest **VAT register** movements when entries are saved/validated (depending on configuration).

`[SCREENSHOT: Prima nota — VAT / causale fields]`

### 5.1 Operator responsibilities

1. **Correct causale IVA** (or equivalent) on lines that must appear in **purchases/sales** registers.  
2. **Consistent dates** (registration vs document date) per firm policy.  
3. After posting, spot-check **reports** or **Liquidazione** preview if available.

### 5.2 AI vs manual for IVA

- **AI** may propose **VAT rates** from invoice text; **you** must match **Italian law** and **invoice XML** when present.  
- For **XML invoices**, prefer **XML values** over AI guesses when they differ.  
- **Manual** override is always allowed before validation.

### 5.3 Example — purchase with 22% VAT

- Import passive invoice; XML shows **22%**.  
- In **Prima nota**, you ensure the line carries **22%** and the right **causale**.  
- You validate; register totals for the month will include this purchase.

---

## 6. Liquidazione IVA (periodic VAT settlement)

**Goal:** For each **client** and **period** (month or quarter), record **output VAT**, **input VAT**, **credit brought forward**, and **amount due or credit**.

**Main module:** **Liquidazione IVA** (page title **“Liquidazione IVA”**, subtitle about periodic settlements).

`[SCREENSHOT: Liquidazione IVA — full page]`

### 6.1 Two ways to create a settlement

**A) Import from a file (AI-assisted reading)**  
**B) Manual new record**

### 6.2 Step-by-step — import a liquidation document

1. Open **Liquidazione IVA**.  
2. In **“Importa da documento”**, drag or click to select **PDF, Excel, or CSV** (e.g. advisor’s summary).  
3. Wait while the system **extracts** fields (you may see a “reading document” message).  
4. Review the **preview**: client name, VAT ID, **period**, **IVA vendite**, **IVA acquisti**, **previous credit**, etc.  
5. If **P.IVA matches Clienti**, you’ll see a confirmation; otherwise **choose the client** in the next form.  
6. Click **“Crea liquidazione con questi dati”** to open the form pre-filled.  
7. Adjust any field, then **save**.  
8. Set **stato** (e.g. draft / confirmed / sent) according to your internal process.

`[SCREENSHOT: Liquidazione IVA — extracted data preview]`

### 6.3 Step-by-step — manual liquidation

1. Click **“+ Nuova manuale”**.  
2. Select **cliente** and **periodo**.  
3. Enter **IVA vendite**, **IVA acquisti**, **credito precedente**, and other required fields.  
4. **Save**.  
5. Use **edit** (pencil) later if corrections are needed.

`[SCREENSHOT: Liquidazione IVA — new manual modal]`

### 6.4 AI vs manual in Liquidazione IVA

| Situation | Suggested approach |
|-----------|---------------------|
| Advisor sends **PDF/Excel** summary | Use **import**; then **verify** numbers against **source file**. |
| Figures disagree with **Prima nota** | **Manual** reconciliation: fix **Prima nota** or **liquidation** line, do not blindly trust import. |
| **First time** for a client | **Manual** entry once to learn the format; then try import next period. |

### 6.5 Example — monthly liquidation via import

- File: `Liquidazione_marzo_2026.pdf` for **Cliente Bianchi Srl**.  
- Import fills **IVA vendite € 18.400**, **IVA acquisti € 9.200**, **credito precedente € 500**.  
- You compare to your **internal schedule**; all match.  
- You save as **confermata** and archive the PDF externally if required.

### 6.6 Example — credit vs debt

- After save, the list shows **“Dovuta”** (red) if VAT is payable, or **“Credito”** (green) if a credit remains.  
- Communicate the amount to the client per studio procedure.

`[SCREENSHOT: Liquidazione IVA — archive table with saldo and stato]`

---

## 7. F24 management

**Goal:** Track **F24 payment deadlines**, amounts, and **status** (open/closed) per client or studio process.

**Main module:** **Gestione F24**.

`[SCREENSHOT: Gestione F24 — main board]`

### 7.1 When to use this module

- Monitor **upcoming F24** due dates.  
- Record **payments** or **closures** for each deadline “bucket”.  
- Export or review lists for **internal control** (exact buttons depend on your version).

### 7.2 Step-by-step — first load

1. Open **Gestione F24**.  
2. If you see a **database / table missing** message, inform **IT** (Supabase schema may need updating).  
3. When loaded, you see **scadenze** (deadlines) and related rows.

`[SCREENSHOT: Gestione F24 — scadenze list]`

### 7.3 Step-by-step — new deadline (“scadenza”)

1. Use the control to add a **new scadenza** (e.g. label + **data scadenza**).  
2. **Save**.  
3. Select it in the list to enter **F24 rows** or amounts as your screen provides.  
4. Mark as **chiusa** when fully paid/processed, or reopen if needed.

### 7.4 AI vs manual for F24

- **F24** in FiscoSim is mainly **operator-driven**: you enter **amounts and codes** from the official F24 or advisor file.  
- **AI** is **not** the primary tool here; always use **official amounts** from **Agenzia delle Entrate** or **bank confirmation**.  
- If **Import Documenti** classifies an **F24 PDF**, that helps **filing** the document — **payment data** still goes through **Gestione F24** (or your studio bridge).

### 7.5 Example — quarterly payment cycle

1. Create scadenza **“16/05/2026 — Acconto IVA Q1”**.  
2. Enter amounts per **client** (or per studio rule).  
3. After bank payment, attach note in your DMS and set stato **chiusa** in FiscoSim.

### 7.6 Example — correction

- Wrong amount entered: **reopen** the scadenza or row, **edit**, **save**, leave an **audit note** outside the app if required.

`[SCREENSHOT: Gestione F24 — detail / payment rows]`

---

## 8. Quick checklist before month-end

Use as an internal **control list** (adapt to your firm).

| Step | Module | Done |
|------|--------|------|
| All invoices in **Import Documenti** reviewed | Import Documenti | ☐ |
| **Prima nota** validated for the period | Prima nota | ☐ |
| **VAT causes** and rates sanity check | Prima nota | ☐ |
| **Liquidazione IVA** created or imported for each VAT client | Liquidazione IVA | ☐ |
| **F24** scadenze updated; paid items closed | Gestione F24 | ☐ |
| **AI-assisted** rows **double-checked** | All | ☐ |

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | *(fill)* | First operator manual (Markdown); screenshots TBD |

---

*This manual describes typical FiscoSim flows. Labels and exact buttons may vary slightly by version. For technical setup (servers, API, database), see the **Technical Manual** in `docs/`.*
