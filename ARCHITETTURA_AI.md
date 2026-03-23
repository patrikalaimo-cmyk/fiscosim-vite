# FiscoSim — Architettura AI vs Deterministico
## Aggiornato: 22/03/2026

---

## PATTERN ARCHITETTURALE

Ogni operazione in FiscoSim segue il pattern duale:
- **AI ON** → Claude Haiku analizza, propone, l'operatore conferma
- **AI OFF** → Parsing deterministico / form manuale, l'operatore inserisce

Il toggle globale è in `impostazioni_studio.ai_enabled` (Supabase).
Il badge AI in basso a destra mostra lo stato in tempo reale.

---

## OPERAZIONI 100% DETERMINISTICHE (zero AI sempre)

| Operazione | Implementazione | Stato |
|---|---|---|
| Import Piano dei Conti | Browser pdfjs + `parsePianoContiFromText` | ✅ |
| Import Causali IVA | Browser pdfjs + `parseCausaliIvaFromText` | ✅ |
| Import Causali Contabili | Browser pdfjs + `parseCausaliContabiliFromText` | ✅ |
| Calcolo Liquidazione IVA | Matematica pura | ✅ già deterministico |
| Calcolo LIPE | Matematica pura | ✅ già deterministico |
| Generazione F24 | Template su dati strutturati | ✅ già deterministico |
| Generazione CU (file TEL) | Template su dati strutturati | ✅ già deterministico |
| Stampe registri/mastrini | Dati già in DB | ✅ già deterministico |

---

## OPERAZIONI CON TOGGLE AI ON/OFF

| Operazione | AI ON | AI OFF | Stato |
|---|---|---|---|
| **Document Hub** (classify) | `analyze-document` API | Salva come `manual_pending` | ✅ |
| **Import Fatture XML** | `proposta-contabile` API | `parseXMLFattura()` deterministico | ✅ |
| **Import Fatture PDF** | `proposta-contabile` API | Salva come `manual_pending` | ✅ |
| **Suggerimento cespiti** | Claude suggerisce categoria | `CATEGORIE_CESPITI` lookup table | ✅ |
| **Allegati email** | `analyze-document` classifica | Skip AI, salva `manual_pending` | ✅ |
| **Estrazione dati IVA (PDF)** | Claude estrae importi | Form manuale vuoto | ✅ |
| **Estrazione dati IVA (Excel)** | Claude estrae importi | Form manuale vuoto | ✅ |
| **Ricevute affitto breve** | Claude estrae CF/importi | Form manuale vuoto | ✅ |

---

## BADGE AI (Fase 2)

Componente `AIBadge` fisso in basso a destra:
- ⚪ `AI standby` — nessuna operazione AI recente (opacity 0.6)
- 🟡 `AI in elaborazione...` — chiamata API in corso (pulse animation)
- 🟢 `AI usata · [operazione]` — AI ha completato
- ⚡ `Parsing locale · [operazione]` — operazione deterministica completata
- Auto-fade dopo 8 secondi da done → idle

Context: `AIStatusContext` con `useAIStatus()` hook.
Stato: `{status, lastOp, method}` — `setAI(status, operazione, metodo)`

---

## COSTI STIMATI

| Scenario | AI sempre ON | AI solo dove serve | AI OFF |
|---|---|---|---|
| Import strutturati | $2/mese | $0 | $0 |
| Classificazione doc | $2-4/mese | $2-4/mese | $0 |
| Proposte contabili | $2-4/mese | $2-4/mese | $0 |
| **Totale** | **$6-10/mese** | **$4-8/mese** | **$0** |

---

## FILE MODIFICATI

### Frontend (App.jsx)
- `AIStatusContext`, `AIStatusProvider`, `useAIStatus`, `AIBadge` — context globale
- `extractTextFromPDFBrowser` — estrazione testo PDF lato browser
- `parsePianoContiFromText` — parser piano dei conti
- `parseCausaliIvaFromText` — parser causali IVA
- `parseCausaliContabiliFromText` — parser causali contabili
- `CATEGORIE_CESPITI` + `suggerisciCespiteDeterministico` — lookup table cespiti
- `ModalImportPDF` — 100% browser per tutti gli import strutturati
- `ImportFattureView` — dual mode fatture XML/PDF
- `ModuloImportDocumenti` — badge tracking nel Document Hub
- `elaboraEmail` — skip AI quando disabilitata
- `estraiDatiIVADaPDF/DaExcel` — `useAI` flag, null quando off
- `estraiDatiRicevuta` — `useAI` flag, null quando off
- `aiSuggerisciCespite` — fallback deterministico

### Backend (API)
- `parse-contabilita-pdf.js` — Haiku per causali (solo se chiamato, import ora sono browser-side)
- Tutti i file API — modello switchato a `claude-haiku-4-5-20251001`

### CSS
- `@keyframes aiBadgePulse` — animazione badge
