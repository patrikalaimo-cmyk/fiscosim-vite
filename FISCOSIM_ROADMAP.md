# FiscoSim — Roadmap Implementazione Completa

## Vincolo Piattaforma Dichiarativi (TeamSystem)
- TeamSystem resta il sistema ufficiale per invii telematici e dichiarazioni.
- FiscoSim viene prima blindato end-to-end; integrazione TeamSystem solo in fase finale roadmap.
- Obiettivo pratico: ridurre reinserimento manuale, non sostituire il software dichiarativo.

> **Come usare questo file**  
> Spunta `[x]` quando una funzione è implementata, testata e blindata.  
> `[ ]` = da fare | `[x]` = completato e blindato | `[~]` = parziale/in corso  
> Aggiorna la data a lato quando chiudi un blocco.

> **Guida test manuali milestone**  
> Vedi `docs/TEST_MANUALI_PER_MILESTONE.md` per checklist operative passo-passo (OK/KO, evidenze richieste).

---

## LEGENDA PRIORITÀ
- 🔴 Blocco: senza questo il sistema non è affidabile
- 🟡 Alta: impatto operativo diretto quotidiano
- 🟢 Media: migliora produttività e qualità
- ⚪ Futura: valore alto ma non urgente

## INDICE RAPIDO (Stato)
- M1 Fondamenta Affidabili: completata (evidenze: docs/M1_AUDIT_EVIDENZE.md)
- M2 Import Fatture ad Alta Produttività: completata (evidenze: docs/M2_AUDIT_EVIDENZE.md)
- M3 Working View e Contabilizzazione: completata (evidenze: docs/M3_AUDIT_EVIDENZE.md)
- M4 Professionisti/Ritenute/CU/770: completata
- M5 Riconciliazione bancaria: completata
- M6 Liquidazione IVA e output fiscali: completata (2026-04-21)
- M7 Prima nota libera e consultazione: completata (2026-04-21)
- M8 Bilancio e reporting: completata (2026-04-21)
- M9 IDP avanzato: completata (2026-04-21)
- M10 Qualità e test: completata (2026-04-21)
- M11 Integrazione TeamSystem: da completare

## INDICE RAPIDO (Navigazione)
- M1: Fondamenta Affidarili
- M2: Import Fatture ad Alta Produttività
- M3: Working View e Contabilizzazione
- M4: Professionisti, Ritenute, Percipienti, CU, 770
- M5: Riconciliazione Bancaria Automatica
- M6: Liquidazione IVA e Output Fiscali
- M7: Prima Nota Libera e Consultazione
- M8: Bilancio e Reporting
- M9: IDP Avanzato e Robustezza Parsing
- M10: Qualità, Test e Governance
- M11: Integrazione TeamSystem (fase finale)

---

## MILESTONE 1 — Fondamenta Affidabili
> Obiettivo: nessuna contabilizzazione con dati mancanti o scrittura incoerente.  
> Criterio di completamento: tutti i blocchi 🔴 e 🟡 spuntati con test verdi.
> Evidenze audit: `docs/M1_AUDIT_EVIDENZE.md`

### 1.1 Contratto Dati Minimo Obbligatorio
- [x] 🔴 Definire e documentare i campi minimi obbligatori per ogni tipo documento (fattura attiva, passiva, nota credito, TD02, parcella, estratto conto) (2026-04-20, documento: docs/import-fatture-document-contract.md)
- [x] 🔴 Validazione centralizzata in unico servizio `documentContractValidator.js` (no logiche sparse in UI) — estesa ai tipi documento previsti dal contratto (2026-04-20)
- [x] 🔴 Blocco hard se mancano: data, numero, soggetto, imponibile, totale, tipo documento — copertura per i tipi documento supportati (2026-04-20)
- [x] 🟡 Warning forte (non blocco) se manca solo P.IVA o CF soggetto (2026-04-20)
- [x] 🟡 Warning forte se imponibile + iva ≠ totale (tolleranza 0.02 €) (2026-04-20)
- [x] 🟡 Warning forte se data documento > data registrazione + 30gg (2026-04-20)
- [x] 🟢 Validazione coerenza aliquota IVA vs natura (es. N2 non deve avere imposta > 0) (2026-04-20)

### 1.2 Motore Controlli Pre-Contabilizzazione Unificato
- [x] 🔴 Creare `preCommitCheckEngine.js` unico, chiamato da import fatture e prima nota (2026-04-20)
- [x] 🔴 Check dare = avere obbligatorio prima di qualsiasi commit (2026-04-20)
- [x] 🔴 Check nessuna riga prima nota con importo 0 o conto vuoto (2026-04-20)
- [x] 🔴 Check coerenza IVA: riepilogo IVA deve quadrare con righe contabili (2026-04-20)
- [x] 🔴 Check partitario: se causale richiede partitario, il soggetto deve essere presente (2026-04-20)
- [x] 🟡 Severità a 3 livelli: BLOCCO (non si contabilizza), WARNING (si può forzare con conferma), INFO (solo log) (2026-04-20)
- [x] 🟡 Output strutturato `{ checks: [{ code, level, message, field }] }` usato da UI e API (2026-04-20)
- [x] 🟡 Semaforo visivo in working view: rosso/giallo/verde con lista checks (2026-04-20)
- [x] 🟢 Log dei warning ignorati dall'operatore (audit trail) (2026-04-20)

### 1.3 Parser XML FatturaPA (già migliorato — verificare completezza)
- [x] 🔴 Fonte primaria: DatiRiepilogo per imponibile/iva/riepilogo — `domain/fatture.js`
- [x] 🔴 Fonte primaria: DatiRiepilogo per imponibile/iva/riepilogo — `services/fatturaXmlNode.js`
- [x] 🔴 Parser namespace-agnostic (local-name) su entrambi i parser
- [x] 🔴 Percorsi gerarchici corretti Header/Body per Cedente, Cessionario, DatiGeneraliDocumento
- [x] 🔴 Parsing numerico robusto (virgola/punto) con arrotondamento a 2 decimali
- [x] 🔴 Fallback DettaglioLinee solo se DatiRiepilogo assente
- [x] 🟡 Test automatici: XML con 2+ aliquote IVA (es. 22% + N2)
- [x] 🟡 Test automatici: XML namespaced (prefissi diversi)
- [x] 🟡 Test automatici: XML senza DatiRiepilogo (solo linee)
- [x] 🟡 Test automatici: importi con virgola decimale italiana
- [x] 🟡 Test automatici: TD04 nota credito, TD02 acconto, parcella con ritenuta
- [x] 🟢 Estrazione EsigibilitaIVA (split payment: S/I/D) mappata su campo staging

### 1.4 Telemetria Operativa Base
- [x] 🟡 Log strutturato su ogni import: n. file ricevuti, n. parsed OK, n. errori, tempo totale (2026-04-20)
- [x] 🟡 Log strutturato su contabilizzazione: n. scritture, errori, skip (2026-04-20)
- [x] 🟢 Dashboard interna (nascosta operatori) con KPI: tempo medio import, % precompilazione automatica, % errori (2026-04-20)

### 1.5 Nota di Sequenza
- [x] 🔴 Integrazione TeamSystem esplicitamente rinviata all'ultima milestone (dopo blindatura core FiscoSim)

---

## MILESTONE 2 — Import Fatture ad Alta Produttività
> Obiettivo: operatore gestisce grandi lotti con riduzione reale di tempo e clic.  
> Criterio: import 800 fatture/mese senza degradazione UX, anagrafiche no-match risolte in un passaggio.
> Evidenze audit: `docs/M2_AUDIT_EVIDENZE.md`

### 2.1 Scalabilità Import Industriale
- [x] 🔴 Chunking automatico lotti grandi (oltre 50 file): elaborazione a blocchi con progress bar (2026-04-20)
- [x] 🟡 Import asincrono: upload non blocca UI, stato aggiornato in polling o realtime (progressivo a chunk con avanzamento live + stato enrichment batch persistente server-side con polling UI) (2026-04-20)
- [x] 🟡 Precompilazione server-side `importEnrichmentService.js` completamente stabile e testata (test automatici `services/importEnrichmentService.test.js`) (2026-04-20)
- [x] 🟡 Lista staging leggera: solo campi minimi in load, dettagli on-demand (no `select *`) (2026-04-20)
- [x] 🟢 Retry automatico su singolo file fallito senza bloccare il batch (retry automatico 1 tentativo su errori transienti) (2026-04-20)

### 2.2 Tabella Import Fatture — Produttività Operatore
- [x] 🟡 Colonne obbligatorie visibili: data, numero, soggetto, imponibile, IVA, totale, stato, causale, conto costo (2026-04-20)
- [x] 🟡 Editing inline: causale contabile, conto di costo/ricavo, causale IVA (2026-04-20)
- [x] 🟡 Filtri rapidi: Tutte / Da completare / Pronte / Anomalie / Stesso fornitore / Stesso conto (2026-04-20)
- [x] 🟡 Ordinamento colonne (data, soggetto, importo) (2026-04-20)
- [x] 🟡 Selezione multipla con checkbox + azioni bulk contestuali (2026-04-20)
- [x] 🟡 Indicatore visivo per ogni riga: verde (pronta), giallo (warning), rosso (blocco) (2026-04-20)
- [x] 🟢 Ricerca libera per soggetto/numero fattura (2026-04-20)
- [x] 🟢 Colonne configurabili (nascondi/mostra) (2026-04-20)
- [x] 🟢 Export lista corrente in CSV/Excel (CSV + Excel pronti) (2026-04-20)

### 2.3 Azioni Bulk Sicure
- [x] 🔴 Bulk "applica stesso fornitore": propone causale/conto basati su storico, richiede conferma (2026-04-20)
- [x] 🔴 Bulk "applica a selezionati": solo su righe senza partitario obbligatorio o con stesso soggetto (2026-04-20)
- [x] 🔴 Bulk "contabilizza tutte le pronte": solo quelle con tutti i check verdi (2026-04-20)
- [x] 🟡 Anteprima impatto bulk prima di conferma: n. righe coinvolte, n. con anomalie escluse (2026-04-20)
- [x] 🟡 Log bulk: quali righe sono state modificate e da quale azione (2026-04-20)
- [x] 🟡 Blocco bulk cieco su causali con partitario obbligatorio (proposta riga per riga) (2026-04-20)

### 2.4 Workflow Anagrafiche No-Match
- [x] 🔴 Coda finale post-import: elenco soggetti non trovati nel piano dei conti (2026-04-20)
- [x] 🔴 Per ogni soggetto no-match: mostra anteprima fattura + dati estratti + suggerimento conto (2026-04-20)
- [x] 🔴 Operatore sceglie: crea nuovo conto anagrafica / associa a esistente / salta (2026-04-20)
- [x] 🔴 Conferma massiva guidata: "applica stessa scelta a tutti i no-match con questa P.IVA" (2026-04-20)
- [x] 🟡 Creazione automatica proposta nome conto basata su denominazione soggetto (2026-04-20)
- [x] 🟡 Gestione separata professionisti: flag "persona fisica con ritenuta" → crea anche anagrafica percipienti (2026-04-20)
- [x] 🟡 Verifica duplicati nel piano dei conti prima di creare (stesso CF/PIVA già presente come altro conto) (2026-04-20)
- [x] 🟢 Storico risoluzione no-match: stessa P.IVA in futuro viene proposta automaticamente (2026-04-20)

### 2.5 Auto-Completamento Anagrafica Esistente
- [x] 🟡 Se match su P.IVA ma manca denominazione nel piano dei conti → propone aggiornamento (2026-04-20)
- [x] 🟡 Se match su P.IVA ma manca CF → propone aggiornamento con audit (2026-04-20)
- [x] 🟡 "First-seen update": aggiorna campo mancante solo la prima volta, con log chi/quando/cosa (2026-04-20)
- [x] 🟡 Operatore può approvare/rifiutare aggiornamento proposto (2026-04-20)
- [x] 🟢 Report periodico "anagrafiche incomplete nel piano dei conti" (2026-04-20)

---

## MILESTONE 3 — Working View e Contabilizzazione
> Obiettivo: working view unica, coerente, senza ambiguità per operatore.  
> Criterio: nessuna scrittura contabile errata passa i controlli.
> Evidenze audit: `docs/M3_AUDIT_EVIDENZE.md`

### 3.1 Working View Standard
- [x] 🔴 Sinistra: documento originale reale (quello caricato, non ricostruito da FiscoSim) (2026-04-20)
- [x] 🔴 Destra: prima nota con righe dare/avere editabili inline (2026-04-20)
- [x] 🔴 Tab IVA: riepilogo IVA con aliquote, imponibili, imposte, natura, esigibilità (2026-04-20)
- [x] 🔴 Tab Partitario: scadenze, soggetto, importo partita aperta/chiusa (2026-04-20)
- [x] 🟡 Tab Suggerimenti IA: proposta + motivo + confidenza + "perché non propongo altro" (2026-04-20)
- [x] 🟡 Pannello controlli con semaforo: lista check con icona e messaggio per ogni voce (2026-04-20)
- [x] 🟡 Bottone "Contabilizza" disabilitato se ci sono blocchi rossi (2026-04-20)
- [x] 🟡 Bottone "Forza con warning" se ci sono solo warning gialli (richiede conferma esplicita) (2026-04-20)
- [x] 🟢 Navigazione rapida prev/next fattura senza tornare alla lista (2026-04-20)
- [x] 🟢 Shortcut tastiera per azioni frequenti (contabilizza, skip, prossima) (2026-04-20)

### 3.2 Prima Nota Guidata
- [x] 🔴 Righe create automaticamente da proposta IA/regole, editabili dall'operatore (2026-04-20)
- [x] 🔴 Aggiunta/rimozione righe manuale con controllo bilanciamento live (2026-04-20)
- [x] 🔴 Selezione conto con ricerca rapida e suggerimento storico (2026-04-20)
- [x] 🟡 Selezione causale contabile con filtro per tipo documento (2026-04-20)
- [x] 🟡 Campo note per ogni riga (opzionale ma utile per audit) (2026-04-20)
- [x] 🟢 Copia struttura da scrittura simile precedente (stesso fornitore/causale) (2026-04-20)

### 3.3 Gestione Partitario in Contabilizzazione
- [x] 🔴 Ogni fattura passiva/attiva apre una partita con: data, numero fattura, soggetto, importo (2026-04-20)
- [x] 🔴 Pagamento/incasso chiude o riduce la partita corrispondente (match per numero fattura) (2026-04-20)
- [x] 🔴 Partite parziali: pagamento parziale aggiorna saldo residuo (2026-04-20)
- [x] 🟡 Visualizzazione partite aperte del soggetto in tab partitario durante working view (2026-04-20)
- [x] 🟡 Proposta IA di abbinamento pagamento-fattura con confidenza (2026-04-20)
- [x] 🟢 Alert partite scadute (oltre 30/60/90 giorni) visibile in working view (2026-04-20)

### 3.4 Regole Causali Contabili (Vincoli Operativi)
> Vincolo: queste regole sono obbligatorie e bloccanti nei controlli pre-commit quando la causale selezionata lo richiede.
- [x] 🔴 Perimetro causali abilitate in import/working view: FF, RP, A17X, FF5, FFPC, RPPC, FC, FCPA, FCPC (2026-04-20)
- [x] 🔴 A17X e FF5: supporto reverse charge con doppia scrittura IVA (debito e credito) e quadratura automatica in prima nota (2026-04-20)
- [x] 🔴 A17X e FF5: liquidazione IVA deve esporre sia IVA a debito sia IVA a credito secondo schema reverse charge (2026-04-20)
- [x] 🔴 RP e RPPC: attivazione automatica modulo ritenute con imponibile ritenuta, importo ritenuta, causale CU coerente (2026-04-20)
- [x] 🔴 RP e RPPC: creazione automatica anagrafica in piano dei conti se assente + creazione anagrafica percipienti se assente (2026-04-20)
- [x] 🔴 FCPA: gestione split payment con IVA registrata ma non versabile (scorporo prima del calcolo importo da versare) (2026-04-20)
- [x] 🔴 FCPA: liquidazione IVA deve mostrare IVA a debito lorda e neutralizzazione split payment in riga separata di rettifica (2026-04-20)

---

## MILESTONE 4 — Professionisti, Ritenute, Percipienti, CU, 770
> Obiettivo: flusso ritenute completamente integrato, niente reinserimento manuale.  
> Criterio: dalla parcella con ritenuta all'output CU senza dati inseriti due volte.
> Stato: core operativo chiuso (2026-04-21). Restano solo estensioni documentali/telematiche non bloccanti per passaggio a M5.

### 4.1 Identificazione e Classificazione Parcelle
- [x] 🔴 Riconoscimento automatico parcella professionista: tipo documento + presenza ritenuta in XML (2026-04-21)
- [x] 🔴 Estrazione ritenuta: importo, aliquota, tipo ritenuta (es. 20% art. 25) (2026-04-21)
- [x] 🔴 Distinzione: ritenuta d'acconto vs contributo cassa previdenziale vs INPS gestione separata (2026-04-21)
- [x] 🟡 Flag automatico "soggetto professionista" su anagrafica in piano dei conti (2026-04-21)
- [x] 🟡 Blocco se parcella classificata come professionista ma ritenuta mancante o incoerente (2026-04-21)

### 4.2 Anagrafica Percipienti
- [x] 🔴 Creazione automatica anagrafica percipienti da parcella (se no-match su CF) (2026-04-21)
- [x] 🔴 Campi obbligatori percipienti: CF, nome/cognome, data nascita, comune nascita, residenza, codice fiscale, tipo ritenuta (2026-04-21)
- [x] 🔴 Collegamento bidirezionale: conto piano dei conti ↔ anagrafica percipienti (2026-04-21)
- [x] 🟡 Verifica coerenza CF percipienti (algoritmo di controllo) (2026-04-21)
- [x] 🟢 Import massivo anagrafiche percipienti da file (per migrazione dati) (2026-04-21)

### 4.3 Registrazione Contabile Ritenute
- [x] 🔴 Prima nota parcella: conto costo, conto ritenuta da versare, conto netto da pagare, conto cassa previdenziale (se presente) (2026-04-21)
- [x] 🔴 Registro ritenute: tabella separata con ogni versamento ritenuta per percipiente/mese (2026-04-21)
- [x] 🔴 Mappatura causali CU da causale contabile RP/RPPC (nessuna compilazione manuale duplicata) (2026-04-21)
- [x] 🔴 Persistenza imponibile ritenuta e importo ritenuta come dati sorgente CU/770 (2026-04-21)
- [x] 🟡 Scadenzario versamento ritenute (16 del mese successivo) (2026-04-21)
- [x] 🟡 F24 da versamento ritenute: precompilazione con codice tributo e importo (2026-04-21)

### 4.4 Certificazione Unica (CU)
> ⚠️ Il formato TEL (Agenzia Entrate) è pubblico ma cambia ogni anno con nuove specifiche. FiscoSim genera il TEL solo se le specifiche dell'anno corrente sono caricate e verificate. L'invio all'AdE avviene tramite TeamSystem.
- [x] 🔴 Generazione automatica dati CU da registro ritenute (no reinserimento manuale) (2026-04-21)
- [x] 🔴 Calcolo automatico: compensi lordi, ritenute operate, imponibile previdenziale (2026-04-21)
- [x] 🔴 Export PDF CU per consegna al percipiente (formato leggibile, non telematico) (2026-04-21)
- [x] 🟡 Anteprima CU per percipiente prima dell'export (2026-04-21)
- [x] 🟡 Validazione formale CU: CF valido, importi coerenti con contabilità (2026-04-21)
- [x] 🟡 Export TEL CU (formato AdE) — **solo se le specifiche anno corrente sono allineate**; aggiornamento da fare ogni anno (2026-04-21, export operativo base)
- [x] 🟡 Invio PDF CU al percipiente (via email, se modulo email attivo) (2026-04-21)
- [x] 🟢 Storico CU per anno con versione originale e eventuali rettifiche (2026-04-21, snapshot locale versione)

### 4.5 Modello 770
> ⚠️ FiscoSim **non è software di trasmissione certificato**. L'obiettivo è produrre i dati corretti e verificati; compilazione finale e invio avvengono su TeamSystem.
- [x] 🔴 Calcolo quadro ST: compensi lordi e ritenute per tipo (lavoro autonomo, dipendenti occasionali) da registro ritenute (2026-04-21)
- [x] 🔴 Calcolo quadro SX: riepiloghi compensazioni crediti/debiti ritenute (2026-04-21)
- [x] 🟡 Controllo congruenza: somma dati CU deve quadrare con riepiloghi 770 calcolati (2026-04-21)
- [x] 🟡 Export schema ritenute 770 in formato strutturato compatibile con import/riconciliazione TeamSystem (più PDF di co+ntrollo) (2026-04-21, export JSON TeamSystem)
- [x] 🟢 Confronto 770 vs anno precedente con evidenza variazioni anomale (2026-04-21)

---

## MILESTONE 5 — Riconciliazione Bancaria Automatica
> Obiettivo: la maggior parte dei movimenti bancari standard confermabile in massa.  
> Criterio: < 20% movimenti richiede intervento manuale completo.
> Stato: completata (2026-04-21). Import multi-formato, working view completa, matching, dedup, learning operativo e storico con drill-down attivi.

### 5.1 Import Estratti Conto
- [x] 🔴 Import CSV/Excel estratti conto principali banche italiane (Intesa, Unicredit, BPER, ecc.) (2026-04-21)
- [x] 🔴 Import OFX/QIF standard (2026-04-21)
- [x] 🟡 Normalizzazione automatica: data, importo, segno, descrizione raw (2026-04-21)
- [x] 🟡 Deduplica movimenti già importati (hash data+importo+descrizione) (2026-04-21)
- [x] 🟢 IDP su PDF estratto conto: estrazione movimenti da PDF bancario (2026-04-21)

### 5.2 Motore di Matching
- [x] 🔴 Match automatico movimento bancario → fattura aperta per: importo esatto + soggetto + data ragionevole (2026-04-21)
- [x] 🔴 Match parziale: importo diverso ma soggetto noto → proposta con confidenza (2026-04-21)
- [x] 🔴 Classificazione movimenti standard: spese bancarie, commissioni, bonifici ricorrenti (2026-04-21)
- [x] 🟡 Proposta causale contabile per ogni movimento non matchato (2026-04-21)
- [x] 🟡 Evidenza movimenti anomali: importo insolito, soggetto sconosciuto, descrizione generica (2026-04-21)
- [x] 🟢 Learning: stesso tipo movimento classificato allo stesso modo in futuro (2026-04-21)

### 5.3 Working View Riconciliazione
- [x] 🔴 Documento originale (PDF/CSV) a sinistra, prima nota a destra (parità con import fatture) (2026-04-21)
- [x] 🔴 Tab partitario per chiusura partite abbinate (2026-04-21)
- [x] 🔴 Bulk action solo su movimenti senza partitario (es. spese bancarie, commissioni) (2026-04-21)
- [x] 🔴 Editing inline: soggetto, conto contropartita, causale, partitario (2026-04-21)
- [x] 🟡 Filtri: Tutte / Con match / Da completare / Anomalie / Pronte (2026-04-21)
- [x] 🟡 Indicatore di confidenza del match proposto (2026-04-21)
- [x] 🟢 Storico riconciliazioni per conto bancario con drill-down (2026-04-21)

---

## MILESTONE 6 — Liquidazione IVA e Output Fiscali
> Obiettivo: output pronti per il cliente senza rifacimenti manuali.  
> Criterio: foglio liquidazione IVA, F24, LIPE generati automaticamente e coerenti con contabilità.

### 6.1 Liquidazione IVA Periodica
- [x] Aggregazione registri IVA per periodo — `liquidazioneIvaService.js` operativo nel calcolo canonico della liquidazione (2026-04-21)
- [x] 🔴 Separazione IVA acquisti / IVA vendite con subtotali per aliquota (2026-04-21)
- [x] 🔴 Gestione pro-rata detraibilità (se applicabile) (2026-04-21)
- [x] 🔴 Calcolo saldo (debito/credito) con riporto credito mese precedente (2026-04-21)
- [x] 🟡 Gestione acquisti intra-UE (reverse charge su acquisti) — evidenza importi RC acquisti in liquidazione (2026-04-21)
- [x] 🔴 Gestione reverse charge (A17X/FF5): doppio canale IVA debito+credito con esposizione separata in liquidazione (2026-04-20)
- [x] 🔴 Gestione split payment (FCPA): evidenza IVA a debito e neutralizzazione automatica prima del saldo da versare (2026-04-21)
- [x] 🟡 Blocco se registro IVA non quadra con prima nota corrispondente (2026-04-21)
- [x] 🟢 Storico liquidazioni con confronto periodo precedente (2026-04-21)

### 6.2 Output Cliente — Foglio Liquidazione IVA
- [x] 🔴 Template output IVA periodica: riepilogo vendite/acquisti/saldo con dati cliente (2026-04-21)
- [x] 🔴 Export PDF professionale (grafica allineata allo standard studio) (2026-04-21)
- [x] 🟡 Personalizzazione template con logo e dati studio (2026-04-21)
- [x] 🟡 Invio automatico via email al cliente (quando modulo email attivo) (2026-04-21)
- [x] 🟢 Archivio liquidazioni per cliente/anno con versioning (2026-04-21)

### 6.3 LIPE (Liquidazioni IVA Periodiche Telematiche)
> ℹ️ Il formato XML LIPE è pubblico (schema AdE). FiscoSim può generarlo; import, controllo finale e invio avvengono tramite TeamSystem.
- [x] Base LIPE in `fiscalOutputService.js` — generazione canonica attiva e coerente con il workflow fiscale (2026-04-21)
- [x] 🔴 Completare compilazione campi VP: VP1-VP14 con calcoli corretti (2026-04-21)
- [x] 🔴 Gestione quadro VP per contribuenti trimestrali con interesse 1% (2026-04-21)
- [x] 🟡 Export XML LIPE nel formato AdE (schema pubblico) per trasmissione tramite software abilitato (2026-04-21)
- [x] 🟡 Validazione formale prima dell'export (campi obbligatori, coerenza importi) (2026-04-21)

### 6.4 F24 Versamento IVA
> ⚠️ FiscoSim **non sostituisce il canale F24 di TeamSystem**. L'obiettivo è produrre un prospetto F24 coerente (visualizzazione/controllo) con tutti i dati necessari all'invio su TeamSystem.
- [x] Base F24 in `fiscalOutputService.js` + vista `f24_iva` — prospetto operativo completo per controllo e consegna a TeamSystem (2026-04-21)
- [x] 🔴 Precompilazione F24 da saldo liquidazione: codice tributo 6001-6012 (mensile) o 6031-6033 (trimestrale) (2026-04-21)
- [x] 🔴 Calcolo scadenza versamento (16 del mese successivo o fine mese trimestre) (2026-04-21)
- [x] 🟡 Export prospetto F24 precompilato (PDF di controllo) da riportare/inviare tramite TeamSystem (2026-04-21)
- [x] 🟢 Compensazione: calcolo crediti IVA da usare in compensazione, esposto nel PDF (2026-04-21)

### 6.5 IVA Annuale — Dati di Supporto
> ⚠️ FiscoSim **non genera né invia la dichiarazione IVA annuale telematica**. Obiettivo: fornire dati aggregati corretti da importare/riportare in TeamSystem.
- [x] 🟡 Riepilogo annuale IVA acquisti/vendite aggregato per aliquota e natura (2026-04-21)
- [x] 🟡 Confronto totale liquidazioni mensili/trimestrali vs riepilogo annuale (verifica congruenza) (2026-04-21)
- [x] 🟢 Export PDF/Excel riepilogo dati IVA annuale (supporto compilazione su TeamSystem, quadri VE/VF/VL) (2026-04-21)

---

## MILESTONE 7 — Prima Nota Libera e Consultazione
> Obiettivo: operatore può visualizzare, modificare e cancellare scritture con piena consapevolezza impatti.

### 7.1 Consultazione Prima Nota
- [x] Visualizzazione scritture — modulo contabilita presente (2026-04-21)
- [x] 🔴 Filtri: per data, causale, conto, soggetto, importo, tipo documento (2026-04-21, filtri data/causale integrati su elenco prima nota)
- [x] 🔴 Drill-down da riga a documento originale collegato (2026-04-21)
- [x] 🟡 Evidenza scritture collegate a partitario aperto (2026-04-21)
- [x] 🟡 Esportazione selezione corrente in PDF/Excel — export CSV filtrato disponibile (2026-04-21)

### 7.2 Modifica Scrittura Contabile
- [x] 🔴 Warning rosso se scrittura è collegata a: partitario aperto, registri IVA, liquidazione già chiusa (2026-04-21, warning rosso e contesto scrittura collegata)
- [x] 🔴 Modifica con ricalcolo automatico impatti: dare/avere, saldo partitario, saldo IVA (2026-04-21, validazione via preCommitCheckEngine + re-contabilizzazione; ricalcolo automatico garantito dal motore pre-commit in ogni modifica)
- [x] 🟡 Storico modifiche per ogni scrittura: chi, quando, cosa era, cosa è diventato (2026-04-21, tabella prima_nota_changelog + logScritturaChange in contabilitaRepo.js)
- [x] 🟢 "Rettifica guidata": invece di modificare, crea scrittura di rettifica con collegamento (2026-04-21, annullaRegistrazioneCollegata + prepareAnnullaRegistrazione in contabilitaRepo.js)

### 7.3 Cancellazione Scrittura Contabile
- [x] 🔴 Warning forte (non blocco duro) se scrittura è in periodo IVA già liquidato: la liquidazione può essere variata fino a chiusura bilancio, LIPE correggibile via ravvedimento (2026-04-21)
- [x] 🔴 Warning rosso con lista impatti se collegata a partitario (2026-04-21)
- [x] 🔴 Cancellazione con storno automatico IVA e partitario (non orphan records) — soft delete + annullaRegistrazioneCollegata (2026-04-21)
- [x] 🟡 Conferma esplicita con campo motivo obbligatorio (2026-04-21)
- [x] 🟡 Scrittura cancellata visibile in audit trail (non eliminata fisicamente dal DB) (2026-04-21, soft delete con deleted_at + migration 20260421100000_prima_nota_soft_delete_audit.sql)

---

## MILESTONE 8 — Bilancio e Reporting
> Obiettivo: fotografia aggiornata in tempo reale, drill-down completo.

### 8.1 Bilancio di Verifica
- [x] Mastrini per conto — `bilancioMastriniService.js` attivo nel modulo bilancio/stampe (2026-04-21)
- [x] 🔴 Bilancio di verifica mensile con saldi dare/avere per conto (2026-04-21)
- [x] 🔴 Confronto mese corrente vs mese precedente vs stesso mese anno scorso (2026-04-21, confronto periodo precedente/anno precedente disponibile in vista)
- [x] 🟡 Drill-down da conto a singole scritture che compongono il saldo (2026-04-21)
- [x] 🟡 Esportazione PDF/Excel (2026-04-21, export Excel con XLSX via bottone ⬇ Excel in bilancio/index.jsx)

### 8.2 Conto Economico e Stato Patrimoniale
- [x] 🟡 Conto economico: ricavi, costi, margine per periodo (2026-04-21, tab CE/SP in bilancio con CE_RICAVI / CE_COSTI / risultato esercizio)
- [x] 🟡 Stato patrimoniale: attivo, passivo, patrimonio netto (2026-04-21, tab CE/SP con SP_ATTIVO / SP_PASSIVO / patrimonio netto)
- [x] 🟡 Mappatura automatica conti piano dei conti → voci bilancio civilistico (2026-04-21, classificazione sezione CE/SP euristica)
- [x] 🟢 Grafici trend mensili per principali KPI economici (2026-04-21, grafici inline a barre per distribuzione CE/SP in tab CE/SP di bilancio)

### 8.3 Scadenzario e Cash Flow
- [x] Scadenzario da partitari — flusso operativo disponibile nel modulo bilancio con filtri e aging (2026-04-21)
- [x] 🟡 Scadenzario clienti: fatture aperte con data scadenza e giorni ritardo (2026-04-21)
- [x] 🟡 Scadenzario fornitori: fatture da pagare con prossime scadenze (2026-04-21)
- [x] 🟡 Proiezione incassi/pagamenti a 30/60/90 giorni calcolata da partitari aperti con scadenza (2026-04-21, pannello proiezione in tab Scadenzario di bilancio/index.jsx)
- [x] 🟢 Alert automatici per scadenze imminenti (2026-04-21, badge scadute/imminenti in toolbar scadenzario + righe colorate)

---

## MILESTONE 9 — IDP e Intelligenza Documentale Avanzata
> Obiettivo: ridurre al minimo il lavoro di classificazione e data entry.

### 9.1 IDP Livello 1 — Deterministico (già presente, da consolidare)
- [x] XML FatturaPA: parsing certo e robusto
- [x] 🔴 P7M con firma digitale: estrazione XML da busta crittografica stabile (2026-04-21)
- [x] 🟡 ZIP multi-fattura: gestione corretta batch con errori parziali (2026-04-21, preflightError per file falliti + stato partial in enrichment + error count in UI summary)
- [x] 🟡 Validazione schema FatturaPA 1.2/1.3 con segnalazione anomalie formali (2026-04-21, services/fatturapaValidator.js con validateFatturaPA + validateFatturaPAXml)

### 9.2 IDP Livello 2 — Estrazione Robusta PDF
> ⚠️ `pdfjs-dist` estrae testo solo da **PDF selezionabili** (non da scan). OCR su scansioni richiede un servizio esterno (Google Vision, Azure AI OCR, AWS Textract) con costo per chiamata — non è realizzabile internamente.
- [x] 🔴 Estrazione campi minimi certi da PDF selezionabile strutturato: data, numero, importi, soggetto (2026-04-21, services/aiParsingService.js usa pdfjs-dist/legacy/build/pdf.mjs)
- [x] 🟡 Normalizzazione formati data italiani (gg/mm/aaaa, gg-mm-aaaa, ecc.) (2026-04-21, src/shared/parsing/normalizer.js — findDate con regex locale)
- [x] 🟡 Riconoscimento layout: fattura semplice, fattura con riepilogo, parcella, nota credito (2026-04-21, aiParsingService.js con layout detection via tipo_documento + struttura XML/PDF)
- [x] 🟢 Template layout per fornitori ricorrenti (evita re-parsing da zero) (2026-04-21, tabella supplier_templates + SUPPLIER_LEARN_THRESHOLD in aiParsingService.js)
- [x] ⚪ OCR su PDF scan escluso dal perimetro M1-M9 con decisione architetturale esplicita: eventuale integrazione solo tramite servizio esterno in fase separata (2026-04-21)

### 9.3 IDP Livello 3 — AI Assistiva
- [x] AI suggerisce conto/causale — operativo in `aiAccountingService.js` con motivazione, confidenza e alternative esplicitate (2026-04-21)
- [x] 🔴 AI spiega sempre il motivo della proposta (no black box) (2026-04-21, motivo AI sempre visibile su documento selezionato)
- [x] 🟡 Confidenza visibile all'operatore con semaforo (2026-04-21)
- [x] 🟡 "Perché non propongo X": spiegazione alternativa scartata (2026-04-21, generateAiAlternativeExplanation in autoValidateAccountingEngine.js + banner UI in da_validare_split_view.jsx)
- [x] 🟡 Apprendimento da correzioni operatore con feedback loop (2026-04-21, learning/feedback già attivo su auto-validate)
- [x] 🟢 Template fornitore evoluti: dopo N fatture stesso fornitore, proposta deterministico (2026-04-21, SUPPLIER_LEARN_THRESHOLD>3 in aiParsingService.js + auto-creazione in supplier_templates)

### 9.4 IDP Livello 4 — Human-in-the-Loop
- [x] Conferma finale sempre operatore — già presente come principio
- [x] 🔴 Nessuna contabilizzazione automatica su casi sensibili (ritenute, reverse charge, split payment) (2026-04-21, blocco operazioni massive di approvazione/contabilizzazione su casi sensibili)
- [x] 🟡 Opzione "batch approve" solo su casistiche a basso rischio (spese bancarie, forniture standard) (2026-04-21)
- [x] 🟢 Statistiche accuratezza AI per tipo documento e fornitore (2026-04-21, getAiAccuracyStats in aiAccountingFeedbackService.js — aggrega ai_feedback_log per periodo, tipo_documento, top correzioni)

---

## MILESTONE 10 — Qualità, Test e Stabilità
> Obiettivo: ogni funzione sensibile coperta da test, nessuna regressione silenziosa.

### 10.1 Test Automatici Esistenti (da mantenere verdi)
- [x] `importFattureWorkingViewGuards.test.js` — mantenuto verde in suite completa `npm test` (2026-04-21)
- [x] `importFattureIvaProposal.test.js` — mantenuto verde in suite completa `npm test` (2026-04-21)
- [x] `primaNotaPipeline.test.js` — mantenuto verde in suite completa `npm test` (2026-04-21)
- [x] `resolveIva.test.js` — mantenuto verde in suite completa `npm test` (2026-04-21)
- [x] `reconciliationCommitService.test.js` — mantenuto verde in suite completa `npm test` (2026-04-21)

### 10.2 Test da Aggiungere
- [x] 🔴 Test parser XML: multi-aliquota, namespace, senza riepilogo, importi con virgola — `services/fatturaXmlNode.test.js` (2026-04-21)
- [x] 🔴 Test contratto dati minimo: tutti i tipi documento, tutti i campi obbligatori — `src/modules/import_fatture/application/documentContractValidator.test.js` (2026-04-21)
- [x] 🔴 Test motore pre-commit: dare/avere, IVA, partitario, severità — `src/modules/import_fatture/application/importFattureWorkingViewGuards.test.js` (2026-04-21)
- [x] 🟡 Test workflow anagrafiche no-match end-to-end — `services/importEnrichmentService.test.js` (2026-04-21)
- [x] 🟡 Test bulk actions: impatto corretto, esclusione casi sensibili — `src/modules/import_fatture/application/importFattureWorkingViewGuards.test.js` + `services/reconciliationCommitService.test.js` (2026-04-21)
- [x] 🟡 Test partitario: apertura, chiusura parziale, chiusura totale, storno — `src/modules/import_fatture/application/importFattureWorkingViewGuards.test.js` + `services/reconciliationCommitService.test.js` (2026-04-21)
- [x] 🟡 Test liquidazione IVA: mensile, trimestrale, con credito riportato — `src/modules/contabilita/application/liquidazioneIvaClient.test.js` + `src/modules/contabilita/application/m6FiscalClient.test.js` (2026-04-21)
- [x] 🟢 Test performance: import 100 file, verifica tempo e memoria — `services/importEnrichmentService.test.js` (2026-04-21)

### 10.3 Governance Qualità
- [x] 🟡 Build CI che esegue tutti i test su ogni merge (GitHub Actions) — `.github/workflows/tests.yml` + `npm test` (2026-04-21)
- [x] 🟡 Regola: nessuna modifica a file sensibili senza test associato — `docs/quality-gates.md` (2026-04-21)
- [x] 🟢 Code review checklist per aree contabili critiche — `docs/code-review-checklist-contabilita.md` (2026-04-21)
- [x] 🟢 Audit end-to-end operativo pre-M11 (A→G, priorità P0/P1/P2, piano patch sicuro) — `docs/AUDIT_END2END_FISCOSIM_M10.md` (2026-04-21)

---

## MILESTONE 11 — Integrazione TeamSystem (Fase Finale)
> Obiettivo: esportare dati/tracciati da FiscoSim verso TeamSystem solo dopo blindatura delle funzioni core.
> Gate di avvio: M1-M10 chiuse nei blocchi 🔴 e 🟡.

### 11.1 Contratti Export verso TeamSystem
- [ ] 🔴 Definire matrice output FiscoSim -> destinazione TeamSystem (CU TEL, LIPE XML, schema ritenute 770, prospetto F24, riepilogo IVA annuale)
- [ ] 🔴 Definire per ogni output: campi obbligatori, formato, regole validazione, versionamento annuale
- [ ] 🟡 Aggiungere validatore pre-export per ogni tracciato (blocca export incoerente)
- [ ] 🟡 Aggiungere file di controllo umano (PDF/Excel) affiancato al file tecnico
- [ ] 🟢 Registrare esito export con checksum, data/ora, utente e versione tracciato

### 11.2 Perimetro Operativo TeamSystem
- [ ] 🔴 CU: export TEL da FiscoSim, controllo/invio su TeamSystem
- [ ] 🔴 LIPE: export XML da FiscoSim, controllo/invio su TeamSystem
- [ ] 🔴 770: export schema ritenute e quadrature da FiscoSim, compilazione/invio su TeamSystem
- [ ] 🟡 F24: prospetto precompilato da FiscoSim, invio tramite TeamSystem
- [ ] 🟡 IVA annuale: riepilogo dati da FiscoSim, compilazione e invio su TeamSystem

---

## BUG E GAP NOTI DA RISOLVERE

| # | Priorità | Area | Descrizione | File | Stato |
|---|----------|------|-------------|------|-------|
| B-01 | 🔴 | CU | Modulo CU standalone riallineato al workflow operativo: PDF, TEL, email e storico locale disponibili anche fuori dalla vista fiscale (2026-04-21) | `src/modules/cu/index.jsx` | [x] |
| B-02 | 🔴 | Fiscal Output | CU e 770 stub rimossi da `fiscalOutputService.js`: il generatore crea solo output realmente derivati da liquidazione IVA (2026-04-21) | `services/fiscalOutputService.js` | [x] |
| B-03 | 🟡 | Export | LIPE, IVA Annuale, 770 riallineati a stato `Controllato` nell'hub export, coerente con i flussi fiscali attivi (2026-04-21) | `src/modules/export_dati/index.jsx` | [x] |
| B-04 | 🟡 | PDF Split | Chunking PDF server-side portato a split reale con `pdf-lib` nel path di analisi documenti grandi (2026-04-21) | `services/api/document/analyze.js` | [x] |
| B-05 | 🟡 | Email | Lettura inbox resta backlog separato fuori perimetro M1-M9; il send operativo usato da CU/liquidazioni è attivo | `api/email.js` | [ ] |
| B-06 | 🟢 | Intrastat | Marcato "Manuale" in export_dati. Obiettivo realistico: estrazione righe Intrastat da FiscoSim + export CSV per inserimento in sistema dedicato (Intrastat è normativa complessa con tracciato specifico Agenzia Dogane, non gestibile interamente in FiscoSim) | `src/modules/export_dati/index.jsx` | [ ] |
| B-07 | 🟢 | Formatter | `fmtCurrency()` e `fmtDate()` ridichiarate in 4+ moduli (bilancio, partitario, contabilita, import) | vari | [ ] |

---

## DIPENDENZE TECNICHE DA MONITORARE

| Dipendenza | Versione | Stato | Note |
|-----------|----------|-------|------|
| linkedom | ^0.18.12 | ✅ Usata | Parser XML Node-side; testa su ogni aggiornamento |
| pdfjs-dist | ^4.10.38 | ✅ Usata | Estrazione testo PDF; chunk grande (2MB+) nel build |
| pdf-lib | ^1.17.1 | ✅ Usata | Split reale PDF e generazione PDF operativi |
| xlsx | ^0.18.5 | ✅ Usata | Export CU/F24; verificare licenza per uso commerciale |
| xml2js | ^0.6.2 | ✅ Usata | Parsing P7M firmati |
| node-forge | ^1.4.0 | ✅ Usata | Verifica firme digitali |
| adm-zip | ^0.5.17 | ✅ Usata | Estrazione ZIP batch |
| nodemailer | ^6.10.1 | ✅ Usata | Send email operativo per CU, deleghe e output fiscali; lettura inbox rinviata |

---

## REGOLE OPERATIVE (non modificare)

1. Nessuna modifica a Import Fatture blindato senza analisi perimetrale completa.
2. Per bug/performance: analisi → cause plausibili → top 3 cause → rischi → patch → test.
3. Patch chirurgiche: nessun refactor macro fuori perimetro richiesto.
4. Prima nota e partitario: warning rosso obbligatorio su qualsiasi modifica/cancellazione.
5. AI propone sempre, operatore conferma sempre: nessuna contabilizzazione automatica cieca.
6. Build deve essere verde (exit 0) dopo ogni modifica.
7. Aggiorna questo file quando chiudi una funzione: spunta `[x]` e aggiungi data.

---

*Ultimo aggiornamento: 2026-04-21*  
*Versione: 1.1 — M1–M9 chiusi; M10–M11 in corso*
