# FiscoSim — Operational Manual (structure only)

**Audience:** operators, accountants, firm admins using the web app daily.  
**Scope:** what the product does from a user perspective, how to complete tasks, and where to get help. **No implementation details** (those belong in the Technical Manual).

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Getting started](#2-getting-started)
3. [Organizations, users, and permissions](#3-organizations-users-and-permissions)
4. [Core navigation and dashboard](#4-core-navigation-and-dashboard)
5. [Document intake and import](#5-document-intake-and-import)
6. [Accounting workflow](#6-accounting-workflow)
7. [Chart of accounts and master data](#7-chart-of-accounts-and-master-data)
8. [VAT, registers, and liquidation](#8-vat-registers-and-liquidation)
9. [Reporting and exports](#9-reporting-and-exports)
10. [Compliance and periodic obligations](#10-compliance-and-periodic-obligations)
11. [Communication and integrations](#11-communication-and-integrations)
12. [AI-assisted features (operator view)](#12-ai-assisted-features-operator-view)
13. [Settings and firm configuration](#13-settings-and-firm-configuration)
14. [Troubleshooting and support](#14-troubleshooting-and-support)
15. [Glossary](#15-glossary)

---

## 1. Introduction

**Description:** Purpose of FiscoSim, who it is for, and how this manual is organized.

### 1.1 What is FiscoSim?

**Description:** One-paragraph positioning: fiscal/accounting workspace for firms (Italian context).

### 1.2 Key concepts

**Description:** Società (company context), documenti, scritture, registri IVA, ruoli — in plain language.

### 1.3 How to read this manual

**Description:** Conventions (warnings, tips), assumed familiarity (e.g. partita doppia basics).

---

## 2. Getting started

**Description:** First login, browser requirements, and minimal path to “first document processed.”

### 2.1 Access and login

**Description:** Credentials, session, password recovery (as implemented in product).

### 2.2 Browser and connectivity

**Description:** Supported browsers, HTTPS, when offline mode does or does not apply.

### 2.3 Choosing the active company (società)

**Description:** Switching company context; impact on lists and permissions.

### 2.4 First-time checklist

**Description:** Ordered list: users, piano conti, deleghe/import settings as applicable.

---

## 3. Organizations, users, and permissions

**Description:** How access is controlled without technical jargon.

### 3.1 Roles (owner, admin, collaborator)

**Description:** What each role can see and do at a high level.

### 3.2 Inviting and managing users

**Description:** Admin flows in **Utenti** module.

### 3.3 Module-level permissions

**Description:** How navigation hides or shows areas; reference to in-app help where present.

---

## 4. Core navigation and dashboard

**Description:** Map of the main menu and the **Dashboard** as the operational home.

### 4.1 Main menu overview

**Description:** Sections and modules as shown in app navigation (aligned with product labels).

### 4.2 Dashboard widgets and alerts

**Description:** What each area means; scheduled sends / reminders if surfaced.

### 4.3 Search and filters (cross-cutting)

**Description:** Patterns reused across modules (date ranges, status filters).

---

## 5. Document intake and import

**Description:** All paths that bring documents into the system.

### 5.1 Unified import (Import unificato)

**Description:** Supported types, upload flow, AI vs manual steps from user POV.

### 5.2 New import entry points (Import nuovo)

**Description:** When to use; relationship to unified import.

### 5.3 Excel and bulk import

**Description:** **Import Excel** — templates, validation messages, error handling.

### 5.4 Mail / acquisition channels

**Description:** **Lettura mail** — configuration expectations and operator workflow.

### 5.5 Fatture / richieste / external sources

**Description:** **Richieste fatture**, **Fatture ADE** (if exposed in UI) — operator steps.

### 5.6 Document lifecycle states

**Description:** Draft, proposed, validated, error — what the user sees and what to do next.

---

## 6. Accounting workflow

**Description:** Day-to-day accounting from document to validated entry.

### 6.1 Contabilità — document list and validation

**Description:** Queues, filters, opening a document, validation actions.

### 6.2 Prima nota and guided flows

**Description:** **Prima nota guidata** (if applicable) — step-by-step operator narrative.

### 6.3 Partitario

**Description:** Viewing open items, matching payments, common tasks.

### 6.4 Bilancio and trial balance views

**Description:** **Bilancio** — reading reports, periods, export.

### 6.5 Ammortamenti

**Description:** Managing depreciation schedules from user perspective.

### 6.6 Simulatore

**Description:** What is being simulated, inputs, interpreting results.

---

## 7. Chart of accounts and master data

**Description:** Structural data the firm maintains.

### 7.1 Piano dei conti

**Description:** Creating/editing accounts, codes, hierarchies.

### 7.2 Clienti e fornitori

**Description:** **Clienti** — anagrafica, linking to documents.

### 7.3 Deleghe

**Description:** Purpose, required fields, status.

### 7.4 Adempimenti and calendar context

**Description:** **Adempimenti** / **Agenda** — deadlines and tasks (operator view).

---

## 8. VAT, registers, and liquidation

**Description:** VAT-specific operations without engine internals.

### 8.1 IVA module overview

**Description:** **IVA** — registers, periods, key screens.

### 8.2 Registers and causali (user-facing)

**Description:** How operators assign or correct VAT lines where the UI allows it.

### 8.3 Liquidation periods

**Description:** Monthly/quarterly concepts as shown in app; reconciliation checklist.

---

## 9. Reporting and exports

**Description:** Getting data out for Excel, auditor, or other tools.

### 9.1 Export dati

**Description:** **Export dati** — formats, scope, scheduling if any.

### 9.2 Standard printouts

**Description:** Any PDF/print flows and naming conventions.

### 9.3 Revisione dichiarazioni

**Description:** **Revisione dich** — what users review and sign off.

---

## 10. Compliance and periodic obligations

**Description:** F24, CU, AgeCon, and similar modules as **operator procedures**.

### 10.1 F24

**Description:** Workflow, deadlines, common errors.

### 10.2 Certificazioni (CU)

**Description:** **CU** module — issuance and corrections (high level).

### 10.3 AgeCon and communications

**Description:** **AgeCon** — when and how operators use it.

---

## 11. Communication and integrations

**Description:** Outbound communication and third-party touchpoints.

### 11.1 Invii schedulati and notifications

**Description:** How scheduling appears on Dashboard / related screens.

### 11.2 AI Agent (operator-facing)

**Description:** **AI Agent** — tasks the operator delegates to the agent vs manual work.

---

## 12. AI-assisted features (operator view)

**Description:** Cross-cutting explanation of AI modes, confidence, and human override.

### 12.1 When AI proposes values

**Description:** Import, contabilità, parsing — user-visible behavior.

### 12.2 Local vs online AI (if configurable in UI)

**Description:** What changes for the operator; privacy note at product level.

### 12.3 Correcting AI output and learning (conceptual)

**Description:** How corrections feed back in terms the user understands (no code).

---

## 13. Settings and firm configuration

**Description:** **Impostazioni** and **Impostazioni procedure** from an admin/owner angle.

### 13.1 Company profile and fiscal parameters

**Description:** Fields that affect calculations or defaults.

### 13.2 Procedures and checklists

**Description:** **Impostazioni procedure** — configuring firm-specific procedures.

### 13.3 Fiscal knowledge / rules (if exposed)

**Description:** Who may edit firm-level rules; pointer to admin-only UI.

---

## 14. Troubleshooting and support

**Description:** First-line help without stack traces.

### 14.1 Common error messages

**Description:** Table: message → likely cause → user action.

### 14.2 When data does not appear

**Description:** Company filter, permissions, sync delay.

### 14.3 Escalation and contacts

**Description:** How to reach support; what information to attach (screenshots, società, document id).

---

## 15. Glossary

**Description:** Italian fiscal/accounting terms as used in the UI (short definitions).

### 15.1 Terms A–Z

**Description:** Alphabetical glossary entries (to be filled).

---

## Appendix A — Module quick reference

**Description:** One row per main `App.jsx` module: name, purpose, primary user role.

---

## Appendix B — Keyboard shortcuts and power features

**Description:** e.g. fiscal knowledge panel shortcut label from product constants, if documented for users.
