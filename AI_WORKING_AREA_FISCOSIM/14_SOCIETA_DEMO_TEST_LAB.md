# 14_SOCIETA_DEMO_TEST_LAB — FASE 24A

## Obiettivo
Creare **solo** il recinto di sicurezza per società demo/Test Lab reale. Il Test Lab userà in futuro il motore reale FiscoSim (Import + Manuale + persistenza canonica), ma in 24A **nessun ciclo contabile deve partire**.

## Rischio fase
**ALTO** — rischio contaminazione società reali se il criterio demo è debole o se la UI consente write prima del recinto.

## Regole sicurezza
1. Criterio DEMO **esplicito**: codice società con prefisso `__TEST__` o `test_` (case-insensitive). **Nessuna** euristica su denominazione/ragione sociale.
2. Guardia `assertDemoCompanyForTestLab` obbligatoria prima di qualsiasi operazione Test Lab futura.
3. UI 24A: banner demo, scenari visibili ma **disabilitati**.
4. Vietato in 24A: fatture, import, commit, persistPrimaNotaDraft, delete, cleanup, migration, env/auth/RLS.

## Criterio demo trovato
**SÌ — sicuro a livello applicativo** (prefisso `codice` esplicito).

| Campo DB | Uso |
|---|---|
| `societa.codice` | Criterio primario DEMO (`__TEST__*` / `test_*`) |
| `societa.denominazione` | Solo visualizzazione — **non** usato per qualificazione |
| `societa.note` / `metadata` | Non presenti come flag demo strutturato — gap futuro opzionale (richiederebbe migration, vietata in 24A) |

**Gap residuo**: senza colonna DB dedicata (`is_demo`), la sicurezza dipende dalla disciplina operativa nella creazione società (codice prefissato). Accettabile per 24A.

## Cosa è vietato (24A)
- Generare fatture da UI Test Lab
- Import file / `runImportWorkflow`
- Contabilizzare / `runCommitWorkflow` / `persistPrimaNotaDraft`
- Pulizia dati / delete
- Scenari massivi operativi
- Migration, env, auth, RLS
- Mock o bypass login
- Completamento cespiti / ammortamenti automatici
- Sblocco Riconciliazione bancaria

## Cosa è consentito (24A)
- Helper `isDemoCompany` / `assertDemoCompanyForTestLab`
- UI minima con banner e blocco società non demo
- Elenco scenari **solo visivo**, disabilitato
- Generatori XML in codice (non invocabili da UI) per test unitari su società demo
- Documentazione e test sicurezza

## Cosa sarà 24B / 24C
| Fase | Contenuto |
|---|---|
| **24B** | Prepara test: generazione XML, `runImportWorkflow`, working table in-memory, tag `[TEST_LAB]` |
| **24C** | Ciclo completo commit reale su società demo, report bilanciamento, pulizia selettiva |

## Punti write reali intercettati (audit)
| Modulo | Punto write | Stato 24A |
|---|---|---|
| Import Contabilità | `runCommitWorkflow` → `persistPrimaNotaDraft` | Non raggiungibile da Test Lab UI |
| Registrazione Manuale | `RegistrazioneManualeView` save / commit | Non collegato a Test Lab |
| Test Mode legacy | `EXECUTORS` T01–T26 (insert/delete clienti, PN test) | Perimetro separato — fuori Test Lab 24A |
| Cespiti leggeri | insert `beni_ammortizzabili` post-commit | Non attivabile da Test Lab 24A |

## Anti-contaminazione società reale
- Blocco UI se `!isDemoCompany(currentSocieta)`
- Rimozione criterio debole `denominazione.includes('test')`
- Futuro: tag tracciamento `[TEST_LAB]` + prefisso file `test_lab_` (24B)

## Pulizia dati futura (24C)
Selettiva per società demo + marker:
- `documenti_import.filename` LIKE `test_lab_%`
- `prima_nota.descrizione` LIKE `%[TEST_LAB]%`
- `documenti_contabilita.note_operatore = '[TEST_LAB]'`
- **Non implementata in 24A** (vietato delete)

## Struttura società (audit codice)
Tabella `societa`: `id`, `codice` (UNIQUE), `denominazione`, `codice_fiscale`, `partita_iva`, `regime_contabile`, `attiva`, `note`, timestamps. Nessun flag `is_demo` nativo.

## Ruoli Admin/Owner
Tabella `utenti_studio.ruolo`: `owner`, `admin`, `collaboratore`. Test Lab non restringe per ruolo in 24A — il recinto è per società demo.

## Cambio società attiva
- `src/modules/test_mode/index.jsx` — select società Test Mode
- Moduli contabilità — prop `societaAttiva` da shell principale
- `src/modules/ai_agent/index.jsx` — select dedicato

## Riconciliazione bancaria
**BLOCCATA** — gate Manuale + Import non superato finché Test Lab e matrice test manuale non validati.

## Cespiti
Fase 16 = **aggancio leggero/parziale** (intercettazione conto + bozza `beni_ammortizzabili`). Libro cespiti completo e ammortamenti automatici = **futuro**.

## Test richiesti
- `tests/testLabIntegrazione.test.js` — sicurezza 24A
- Suite regressione contabilità/import invariata
- `npm run build`

## File implementazione 24A
- `src/modules/test_mode/demoCompanyGuard.js` (NEW)
- `src/modules/test_mode/TestLabPanel.jsx` (recinto UI)
- `src/modules/test_mode/TestLabGenerators.js` (guardia strict)
- `tests/testLabIntegrazione.test.js`
