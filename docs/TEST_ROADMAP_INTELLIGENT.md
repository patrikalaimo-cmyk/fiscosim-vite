# Roadmap test FiscoSim — Livello 5 (Intelligent) e validazione completa

Questo documento estende la roadmap operativa con **Level 5: Intelligent Tests**, allineata al motore `runTestScenario` (`services/testScenarioEngine.js`) e al confronto in `services/testScenarioCompare.js`.

## Principi

1. **Flusso utente reale**: gli scenari E2E usano `upload_xml` → `run_pipeline` (stessa pipeline produzione: parsing → AI contabile → partitari → IVA → liquidazione → insight). Le asserzioni leggono lo **stato persistito** (`accounting_entries`, `ai_insights`, `pipeline_steps`), non solo insert grezzi.
2. **Campi AI esposti** (prima scrittura = “primary entry”, come in prima nota):
   - `ai_confidence` (0–100, auto-validazione)
   - `ai_source` (`memory` | `pattern` | `fallback` | `learning` + varianti pipeline)
   - `ai_explanation` (testo breve spiegazione / copilot-style)
3. **Tag critici** (colonna `test_scenarios.critical_tags`): `pipeline`, `iva`, `ai_learning` — per priorità release e badge in Test Mode.

## Struttura `test_scenarios`

| Colonna | Uso |
|--------|-----|
| `steps` | JSON array di step (`upload_xml`, `run_pipeline`, `open_entry`, `validate`, `wait_ms`) |
| `expected_results` | Vedi sezione JSON sotto |
| `kind` | `standard` \| `intelligent` (L5) |
| `critical_tags` | es. `{pipeline,iva}` |

## Schema `expected_results` (dettaglio)

### Base (già supportata)

```json
{
  "document": { "tipo_documento": "fattura_passiva" },
  "accounting_entries": { "min_count": 1 },
  "partitari": { "min_count": 0 },
  "registri_iva": { "min_count": 0 },
  "pipeline": { "completed": true }
}
```

### `pipeline_phases` — fasi `pipeline_steps` (full pipeline)

Verifica ordine e successo delle fasi dopo `run_pipeline`:

```json
"pipeline_phases": {
  "required_order": ["parsing", "ai_accounting", "partitari", "iva", "liquidazione", "insights"],
  "require_all_ok": true,
  "require_step_names": ["insights"]
}
```

### `ai_validation` — Copilot / auto-validate / learning

Confronta la **prima** `accounting_entries` del documento:

```json
"ai_validation": {
  "primary_entry": {
    "required": true,
    "ai_confidence": { "min": 50, "max": 100 },
    "ai_source": { "in": ["memory", "pattern", "learning"] },
    "ai_explanation": { "min_length": 10, "contains": "IVA" },
    "ai_status": { "equals": "auto" }
  }
}
```

- **Auto validate (confidence-based)**: usare `ai_confidence.min` / `max` e `ai_status`.
- **Learning loop** (correction → reuse): scenario separato con stesso XML/layout e memoria `ai_document_memory`; atteso `ai_source` che includa `memory` o `learning` dopo correzione (da verificare su DB reale).
- **Fornitore nuovo senza storico**: atteso `ai_source` ∈ `pattern` / `fallback` / `ai` e confidence più bassa (soglie con `min`/`max`).

### `insights` — Proactive (IVA anomaly, cost trend, fiscal suggestion)

Dopo la fase `insights` della pipeline, gli insight legati al documento (`entity_ref.document_id`) sono conteggiati:

```json
"insights": {
  "min_total": 0,
  "by_tipo": {
    "iva_anomaly": { "min_count": 0 },
    "cost_trend": { "min_count": 0 },
    "fiscal_suggestion": { "min_count": 0 }
  },
  "require_tipos_present": ["iva_anomaly"]
}
```

Nota: i tipi effettivi dipendono dai motori (`proactiveInsightEngine`, `ivaAnomalyEngine`, …) e dai dati di test.

---

## Level 5 — Catalogo scenari (proposti)

Ogni riga è un candidato riga `test_scenarios` con `kind = intelligent` e `critical_tags` indicati.

| ID logico | Nome | Flusso utente | expected_results (focus) | Criticità |
|-----------|------|----------------|---------------------------|-----------|
| L5-01 | Full pipeline end-to-end | XML → `run_pipeline` unico | `pipeline_phases.required_order` completa, `pipeline.completed`, `accounting_entries.min_count` | **pipeline** |
| L5-02 | IVA e registri | Come L5-01 | `registri_iva.min_count` ≥ 1, `insights.by_tipo.iva_anomaly` opzionale | **iva** |
| L5-03 | Learning loop | Due run (stesso layout): 1ª correzione operatore, 2ª reuse | `ai_validation.primary_entry.ai_source.in` include `memory` o `learning` al secondo run | **ai_learning** |
| L5-04 | Fornitore cold start | XML fornitore mai visto | `ai_validation` con `ai_source.in` senza `memory`, `ai_confidence.max` realistici | **ai_learning** |
| L5-05 | Auto validate | Documento che genera `ai_status` / score | `ai_confidence.min`, `ai_status.equals` | — |
| L5-06 | Spiegazione entry | Stesso dato di L5-05 | `ai_explanation.min_length`, `contains` | — |
| L5-07 | Insight IVA | Documento con incoerenze imponibile/IVA/totale | `insights.require_tipos_present`: `iva_anomaly` | **iva** |
| L5-08 | Insight trend costi | Serie documenti / mesi (scenario dati dedicato) | `insights.by_tipo.cost_trend` | — |
| L5-09 | Suggerimento fiscale | Documento che triggera `fiscal_suggestion` | `insights.by_tipo.fiscal_suggestion` | — |

---

## Cosa resta manuale o “fase 2”

- **UI click** (moduli non headless): copilot chat, checklist moduli senza API.
- **Secondo run learning** nello stesso scenario: oggi richiede due esecuzioni o step aggiuntivi non ancora nel motore (`replay_with_memory`); la roadmap li descrive per implementazione futura.

---

## Riferimenti codice

- Motore: `services/testScenarioEngine.js`
- Confronto: `services/testScenarioCompare.js`
- Migration colonne: `supabase/migrations/20260406120000_test_scenarios_intelligent.sql`
- UI: `src/modules/test_mode/TestScenarioE2EPanel.jsx` (badge L5 e tag critici)
