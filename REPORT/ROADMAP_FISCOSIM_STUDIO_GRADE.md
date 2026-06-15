# ROADMAP FISCOSIM STUDIO GRADE

## 0. Audit critico della roadmap attuale

### Cosa e gia corretto
- La direzione architetturale e giusta: i 4 moduli core devono condividere lo stesso linguaggio e lo stesso contratto canonico.
- E giusto che Inserimento Manuale sia il contratto di scrittura canonico e che Consultazione sia read-only.
- E giusto che Import Contabilita e Riconciliazione Bancaria generino bozze/proposte da ricondurre al manuale, non linguaggi separati.
- E giusto che il report distingua tra quello che il prodotto deve fare e quello che deve restare fuori perimetro.

### Cosa e ancora generico
- IVA speciale e spesso descritta per concetti, non per caso d uso, dati, registri, impatto su liquidazione e partitario.
- Ritenute, percipienti, CU, 770 e F24 non sono ancora legati con sufficiente precisione al ciclo operativo parcella -> pagamento -> versamento -> certificazione.
- Cespiti, ammortamenti, ratei, risconti e assestamenti sono citati, ma non ancora scomposti in eventi, scritture, stampe e controlli.
- Le stampe sono indicate, ma manca ancora il confine netto tra provvisorio, definitivo e bloccato.
- La roadmap per fasi esiste, ma alcune fasi sono ancora troppo aggregate e rischiano di diventare "motore unico" indistinto.

### Cosa e fiscalmente rischioso
- Trattare split payment, IVA per cassa, reverse charge e autofatture come varianti leggere del motore IVA.
- Dare per completo il partitario o le ritenute senza imporre test di coerenza tra soggetto, partita, scadenza e adempimento.
- Lasciare ambiguita su modifiche, annulli, storni e cancellazioni su scritture contabilizzate o gia stampate.
- Dare spazio a fallback legacy che interpretano scritture fuori dal payload canonico.

### Cosa e architettonicamente rischioso
- Fare logica contabile o fiscale nel JSX.
- Permettere che ogni modulo inventi il proprio linguaggio per causali, stati, partitario, IVA o audit.
- Continuare a usare legacy come base di nuove logiche invece che come solo ponte temporaneo o area da migrare.
- Mescolare nella stessa fase elementi molto diversi, ad esempio split payment, reverse charge, IVA per cassa e ritenute.

### Cosa manca per arrivare a gestionale studio-grade
- Un contratto dati canonico davvero unico e testato.
- Regole di stato e blocco periodo condivise.
- Una matrice italiana dei casi fiscali con effetti su registri, liquidazioni, partitario, bilancio, scadenze e adempimenti.
- Una definizione forte di provvisorio/definitivo/bloccato per stampe e chiusure.
- Un piano di rimozione o isolamento del legacy con test anti regressione.

### Cosa non deve essere implementato prima del tempo
- Nessun invio diretto ad Agenzia Entrate o SDI.
- Nessuna conservazione sostitutiva.
- Nessuna riscrittura larga dei moduli esistenti senza motivazione funzionale.
- Nessun motore IVA "generico" prima di avere i casi specifici separati.
- Nessuna chiusura di fase senza test fiscali reali.

### Priorita assolute
1. Contratto canonico di Inserimento Manuale.
2. Stati condivisi e audit append only.
3. Blocchi periodo e riapertura autorizzata.
4. Split payment, IVA per cassa, reverse charge, ritenute e partitario con casi concreti.
5. Stampe e bilancio solo dopo il linguaggio dati comune.
6. Legacy solo come area da migrare o dismettere.

## 1. Executive Summary

### Obiettivo reale di FiscoSim
FiscoSim deve diventare il gestionale interno avanzato di uno studio commercialisti italiano: non SaaS vendibile, non piattaforma di invio telematico diretto, non sostituto totale dei software dichiarativi finali. Deve produrre dati, controlli, stampe, prospetti ed export affidabili per ridurre al minimo il reinserimento manuale in sistemi esterni.

### Cosa deve diventare
- Un motore contabile/fiscale unificato.
- Un sistema auditabile e controllato su prima nota, partitario, IVA, ritenute, bilancio, chiusure e scadenze.
- Un insieme di moduli che parlano la stessa lingua e condividono lo stesso payload canonico.
- Un software interno studio-grade, non un insieme di view scollegate.

### Cosa non deve diventare
- Non deve diventare una UI che contiene logica fiscale pesante.
- Non deve diventare un prodotto che usa legacy come base canonica.
- Non deve diventare un sistema con linguaggi diversi per lo stesso concetto contabile.
- Non deve diventare un SaaS o un sostituto completo dei dichiarativi finali.

### Livello attuale stimato
Il progetto e gia oltre una fase prototipale: i moduli core esistono, la direzione architetturale e corretta e ci sono gia molti guardrail. Tuttavia il livello attuale e **intermedio-avanzato, non ancora studio-grade pienamente coerente**. Il principale gap non e la presenza dei moduli, ma l'unificazione operativa e fiscale dei casi complessi.

### Principali rischi
- Legacy ancora presente come scorciatoia o come interpretazione alternativa.
- Duplicazione di regole tra manuale, import e riconciliazione.
- Split tra vista e dominio.
- Stato scrittura non abbastanza rigido.
- Stampe definitive e periodi chiusi non ancora blindati abbastanza.

## 2. Architettura univoca dei 4 moduli core

### A. Inserimento Manuale / Registrazione Manuale
| Voce | Contenuto |
|---|---|
| Ruolo | Contratto canonico unico per creare, modificare, annullare, stornare, rettificare e salvare scritture. |
| Puo fare | Comporre testata, righe contabili, righe IVA, partitario, ritenute, allegati, audit, preview e commit canonico. |
| Non puo fare | Non puo contenere logica fiscale pesante nel JSX; non puo usare fallback legacy; non puo salvare con scorciatoie non tracciate. |
| Input | Documento sorgente, causale contabile, causale IVA, soggetto, importi, conti, scadenze, regime, periodo. |
| Output | Draft canonico, scrittura contabilizzata, righe IVA/partitario/ritenute, audit event, esito validazione. |
| Dati letti | Piano conti, causali, causali IVA, anagrafiche, periodi, registri IVA, regole split/IVA per cassa/ritenute. |
| Dati scritti | Prima nota, righe, partitario, righe IVA, scadenze, audit, allegati collegati, stato scrittura. |
| Servizi comuni usati | canonical payload, registrazioneOperations, validate*, primaNotaService, partitarioSync, ivaRegistriSync, liquidazioneIvaService. |
| Dipendenze | View manuale, builder di draft, validator, policy causali, repository contabilita. |
| Rischi regressione | Scritture non bilanciate, soggetto perso in testata, periodo chiuso aggirato, IVA/partitario incoerenti. |
| Test obbligatori | Payload canonico, quadratura dare/avere, validazione soggetto, IVA, partitario, ritenute, audit, blocco periodo. |

### B. Consultazione Prima Nota
| Voce | Contenuto |
|---|---|
| Ruolo | Modulo read-only per ricerca, filtro, drill-down, preview, export e apertura della registrazione canonica. |
| Puo fare | Leggere prima nota, filtrare, ordinare, esportare, aprire la scrittura nel modulo manuale. |
| Non puo fare | Non puo eseguire write diretto fragile; non puo modificare la scrittura dal dettaglio consultazione. |
| Input | Filtri, periodo, testo libero, conto, soggetto, stato, documento, societa attiva. |
| Output | Liste consultazione, dettaglio scrittura, export, link al draft canonico. |
| Dati letti | Prima nota, mastrini, IVA, partitario, audit, periodi, registri. |
| Dati scritti | Nessun write contabile; solo preferenze UI e, al massimo, log consultazione. |
| Servizi comuni usati | consultazioneOperations, contabilidadeRepo, formatter, export helpers. |
| Dipendenze | View consultazione, query builder, summary builder, export builder. |
| Rischi regressione | Drill-down errato, export non coerente, filtri troppo larghi o troppo stretti. |
| Test obbligatori | Read-only enforcement, filtri, export, drill-down, saldo progressivo, paginazione, ricerca. |

### C. Import Contabilita
| Voce | Contenuto |
|---|---|
| Ruolo | Generatore di bozze canoniche compatibili con Inserimento Manuale. |
| Puo fare | Parsing, normalizzazione, matching anagrafiche, suggerimento causali, precompilazione draft, audit import. |
| Non puo fare | Non puo diventare un archivio canonico finale; non puo usare linguaggio proprio; non puo salvare fuori contratto. |
| Input | XML, PDF, ZIP, P7M, OCR, metadati import, societa, piano conti, causali. |
| Output | Draft canonico, staging, warning, proposta contabilizzazione, audit import. |
| Dati letti | Staging legacy solo come transizione, anagrafiche, causali, registri, memoria import. |
| Dati scritti | Staging import, bozza canonica, audit, log parser, memorie matching. |
| Servizi comuni usati | import_contabilita, shared parsing, canonical payload, mapping condivisi. |
| Dipendenze | Parser, normalizer, builders, bridge legacy in migrazione. |
| Rischi regressione | Legacy mapping, perdita di soggetto/IVA, preview diversa dal commit, duplicazione regole. |
| Test obbligatori | Parser, normalizzazione, payload contract, equivalenza manuale/import, no legacy fields. |

### D. Riconciliazione Bancaria
| Voce | Contenuto |
|---|---|
| Ruolo | Generatore di proposte che, se confermate, diventano scritture canoniche identiche a quelle del manuale. |
| Puo fare | Import estratti conto, matching, correzioni, chiusura partite, proposta commit. |
| Non puo fare | Non puo inventare un proprio linguaggio contabile; non puo bypassare il contratto canonico. |
| Input | Estratti conto, movimenti normalizzati, partite aperte, soggetti, saldi, regole match, periodo. |
| Output | Proposte di match, decisioni, draft canonico, audit riconciliazione, scritture finali. |
| Dati letti | Prima nota, partitario, scadenze, soggetti, configurazione banca/cassa, storico match. |
| Dati scritti | Decisioni, audit, draft canonico, scritture finali, stato riconciliazione. |
| Servizi comuni usati | components/riconciliazione, canonical payload builders, audit helpers, partitario sync. |
| Dipendenze | View bancaria, parser movimenti, mapping movimenti, commit planner. |
| Rischi regressione | Matching errato, partite chiuse male, doppie registrazioni, scritture non canoniche. |
| Test obbligatori | Match automatico, match parziale, conferma, no duplicate, equivalenza col manuale, audit completo. |

## 3. Contratto dati canonico

### Contratto unico
| Oggetto | Campi obbligatori | Campi opzionali | Fonte del dato | Validazioni | Produttori | Consumatori | Impatto |
|---|---|---|---|---|---|---|---|
| Testata prima nota | societa_id, data_registrazione, causale_contabile, esercizio, stato | numero_protocollo, note, allegati, origine, operatore | Manuale, import, banca | periodo valido, societa coerente, causale valida, stato ammesso | Manuale, Import, Riconciliazione | Consultazione, IVA, partitario, bilancio, audit | determina registrazione e tracciamento |
| Righe prima nota | conto, dare, avere, descrizione, indice | centro_costo, commessa, note_riga | Operatore, template, matching | quadratura, conto esistente, importo > 0 | Manuale, Import, Riconciliazione | Bilancio, giornale, audit | impatta saldi e mastrini |
| Righe IVA | codice_registro_iva, aliquota, natura, imponibile, imposta, esigibilita | split_payment, reverse_charge, per_cassa, protocollo_iva | Causale IVA, documento, manuale | coerenza operazione/registro/regime | Manuale, Import, Riconciliazione | Registri IVA, liquidazioni, annuale | impatta IVA e stampe |
| Righe partitario | soggetto_id, partita_id, scadenza, importo, saldo_residuo | riferimento_documento, pagamento_parziale | Documento, manuale, banca | soggetto obbligatorio quando richiesto, saldo coerente | Manuale, Import, Riconciliazione | Partitario, scadenzario | impatta incassi/pagamenti |
| Ritenute | percipiente_id, imponibile, ritenuta, aliquota, codice_tributo | cassa_previdenziale, base_contributiva | Parcella, manuale | coerenza percipiente, importi non negativi | Manuale, Import | CU, 770, F24, scadenze | impatta adempimenti professionisti |
| Documento sorgente | tipo_documento, numero, data, soggetto, totale | hash, file, protocollo, origine_staging | XML/PDF/OCR/manuale | numero/data/soggetto dove richiesti, duplicati bloccati | Import, Manuale, Riconciliazione | Draft, audit, preview | collega documento e scrittura |
| Soggetto | id, tipo, denominazione, CF/PIVA | indirizzo, regime, split_flag, ritenuta_flag | Anagrafiche, import | coerenza CF/PIVA, ruolo corretto, no duplicati | Manuale, Import | Partitario, IVA, ritenute, scadenze | determina trattamento fiscale |
| Causale contabile | codice, descrizione, comportamento, famiglia | template, flags, versione | Configurazione, migrazione | compatibilita con stato, regime, soggetto | Admin/Owner | Tutti i moduli core | governa flusso e obblighi |
| Causale IVA | codice, registro, natura, regime | esigibilita, split, reverse, anno_IVA | Configurazione, import | registro coerente, natura coerente, regime valido | Admin/Owner, Import | IVA, liquidazioni, registri | determina tracciamento fiscale |
| Registri IVA | codice_registro, tipo, anno, numerazione | sezionale, riepilogo, note | Causale IVA, azienda | numerazione e periodo coerenti | Manuale, Import | Registri, liquidazioni, stampe | controlla protocolli e stampa |
| Scadenze | soggetto_id, data_scadenza, tipo, importo | stato, link_scrittura, priorita | Partitario, ritenute, F24, ratei | data coerente, importo positivo | Manuale, Import, Banca | Agenda, F24, partitario | genera task e controlli |
| Audit | id evento, entita, before, after, actor, reason, source | correlation_id, ip, user_agent | Tutti i commit | append-only, non mutabile, societa obbligatoria | Tutti i write path | Consultazione, compliance, debug | traccia ogni azione critica |
| Stato scrittura | **Stati canonici attivi (FASE 3)**: `simulata`, `confermata`, `stornata`, `storno`. **Stati futuri / workflow avanzati (non ancora operativi)**: bozza (solo fallback tecnico legacy), annullata (FASE 7), contabilizzata, rettificata, chiusa, esportata (da implementare nelle rispettive fasi) | locked_period, reopened_by_admin | Workflow canonico | transizioni consentite, blocco periodo, ruoli | Manuale, Import, Admin | Tutto il sistema | comanda l'ammissibilita delle azioni |

## 4. Stati PN canonici attivi e workflow futuri

> **Nota di allineamento — 2026-05-30**: Gli unici stati PN operativi e canonici nel codice corrente (FASE 3 chiusa) sono `simulata`, `confermata`, `stornata`, `storno`. Tutti gli altri concetti elencati di seguito sono **workflow o stati futuri**, non ancora operativi come stati PN canonici nel codice attuale. La tabella seguente descrive la visione completa studio-grade per le fasi future, **non lo stato attuale del sistema**.

### 4a. Stati PN canonici attivi — FASE 3 (operativi oggi)

| Stato | Significato operativo | Chi lo imposta | Azioni consentite | Azioni vietate |
|---|---|---|---|---|
| `simulata` | Scrittura provvisoria/temporanea, non contabile definitiva | Operatore (scelta esplicita in salvataggio) | consultazione (con filtro dedicato), eliminazione con conferma | inclusa nei totali/saldi ordinari, modifica diretta senza workflow |
| `confermata` | Scrittura contabile valida e definitiva | Operatore (salvataggio normale) | consultazione, modifica controllata (via IM), storno contabile (via IM) | modifica diretta senza guards, cancellazione fisica |
| `stornata` | Scrittura confermata neutralizzata da una contro-scrittura speculare | Sistema (via RPC storno) | consultazione (con filtro Stornate), correlazione con storno collegato | modifica retroattiva, nuovo storno |
| `storno` | La contro-scrittura speculare generata dall'operazione di storno | Sistema (via RPC storno) | consultazione (con filtro Stornate), correlazione con originaria stornata | modifica retroattiva, nuovo storno |

### 4b. Workflow futuri / concetti operativi non ancora stati PN canonici

> I seguenti concetti sono previsti nelle fasi successive della roadmap studio-grade. **Non devono essere usati come stati PN canonici nel codice attuale**. Ogni concetto diventerà operativo solo quando la relativa fase sarà completata e testata.

| Concetto futuro | Fase roadmap | Significato previsto | Note |
|---|---|---|---|
| `bozza` | (legacy / solo fallback tecnico) | Dati in composizione non ancora confermati | Ammessa solo come fallback tecnico nel mapper per compatibilità. Non esposta nella UI come stato selezionabile. |
| `da_verificare` | FASE 5 | Pronta ma in attesa di approvazione operatore | Da implementare con workflow di approvazione causali/impostazioni. |
| `annullata` | FASE 7 | Scrittura annullata con tracciamento audit | Prevista nelle RPC ma non esposta nella UI corrente. Richiede workflow autorizzato. |
| `contabilizzata` | FASE 7 | Scrittura persistita con effetti completi su IVA/partitario | Stadio avanzato post-conferma per fasi con registri IVA attivi. |
| `rettificata` | FASE 7/20 | Correzione tracciata con nuova scrittura correttiva collegata | Richiede storico before/after e link alla scrittura originaria. |
| `chiusa` | FASE 20/21 | Periodo o esercizio chiuso; sola lettura | Blocca tutte le scritture non autorizzate; riapertura solo Admin/Owner. |
| `esportata` | FASE 23 | Output inviato a file o sistema esterno con checksum | Usata per consegne e controlli verso software esterni. |

## 5. Split payment

### Cosa serve e perche
Split payment deve gestire il caso in cui il cliente e soggetto a split e l'IVA esposta in fattura non viene trattata come debito IVA ordinario in liquidazione. Serve per evitare che il ricavo e la partita cliente vengano confusi con il debito IVA ordinario.

### Caso principale
- Fattura attiva verso cliente soggetto a split payment.
- Flag split payment su anagrafica cliente o regola equivalente sul conto/cliente.
- Ricavo registrato normalmente.
- IVA esposta in modo visibile ma separata dal debito IVA ordinario.
- IVA non versata come debito ordinario in liquidazione.
- Evidenza nei registri IVA.
- Effetto corretto su partitario e scadenzario.

### Dati usa e produce
- Usa: flag split cliente, causale contabile, causale IVA, aliquota, imponibile, totale, documento sorgente, registro IVA.
- Produce: righe contabili ricavo/cliente, riga o righe IVA split, audit di applicazione split, evidenza su registro e liquidazione.

### Regole
- La causale contabile deve dichiarare il comportamento split o richiamare una policy che lo rende obbligatorio.
- La causale IVA deve essere coerente con il registro e con il trattamento split.
- La liquidazione deve mostrare l'IVA split separatamente dal debito ordinario, non fonderla in modo ambiguo.
- Se il cliente non ha flag coerente, il sistema deve bloccare o mostrare warning forte, non inventare la regola.

### Blocchi
- Cliente anagraficamente non coerente con split.
- Causale IVA incompatibile con split.
- Mancanza del trattamento split quando il cliente lo richiede.
- Registro IVA incoerente o non specificato.

### Warning
- Cliente coerente ma causale non allineata.
- IVA presente ma trattamento split non dichiarato chiaramente.
- Partitario configurato in modo ambiguo tra imponibile e IVA split.

### Effetto su partitario e scadenziario
- Il partitario puo considerare solo l'imponibile come partita cliente, oppure la partita puo includere una separazione IVA split secondo impostazione societaria.
- Lo scadenzario deve seguire il modello scelto, ma senza produrre una partita che faccia sembrare l'IVA split un debito ordinario da incassare.

### Impostazioni servono
- Flag split su cliente.
- Regola di trattamento partita split: imponibile solo oppure imponibile+separazione interna.
- Causali IVA consentite per split.

### Test minimo
- Fattura attiva split con cliente coerente.
- Fattura attiva split con cliente non coerente bloccata.
- Liquidazione che separa split dal debito ordinario.
- Registro IVA con evidenza split.

### Fase
- FASE 13.

### Vietato
- Trattare split payment come semplice IVA ordinaria.
- Nascondere lo split in logiche di UI.
- Fare fallback automatici non dichiarati.

### Rischi regressione
- IVA split confusa con debito IVA normale.
- Partitario non allineato al trattamento scelto.
- Stampa registro senza evidenza split.

## 6. IVA per cassa

### Cosa serve e perche
IVA per cassa non puo essere gestita solo dalla fattura. Deve essere governata dal ciclo documento -> partita -> incasso/pagamento. Serve per sospendere l'esigibilita e rilasciarla al cash event.

### Flussi da coprire
- Fattura attiva IVA per cassa.
- Fattura passiva IVA per cassa.
- Incasso totale.
- Pagamento totale.
- Incasso parziale.
- Pagamento parziale.
- Evento di esigibilita/detraibilita.

### Dati usa e produce
- Usa: regime IVA per cassa, documento sorgente, partita, data incasso/pagamento, residuo, soggetto, registro.
- Produce: IVA sospesa, rilascio IVA al cash event, aggiornamento della partita, effetto su liquidazione, audit evento.

### Regole
- La fattura crea la base documentale, ma non chiude l'effetto IVA se il regime e per cassa.
- L'incasso/pagamento, totale o parziale, deve rilasciare l'IVA nella misura corretta.
- Il residuo deve restare coerente e non deve generare duplicazioni.
- Il documento e la partita devono essere collegati in modo forte.

### Blocchi
- Documento senza regime coerente.
- Cash event senza partita collegata.
- Importo di rilascio IVA non coerente con residuo.
- Tentativo di liquidare IVA sospesa come IVA ordinaria.

### Warning
- Evento parziale con residuo non lineare.
- Cash event oltre soglia temporale prevista.
- Documento e partita collegati ma non esplicitamente marcati come IVA per cassa.

### Effetto su registri e liquidazione
- Registro IVA deve mostrare l'esigibilita differita.
- La liquidazione periodica deve includere solo l'IVA rilasciata al cash event.
- La stampa registri deve rendere evidente il documento sospeso e il successivo rilascio.

### Impostazioni servono
- Regime IVA per cassa su societa o anagrafica.
- Regole di rilascio parziale.
- Causali IVA ammesse.

### Test minimo
- Fattura attiva per cassa con incasso totale.
- Fattura passiva per cassa con pagamento totale.
- Incasso parziale con residuo corretto.
- Pagamento parziale con rilascio proporzionale.

### Fase
- FASE 14.

### Vietato
- Gestire IVA per cassa solo nel documento senza legarla alla partita.
- Fare liquidazioni "normali" su registrazioni sospese.

### Rischi regressione
- Doppio rilascio IVA.
- Residuo partita incoerente.
- Stampa con esigibilita errata.

## 7. Reverse charge, acquisti UE/extra UE e autofatture estere

> [!WARNING]
> **SEZIONE RICALIBRATA / PERIMETRO SEMPLIFICATO (Roadmap to 100)**
> Il perimetro di gestione del reverse charge e delle operazioni estere è stato significativamente ridotto per evitare complessità eccessive e hardcoding delle logiche nel codice. Le nuove direttive stabiliscono che:
> 1. La logica deve derivare interamente dalle configurazioni delle causali contabili/IVA e dalle policy, senza codifica hardcoded. Si utilizzeranno causali dedicate (es. A17 per servizi esteri, FF5 per beni esteri).
> 2. Il partitario registrerà esclusivamente l'imponibile dell'operazione.
> 3. L'IVA sarà neutrale e rilevata tramite doppia registrazione simultanea sul Registro Acquisti e sul Registro Vendite.
> 4. Le note di credito estere sono considerate casi rari e verranno gestite in modo semplice tramite fattura/autofattura a segni opposti o causali dedicate, senza investire tempo in implementazioni edge complesse.

### Cosa serve e perche
Queste aree devono essere trattate come casi distinti, non come una sola regola "doppia rilevazione". Serve sapere dove nasce l'IVA, dove viene registrata, quali registri la vedono e come entra in liquidazione.

### Casi minimi da distinguere
- Reverse charge interno.
- Acquisti servizi UE.
- Acquisti beni UE.
- Acquisti servizi extra UE.
- Acquisti beni extra UE.
- Autofattura estera.
- Integrazione documento.
- Classificazione interna tipo TD17/TD18/TD19 come dato di classificazione, senza invio SDI diretto.

### Dati usa e produce
- Usa: soggetto estero o interno, paese, natura operazione, registro, causale IVA, documento, aliquota, regime, eventuale indetraibilita.
- Produce: IVA a credito, IVA a debito, doppia rilevazione, eventuale indetraibilita, audit del trattamento, impatto su liquidazione.

### Regole
- Il reverse charge interno deve produrre doppia rilevazione IVA con registri coerenti.
- Gli acquisti UE e extra UE devono essere distinti per natura e supporto documentale.
- Autofattura estera e integrazione documento non sono la stessa cosa.
- La liquidazione deve recepire la doppia rilevazione con coerenza di periodo e di registro.

### Blocchi
- Soggetto estero mancante o incoerente.
- Registro IVA non coerente con natura operazione.
- Mancanza di doppia rilevazione dove obbligatoria.
- Documento senza classificazione interna corretta.

### Warning
- Indetraibilita parziale da gestire ma non chiusa.
- Codifica interna TD17/18/19 presente ma mancano ancora dettagli documentali.
- Operazione estera con natura coerente ma regime societario non allineato.

### Effetto su bilancio e partitario
- Il bilancio vede il costo o il cespite secondo il caso.
- Il partitario deve avere il fornitore o il soggetto estero se previsto dal contratto interno.
- L'IVA a credito e a debito deve apparire nei registri e nella liquidazione con effetto correttamente separato.

### Impostazioni servono
- Regole causali per reverse charge e acquisti esteri.
- Registri IVA dedicati o sezionali.
- Flag soggetto estero e classificazione interna operazione.

### Test minimo
- Reverse charge interno con doppia rilevazione.
- Acquisto UE servizi.
- Acquisto UE beni.
- Acquisto extra UE servizi.
- Autofattura estera.
- Integrazione documento estero.

### Fase
- FASE 15.

### Vietato
- Trattare tutti i casi come un unico generico "motore IVA".
- Registrare IVA solo una volta quando il caso richiede doppia rilevazione.

### Rischi regressione
- Liquidazione non allineata ai registri.
- Doppia rilevazione incompleta.
- Classificazione interna non persistita.

## 8. Ritenute, percipienti, CU, 770 e F24 (Riorientato)

> [!WARNING]
> **PERIMETRO RIDEFINITO / DELEGA MINISTERIALE ESCLUSA (Roadmap to 100)**
> Si conferma che lo sviluppo di un compilatore o modulo completo per l'F24 ministeriale/dichiarativo autonomo è escluso dal perimetro di FiscoSim (le deleghe sono gestite esternamente su Entratel/TeamSystem dallo studio). FiscoSim mantiene esclusivamente:
> 1. Il calcolo delle righe finali di liquidazione dell'imposta IVA con compensazioni ed eventuale saldo F24.
> 2. Lo scadenzario F24 Entratel per monitorare i versamenti inviati dallo studio per conto dei clienti, con evidenziazione grafica (in verde) dello storico dei codici tributo ricorrenti usati nei mesi precedenti.
> 3. Il controllo ritenute d'acconto incrociato con i versamenti F24 importati per il codice tributo 1040.

### Cosa serve e perche
Serve un ciclo completo e coerente: parcella -> ritenuta -> pagamento -> F24 -> CU -> 770. Il percipiente deve essere identificato con forza, non con testo libero fragile. FiscoSim non sostituisce TeamSystem per la compilazione ed invio del modello F24 (gestito dallo studio su Entratel/TeamSystem). FiscoSim gestisce lo scadenzario F24 per i clienti con storico ricorrenze (evidenziato in verde) e il controllo ritenute da import F24.

### Flussi da coprire
- Parcella professionista con ritenuta, cassa previdenziale, rivalsa INPS, spese anticipate, bollo.
- Pagamento parcella (evento fiscale rilevante) che genera il debito ritenuta.
- Scadenzario F24 clienti studio e storico ricorrenze.
- Controllo ritenute da import F24 (confronto mese pagamento parcella, scadenza ritenuta, ritenute maturate, e importo versato da F24 importato con codice tributo 1040).

### Stati di Controllo Ritenute (da Import F24)
- **Verde**: Tutto versato regolarmente entro la scadenza.
- **Giallo**: Differenza zero, ma quota versata in ritardo rispetto alla scadenza (verifica ravvedimento).
- **Rosso**: Differenza residua ancora da versare o da ravvedere.

### Dati usa e produce
- Usa: percipiente, CF, imponibile, ritenuta, data pagamento, codice tributo 1040, scadenze, F24 importati.
- Produce: scadenza F24 in scadenzario clienti, storico ricorrenze, esito controllo ritenute (Verde/Giallo/Rosso), dati CU e 770.

### Regole
- Il versamento F24 reale viene importato (ZIP scaricati passano da Import Contabilità) e riconciliato con le ritenute del codice 1040.
- La liquidazione IVA mantiene comunque le righe di calcolo F24 finali nel prospetto.

### Blocchi
- Percipiente mancante o CF incoerente.
- Ritenute previste ma non calcolate.
- CU/770 non quadrati con prima nota.

### Warning
- Cassa previdenziale o rivalsa presenti ma non classificati correttamente.

### Impostazioni servono
- Conti ritenute, percipienti, causali professionisti, codici tributo F24.

### Test minimo
- Parcella con ritenuta.
- Pagamento parcella.
- Incrocio con F24 importato e assegnazione dello stato di controllo (Verde/Giallo/Rosso).
- CU e 770 generati dalla stessa base dati.

### Fase
- FASE 18.

### Vietato
- Usare dati manuali separati per CU e 770.
- Sviluppare un compilatore F24 completo e autonomo.

## 9. Regimi contabili gestiti

### Regimi minimi
| Regime | Cosa deve gestire FiscoSim | Cosa non deve gestire | Differenze operative |
|---|---|---|---|
| Contabilita ordinaria | prima nota completa, IVA ordinaria, registri, bilancio, partitario, chiusure, riaperture | invio diretto dichiarativi | massimo dettaglio di scritture e stampe |
| Contabilita semplificata imprese | registrazioni coerenti con regime, scadenze, stampa utile, gestione IVA dove dovuta | trattare come ordinaria senza differenze | meno dettaglio di alcuni libri, ma controlli fiscali restano |
| Professionisti | parcelle, ritenute, cassa previdenziale, CU, 770, F24, partitario per percipiente | ignorare il ciclo ritenute/pagamento | forte legame con pagamento e certificazioni |
| Forfettari/minimi se previsti come anagrafiche o documenti | anagrafica e documenti senza IVA ordinaria; gestione coerente di scadenze e registri interni | forzare IVA ordinaria dove non dovuta | attenzione a stampe e partitario, non al motore IVA ordinario |

### Regole trasversali
- Il regime decide quali blocchi sono obbligatori.
- Il regime deve influenzare validazioni, causali e registri.
- Non tutti i regimi devono avere gli stessi campi obbligatori, ma ogni regime deve avere i suoi controlli minimi.

### Test minimo
- Ordinaria con IVA e partitario completi.
- Semplificata con controlli e stampe coerenti.
- Professionisti con ritenute, CU e F24.
- Forfettario/minimi se previsto come anagrafica senza IVA ordinaria.

### Fase
- FASE 5, FASE 16.

## 10. Stampe, registri e output definitivi

### Output obbligatori
- Registro IVA acquisti.
- Registro IVA vendite.
- Registro corrispettivi.
- Liquidazioni periodiche.
- Prospetto IVA annuale.
- Libro giornale provvisorio.
- Libro giornale definitivo.
- Mastrini.
- Bilancio di verifica.
- Situazione contabile provvisoria.
- Situazione definitiva.
- Partitario clienti/fornitori.
- Registro ritenute.
- Registro cespiti.
- Libro inventari o prospetto interno se previsto.
- Export CSV, Excel, PDF.

### Regole di stampa
- Ogni stampa deve indicare periodo, data stampa, versione o checksum, societa e stato dei dati stampati.
- Le stampe provvisorie non bloccano la modifica, ma devono essere chiaramente marcate come non definitive.
- Le stampe definitive devono bloccare o richiedere workflow speciale per le modifiche successive.
- La ristampa deve essere tracciata.

### Dati usa e produce
- Usa: scritture contabilizzate, stati, periodo, registri, audit.
- Produce: PDF, CSV, Excel, tracciato di output, checksum, audit stampa.

### Blocchi
- Stampa definitiva su dati non quadrati.
- Stampa su periodo chiuso senza autorizzazione.
- Reuse di dati non canonici.

### Warning
- Ristampa di un documento gia consolidato.
- Stampa con dati parziali o provvisori.

### Impostazioni servono
- Formato output.
- Numerazione pagine.
- Intestazioni societa.
- Stato stampa definitivo o provvisorio.

### Test minimo
- Registro IVA acquisti e vendite.
- Libro giornale provvisorio e definitivo.
- Mastrini e bilancio di verifica.
- Partitario e registro ritenute.
- Export PDF/CSV/Excel con checksum.

### Fase
- FASE 11, FASE 12, FASE 23.

## 11. Bilancio, situazioni e chiusura esercizio

> [!WARNING]
> **REVISIONATO CON VALENZA DEFINITIVA (Roadmap to 100)**
> Per "periodo chiuso" si intende formalmente il periodo per cui è stata eseguita la stampa definitiva dei registri. La riapertura di un periodo chiuso per registrazioni o rettifiche retroattive è preclusa per l'operatore ordinario e accessibile eccezionalmente solo a figure Admin/Owner tramite un workflow protetto (motivazione obbligatoria, log completo, backup preventivo con ripristino, riconsolidamento dei periodi a cascata e ristampa definitiva obbligatoria). Modifiche su liquidazioni consolidate provvisorie mostrano alert di verifica per eventuale LIPE inviata.

### Cosa deve coprire
- Bilancio di verifica.
- Situazione contabile provvisoria.
- Situazione definitiva.
- Bilancio civilistico.
- Bilancio riclassificato.
- Stato patrimoniale.
- Conto economico.
- Mastrini.
- Giornale.
- Scritture di assestamento.
- Ratei.
- Risconti.
- Ammortamenti.
- Chiusura costi/ricavi.
- Rilevazione utile/perdita.
- Riapertura conti patrimoniali.
- Apertura nuovo esercizio.
- Blocco periodo.
- Riapertura solo Admin/Owner.

### Regole
- Il bilancio deve leggere da scritture canoniche e non da viste scollegate.
- La chiusura esercizio deve produrre audit di chiusura e non lasciare margini di modifica silente.
- La riapertura deve essere eccezione autorizzata e tracciata.
- Le situazioni provvisorie devono essere chiaramente distinte da quelle definitive.

### Blocchi
- Scritture mancanti o incoerenti.
- Periodo chiuso senza riapertura autorizzata.
- Bilancio definitivo su dati non consolidati.

### Warning
- Saldi bilancio coerenti ma con anomalie minori.
- Situazione provvisoria usata come se fosse definitiva.

### Test minimo
- Bilancio di verifica.
- Situazione provvisoria.
- Situazione definitiva.
- Bilancio civilistico e riclassificato.
- Chiusura esercizio.
- Riapertura da Admin/Owner.

### Fase
- FASE 17, FASE 18, FASE 19, FASE 20, FASE 21.

## 12. Cespiti e ammortamenti (Semplificato)

> [!WARNING]
> **SEZIONE INTEGRATA / FLUSSO SEMPLIFICATO E OPERATIVO (Roadmap to 100)**
> Per evitare la complessità di un modulo cespiti di classe enterprise in questa fase, si adotta un approccio leggero e operativo basato su suggerimenti e promemoria dashboard ("Sì / No / Ricorda dopo") agganciati direttamente all'Import Contabilità e all'Inserimento Manuale, con aliquote suggerite a partire dallo storico.

### Cosa deve coprire
- Acquisto cespite da fattura / Import Contabilità.
- Inserimento Libro Cespiti attivato da alert guidato su prima nota: *“È stato registrato un cespite. Procedere con inserimento nel libro cespiti? [Sì] / [No] / [Ricorda dopo]”*.
- Gestione della notifica di promemoria in dashboard o tab Libro Cespiti se l'operatore seleziona *“Ricorda dopo”*.
- Suggerimento automatico di durata/aliquota ammortamento basato sullo storico generale.
- Stampa registro cespiti e raccordo quota di ammortamento annuale.

### Regole
- Il modulo deve rimanere leggero ed operativo, evitando logiche enterprise complesse (es. rivalutazioni, superammortamenti complessi) in questa prima fase.
- Integrazione nativa con Import Contabilità e Inserimento Manuale.

### Blocchi
- Categoria o cespite non compilato.
- Coefficiente mancante.

### Warning
- Quote ammortamento parziali o durate anomale rispetto sullo storico.

### Test minimo
- Registrazione cespite, alert di proposta inserimento Libro Cespiti, notifica "Ricorda dopo", e calcolo quota di ammortamento consigliata.

### Fase
- FASE 17.

### Vietato
- Modulo cespiti troppo enterprise o scollegato da prima nota/import.

## 13. Gestione modifiche, annulli, storni e cancellazioni (Pragmatico)

> [!WARNING]
> **SEZIONE ALLINEATA / APPROCCIO PRAGMATICO (Roadmap to 100)**
> In contrasto con approcci teorici iper-rigidi che vietano qualsiasi modifica diretta o cancellazione fisica imponendo storni sistematici per ogni minima correzione, FiscoSim adotta un modello pragmatico di sicurezza basato su alert graduati in base all'impatto (leggero per prima nota semplice, forte per fatture, doppia conferma per moduli IVA/ritenute/partitario). Le cancellazioni sono permesse ma guidate e protette da salvaguardie di backup/ripristino per prevenire regressioni, bloccando solo le operazioni realmente destabilizzanti per il bilancio o i periodi chiusi (stampa definitiva).

### Regola base
- Inserimento Manuale è il solo contratto canonico per creare, modificare, annullare, stornare, rettificare e salvare.
- La cancellazione è sempre guidata. Le modifiche sono protette da alert graduati per prevenire disallineamenti di saldi storici e proteggere l'integrità dei dati.

### Alert Graduati
- **Leggero**: per la modifica o la cancellazione di scritture contabili semplici (Dare/Avere senza IVA).
- **Forte**: per scritture associate a fatture o documenti IVA.
- **Conferma & Riconferma**: per operazioni che impattano direttamente liquidazioni IVA, ritenute d'acconto, partitari o altri moduli.
- **Blocco**: impedimento assoluto per operazioni che destabilizzano il sistema, compromettono i clienti dello studio o rompono le funzioni principali di bilancio.
- **Sicurezza**: predisposizione di un backup preventivo e possibilità di ripristino per cancellazioni accidentali o operazioni critiche.

### Azioni
| Azione | Quando ammessa | Chi puo farla | Cosa produce | Cosa vieta | Audit |
|---|---|---|---|---|---|
| Modifica | periodo aperto o workflow di riapertura | Operatore autorizzato | nuova versione o draft aggiornato | modifica silente | before/after obbligatorio |
| Annulla | scrittura da neutralizzare | Operatore autorizzato, Admin | annullo tracciato | perdita della storia | evento annullo obbligatorio |
| Storna | quando serve contro-scrittura | Sistema o Operatore autorizzato | scrittura opposta collegata | cancellazione silente | legame con originaria obbligatorio |
| Rettifica | correzione puntuale | Operatore autorizzato | nuova scrittura correttiva | riscrittura del passato | collegamento alla originaria |
| Cancellazione | guidata, previa conferma/backup | Operatore autorizzato | rimozione con tracciamento | cancellazione silente senza alert | audit tecnico obbligatorio |

### Blocchi
- Periodo chiuso (stampa definitiva registri).
- Scrittura gia stampata definitiva.
- Scrittura gia consumata da liquidazioni chiuse senza riapertura guidata.

### Fase
- FASE 7, FASE 22, FASE 26.

## 14. Impostazioni personalizzabili ma controllate

| Impostazione | Dove vive | Chi la modifica | Moduli che la usano | Validazioni | Fallback ammesso | Rischio se manca |
|---|---|---|---|---|---|---|
| Causali contabili | master data societa | Admin, Owner | tutti i moduli core | codice univoco, comportamento, stato | nessun fallback inventato | scritture incoerenti |
| Causali IVA | master data fiscale | Admin, Owner | manuale, import, IVA | registro, natura, regime, esigibilita | solo placeholder bloccante | IVA errata |
| Registri IVA | master data fiscale | Admin, Owner | IVA, stampe, liquidazioni | numerazione, anno, sezionale | no | protocolli errati |
| Sezionali | configurazione fiscale | Admin, Owner | registri, stampe | coerenza anno e sequenza | no | serializzazione confusa |
| Conti IVA | piano conti | Admin, Owner | manuale, import, liquidazioni | natura conto e classe | conto tecnico solo in migrazione | registri non quadrati |
| Conti IVA sospesa | piano conti | Admin, Owner | IVA per cassa | uso coerente col regime | no | liquidazione sbagliata |
| Conti split payment | piano conti | Admin, Owner | manuale, IVA, liquidazioni | flag split e registro corretto | no | split errato |
| Conti reverse/autofatture | piano conti | Admin, Owner | manuale, import, IVA | doppia registrazione coerente | no | reverse incompleto |
| Conti ritenute | piano conti | Admin, Owner | ritenute, F24, CU, 770 | conto per tipologia | no | adempimenti bloccati |
| Conti F24 | piano conti | Admin, Owner | F24, ritenute, tributi | conto banca e debiti distinti | no | uscite non riconciliate |
| Conti clienti/fornitori | piano conti | Admin, Owner, operatore autorizzato | manuale, consultazione, partitario | CF/PIVA, ruolo, partita | suggest temporanea non canonica | partitario rotto |
| Conti percipienti | registry percipiente | Admin, Owner | ritenute, CU, 770 | coerenza CF e tipo ritenuta | no | CU/F24 errati |
| Conti cespiti | piano conti | Admin, Owner | cespiti, ammortamenti | categoria cespite obbligatoria | no | bilancio distorto |
| Fondi ammortamento | piano conti | Admin, Owner | cespiti, bilancio | fondo collegato a categoria | no | ammortamenti falsati |
| Conti ratei/risconti | piano conti | Admin, Owner | assestamenti, bilancio | natura temporale corretta | no | competenza errata |
| Conti utile/perdita | piano conti | Admin, Owner | chiusura esercizio | conti di transito coerenti | no | chiusura scorretta |
| Conti apertura/chiusura | piano conti | Admin, Owner | chiusura/apertura esercizio | conti patrimoniali dedicati | no | periodi non governati |
| Template scritture | libreria template | Admin, Owner, operatore autorizzato | manuale, import, banca | template versionato e testato | template legacy solo in migrazione | duplicazione logica |
| Regole anagrafiche | anagrafiche | Admin, Owner | manuale, import, ritenute, split | flag e ruoli coerenti | no | trattamenti errati |
| Flag split payment cliente | anagrafica cliente | Admin, Owner | manuale, IVA, liquidazioni | coerenza cliente/causale | no | split non applicato |
| Flag IVA per cassa | societa/regime/causale | Admin, Owner | manuale, import, liquidazioni | regime attivo | solo warning se transitorio | IVA liquidata male |
| Flag ritenuta percipiente | anagrafica percipiente | Admin, Owner | manuale, ritenute, CU, 770 | CF e tipo ritenuta | no | adempimenti errati |
| Permessi Admin/Owner/Operatore | auth e authorization | sistema + admin | tutti i moduli | ruoli, scope societa, RLS | no | write non autorizzati |

## 15. Matrice fiscale-contabile corretta

| Caso | Regime | Causale contabile | Causale IVA | Registri IVA | Conti Dare/Avere | Effetto IVA | Effetto partitario | Effetto scadenziario | Effetto ritenute/CU/770 | Effetto bilancio | Controlli bloccanti | Warning | Test minimo | Fase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fattura passiva ordinaria | ordinaria | acquisto/fornitore | acquisti ordinari | acquisti | costo, IVA detraibile, debiti fornitore | credito IVA | apre partita fornitore | pagamento | no | costo + debito | soggetto, numero, data, quadratura | totale incoerente | commit e liquidazione | 4-11 |
| Fattura attiva ordinaria | ordinaria | vendita/cliente | vendite ordinarie | vendite | crediti cliente, ricavi, IVA | debito IVA | apre partita cliente | incasso | no | ricavo + credito | protocollo, soggetto, numero | imponibile anomalo | commit e consultazione | 4-11 |
| Nota credito passiva | ordinaria | storno acquisto | rettifica acquisti | acquisti | debito fornitore, costo, IVA | riduzione credito | riduce partita fornitore | nuova scadenza se serve | no | riduce costo | collegamento originaria | segno importo | storno corretto | 4-11 |
| Nota credito attiva | ordinaria | storno vendita | rettifica vendite | vendite | ricavi, IVA, cliente | riduzione debito | riduce partita cliente | eventuale scadenza | no | riduce ricavi | collegamento originaria | numero mancante se richiesto | storno e audit | 4-11 |
| Fattura multi aliquota | ordinaria | acquisto/vendita | piu causali coerenti | acquisti o vendite | piu IVA, costo/ricavo, crediti/debiti | impatto per aliquota | partita unica o multi riga | unica o per scadenze | no | per aliquota | somma subtotali e IVA | aliquote incoerenti | due aliquote | 4-11 |
| IVA indetraibile | ordinaria | acquisto costo | acquisto con quota indetraibile | acquisti | costo, IVA indetraibile, IVA detraibile | credito ridotto | partita fornitore | pagamento normale | no | costo aumenta | percentuale coerente | indetraibilita parziale | split imponibile | 4-11 |
| Natura non imponibile/esente/fuori campo | ordinaria/specifica | fattura speciale | natura coerente | acquisti o vendite | costo/ricavo, contropartita | nessuna o imposta zero | partita se soggetto presente | scadenza normale | no | imponibile senza IVA | natura obbligatoria | imponibile errato | natura + zero imposta | 4-11 |
| Split payment attivo | ordinaria | vendita cliente split | split | vendite | ricavo, credito cliente, IVA split | IVA non debito ordinario | partita cliente con regola scelta | incasso imponibile o separato | no | ricavo + credito | flag cliente coerente, causale coerente | split incompleto | split evidenziato | 13 |
| IVA per cassa attiva | per cassa | fattura attiva cassa | per cassa | vendite | ricavo, IVA sospesa, cliente | esigibilita differita | partita cliente aperta | incasso totale/parziale | no | ricavo + credito | regime attivo, cash event | residuo incoerente | incasso totale | 14 |
| IVA per cassa passiva | per cassa | fattura passiva cassa | per cassa | acquisti | costo, IVA sospesa, fornitore | detraibilita differita | partita fornitore aperta | pagamento totale/parziale | no | costo + debito | regime attivo, cash event | residuo incoerente | pagamento totale | 14 |
| Incasso IVA per cassa | per cassa | incasso cliente | cash release | vendite | banca, cliente, IVA rilascio | rilascio IVA | chiude/riduce partita | incasso | no | liquidita cresce | partita collegata | rilascio errato | cash event | 14 |
| Pagamento IVA per cassa | per cassa | pagamento fornitore | cash release | acquisti | banca, fornitore, IVA rilascio | rilascio IVA | chiude/riduce partita | pagamento | no | liquidita diminuisce | partita collegata | rilascio errato | cash event | 14 |
| Parcella professionista con ritenuta | professionisti | parcella | ordinaria o esente | acquisti + ritenute | costo, netto, ritenuta, eventuale cassa | IVA se prevista | partita percipiente | scadenza pagamento e ritenuta | si, base CU/770 | costo + debito ritenuta | percipiente obbligatorio | dati incompleti | parcella con ritenuta | 16 |
| Pagamento parcella | professionisti | pagamento parcella | n/a | n/a o cash | banca, debito fornitore, debito ritenuta | nessun effetto diretto o cash event | chiude partita | scadenza F24 ritenuta | si, alimenta scadenza | riduce debiti | coerenza pagamento + ritenuta | differenza importo | pagamento completo | 18 |
| Versamento ritenuta F24 | professionisti | F24 ritenuta | n/a | n/a | banca, debito ritenuta, F24 | nessuno | chiude debito ritenuta | scadenza 16 mese successivo | si, consuntivo | riduce debiti fiscali | tributo e periodo | importo errato | Controllo ritenuta da F24 importato | 18 |
| Reverse charge interno | ordinaria | acquisto soggetto | reverse charge | acquisti + vendite/integrazione | costo, IVA credito, IVA debito, fornitore | doppia rilevazione | partita fornitore | scadenza normale | no | costo + IVA speculare | doppia rilevazione obbligatoria | registro incoerente | doppia riga IVA | 15 |
| Acquisto UE beni | ordinaria | acquisto UE beni | integrazione UE | acquisti + vendite/integrazione | costo, IVA credito, IVA debito, fornitore estero | doppia rilevazione | partita fornitore estero | scadenza normale | no | costo + debito | soggetto estero, natura corretta | paese incoerente | acquisto UE beni | 15 |
| Acquisto UE servizi | ordinaria | acquisto UE servizi | integrazione UE | acquisti + vendite/integrazione | costo, IVA credito, IVA debito, fornitore estero | doppia rilevazione | partita fornitore estero | scadenza normale | no | costo + debito | soggetto estero, natura corretta | classificazione incerta | acquisto UE servizi | 15 |
| Acquisto extra UE beni | ordinaria | acquisto extra UE beni | autofattura/integrazione | acquisti + vendite/integrazione | costo, IVA credito, IVA debito | doppia rilevazione | eventuale partita estera | scadenza normale | no | costo + debito | natura estera corretta | documento mancante | acquisto extra UE beni | 15 |
| Acquisto extra UE servizi | ordinaria | acquisto extra UE servizi | autofattura/integrazione | acquisti + vendite/integrazione | costo, IVA credito, IVA debito | doppia rilevazione | eventuale partita estera | scadenza normale | no | costo + debito | natura estera corretta | classificazione incerta | acquisto extra UE servizi | 15 |
| Autofattura estera | ordinaria | autofattura | autofattura | registri dedicati | costo, IVA credito, IVA debito | doppia rilevazione | eventuale partita tecnica | scadenza interna | no | costo + debito | soggetto estero e classificazione | duplicazione documento | autofattura estera | 15 |
| Corrispettivi | ordinaria/specifica | corrispettivi | corrispettivi | corrispettivi | cassa, ricavi, IVA | debito IVA | partitario spesso no | eventuale cassa | no | ricavi e cassa | registro dedicato | protocollo assente | corrispettivi giornalieri | 11-12 |
| Incasso cliente | tutti | incasso | n/a o cash | n/a o vendite se cash | banca/cassa, cliente | eventuale cash release | chiude/riduce partita cliente | riduce scadenze | no | liquidita cresce | partita esistente | importo parziale | incasso con saldo | 10-14 |
| Pagamento fornitore | tutti | pagamento | n/a o cash | n/a o acquisti se cash | banca/cassa, fornitore | eventuale cash release | chiude/riduce partita fornitore | riduce scadenze | no | liquidita diminuisce | partita esistente | differenza cambio/spese | pagamento con saldo | 10-14 |
| Pagamento parziale | tutti | pagamento parziale | n/a | n/a | banca, conto contropartita | eventuale cash release | saldo residuo | scadenza residua | no | saldo residuo | residuo non negativo | rounding | partite residue | 10-14 |
| Incasso parziale | tutti | incasso parziale | n/a | n/a | banca, conto contropartita | eventuale cash release | saldo residuo | scadenza residua | no | saldo residuo | residuo non negativo | rounding | incasso parziale | 10-14 |
| Insoluto | tutti | insoluto | n/a | n/a | insoluti, banca, cliente/fornitore | nessuno o rettifica | riapre partita | nuova scadenza | no | debito/credito residuo | evento bancario coerente | doppio insoluto | insoluto con audit | 10-14 |
| Abbuono | tutti | abbuono | eventuale | n/a | conto abbuoni, cliente/fornitore | eventuale rettifica IVA | riduce partita | scadenza aggiornata | no | ricavo/costo rettificato | causale corretta | importo incoerente | abbuono | 10-14 |
| Giroconto | tutti | giroconto | n/a | n/a | conti interni | nessuno | no partita | no | no | riclassifica interna | conti non soggetto | conti errati | giroconto bilanciato | 11-12 |
| Banca/cassa | tutti | movimento finanziario | n/a | n/a | banca, cassa, contropartita | nessuno o cash event | partitario se controparte presente | eventuale | no | liquidita | movimento non spiegato | classificazione bassa | banca/cassa | 9-14 |
| Commissioni bancarie | tutti | costo bancario | eventuale | acquisti servizi | commissioni, IVA, banca | impatto se imponibile | eventuale fornitore banca | no | no | costo finanziario | causale banca | duplicato commissioni | commissioni | 9-14 |
| Mutui/finanziamenti | tutti | mutuo/finanziamento | n/a | n/a | banca, debiti finanziari, interessi | nessuno | scadenze rate | rate mensili | no | debito finanziario | piano ammortamento coerente | quota interesse | rata mutuo | 11-12 |
| Stipendi | tutti | costo personale | n/a | n/a | salari, debiti INPS, erario, banca | nessuno | partitario se previsto | scadenze contributi/fiscali | si, se rilevante | costo personale | cedolino/paghe coerenti | dati incompleti | scrittura paghe | 18 |
| F24 | tutti | pagamento tributo | n/a | n/a | banca, debiti tributari, F24 | nessuno | chiude debito | scadenza tributo | si | debiti fiscali ridotti | tributo e periodo | importo non valido | Visualizzazione storico ed Entratel | 24 |
| Ritenute | professionisti | accantonamento/versamento | n/a | n/a | debito ritenuta, banca, percipiente | nessuno | scadenza percipiente | 16 mese successivo | si | debito fiscale | percipiente e tributo | periodo incoerente | ritenuta | 16 |
| Cespite | ordinaria | acquisto cespite | eventuale | acquisti | cespite, IVA, debiti | effetto normale | eventuale partita fornitore | pagamento | no | incremento attivo | categoria obbligatoria | utile residua incoerente | cespite | 16 |
| Ammortamento | ordinaria | ammortamento | n/a | n/a | fondo ammortamento, costo ammortamento | nessuno | no | no | no | riduce utile | piano ammortamento coerente | quota anomala | ammortamento | 16 |
| Dismissione cespite | ordinaria | dismissione | eventuale | acquisti o vendite secondo caso | cespite, fondo, plus/minus | eventuale IVA se vendita | eventuale partita cliente | scadenza se vendita | no | plus/minus | costo storico e fondo coerenti | valore residuo | dismissione | 16 |
| Rateo | tutti | assestamento rateo | n/a | n/a | ratei attivi/passivi, costo/ricavo | nessuno | no | no | no | competenza corretta | data competenza | periodo errato | rateo | 18 |
| Risconto | tutti | assestamento risconto | n/a | n/a | risconti, costo/ricavo | nessuno | no | no | no | competenza corretta | competenza temporale | calcolo giorni | risconto | 18 |
| Assestamento | tutti | assestamento | n/a | n/a | conti competenza, assestamenti | nessuno | no | no | no | rettifica risultato | causale assestamento | doppio assestamento | assestamento | 18 |
| Chiusura conto economico | ordinaria | chiusura esercizio | n/a | n/a | ricavi/costi, utile/perdita | nessuno | no | no | no | chiusura CE | esercizio aperto/chiuso | utili non quadrati | chiusura | 19-21 |
| Riapertura conti | ordinaria | apertura esercizio | n/a | n/a | conti patrimoniali | nessuno | no | no | no | porta saldi iniziali | solo Admin/Owner | periodo chiuso | riapertura | 21 |
| Scrittura di rettifica | tutti | rettifica | dipende dal caso | dipende dal caso | conti originali e correttivi | eventuale | partite aggiornate | eventuale | dipende | rettifica saldi | collegamento originaria | correzione senza link | rettifica | 7-20 |
| Storno scrittura | tutti | storno | dipende | dipende | conti originari | eventuale | partitario coerente | eventuale | dipende | neutralizza effetto | riferimento originaria | storno duplicato | storno | 7-20 |
| Annulla scrittura | tutti | annullo | dipende | dipende | conti originari | eventuale | partitario coerente | eventuale | dipende | neutralizza effetto | permesso e periodo | annullo non autorizzato | annullo | 7-20 |

## 16. Roadmap rigida per fasi

> **Nota di avanzamento — aggiornamento 2026-05-30**
>
> **FASE 3 — CHIUSA** (sviluppo e staging):
> - Inserimento Manuale PN generale: ✅
> - Stati operativi canonici attivi: `simulata`, `confermata`, `stornata`, `storno` ✅
> - Modifica controllata via `primaNotaMutationService.js`: ✅
> - Storno contabile con contro-scrittura speculare: ✅
> - Consultazione con filtri Ordinarie/Stornate/Simulate e toggle persistenti: ✅
> - RPC guards/update/storno allineate allo schema reale: ✅
> - Test 51/51 verdi, build OK, commit `558d7a3`: ✅
> - ⚠️ RPC di produzione da applicare manualmente via Supabase Studio prima del deploy reale.
>
> **Blocco operativo intermedio prima delle fasi IVA avanzate**:
> Il prossimo blocco di lavoro è **"Consultazione Prima Nota — hardening read-only / stati / dettaglio / export base"**, corrispondente alla **FASE 6** di questa roadmap.
> - Obiettivo: blindare Consultazione come modulo sola lettura, corretta visualizzazione di tutti e quattro gli stati, miglioramento sidebar dettaglio, export base CSV/PDF righe filtrate.
> - **La Riconciliazione Bancaria (FASE 9) NON è il prossimo step**: deve attendere il completamento di FASE 6 (Consultazione hardening), FASE 7 (Modifica/Storno workflow canonico) e FASE 8 (Import bozze canoniche).
>
> **Regola architetturale confermata**:
> - Consultazione = modulo read-only; nessun write contabile diretto.
> - Ogni scrittura, modifica e storno transita da Inserimento Manuale o da `primaNotaMutationService.js`.
> - Nessun write contabile complesso ammesso direttamente da Consultazione.

| Fase | Obiettivo | Prerequisiti | Moduli coinvolti | Implementazioni richieste | Vietato | Test obbligatori | Acceptance criteria | Rischi | Checkpoint |
|---|---|---|---|---|---|---|---|---|---|
| FASE 0 - Audit reale codice e dipendenze legacy | mappare il sistema e isolare legacy | accesso repo e report | tutti | inventario dipendenze, rischio legacy, RLS/societa_id, payload canonici | usare legacy come base canonica | search legacy, contract scan, smoke test | mappa e backlog approvati | alto | audit approvato |
| FASE 1 - Contratto canonico PN semplice | fissare il payload base | FASE 0 | manuale, canonical | schema, builder, hash, validator base | scrivere fuori schema | contract test payload | payload congelato | alto | schema approvato |
| FASE 2 - Save atomico PN semplice e audit base | blindare il salvataggio del nucleo semplice | FASE 1 | manuale, service save, audit | atomic save, rollback, audit before/after | write senza audit | unit/integration save | PN semplice bilanciata salvata in modo atomico | alto | save base verde |
| FASE 3 - Inserimento Manuale completo per movimenti generali | coprire scritture generali | FASE 2 | manuale | righe, controlli, preview, storni, rettifiche | logica fiscale nel JSX | UI, contract, integration | movimento generale completo | alto | casi base verdi |
| FASE 4 - Inserimento Manuale documenti IVA ordinari FF/FC | estendere a documenti ordinari | FASE 3 | manuale, IVA | documenti FF/FC, causali IVA, registri | trattare FF/FC come generici | IVA contract, UI, integration | FF/FC ordinari canonici | alto | FF/FC stabili |
| FASE 5 - Causali contabili/IVA e impostazioni controllate | rendere controllabile il comportamento | FASE 3-4 | manuale, settings | causali, regole, registri, sezionali, flag | fallback non dichiarati | validation test, settings test | causali e settings governano il flusso | alto | configurazioni verdi |
| FASE 6 - Consultazione Prima Nota completa read-only | blindare il read-only | FASE 3-5 | consultazione | ricerca, drill-down, export, apertura manuale | write diretto | read-only tests | nessun write in consultazione | medio-alto | read-only confermato |
| FASE 7 - Modifica/annullo/storno da Consultazione tramite Manuale | garantire il workflow corretto | FASE 6 | consultazione, manuale | apertura scrittura canonica per modifica | modifica diretta in consultazione | workflow tests | ogni modifica passa dal manuale | medio-alto | workflow verificato |
| FASE 8 - Import Contabilita come generatore bozze canoniche | far nascere draft allineati | FASE 1-7 | import_contabilita, manuale | parser, normalizzatore, build draft, no legacy fields | usare documenti_import come canonico finale | parser, contract, parity tests | import produce draft canonico | alto | parity import/manuale |
| FASE 9 - Riconciliazione Bancaria come generatore scritture canoniche | match -> commit canonico | FASE 1-8 | banca, manuale, partitario | matching, proposta, conferma, audit | linguaggio bancario proprio | matching, duplicate, commit tests | conferma = scrittura identica al manuale | alto | equivalenza confermata |
| FASE 10 - Partitario evoluto e scadenze clienti/fornitori | controllo partite e residui | FASE 3-9 | partitario, banca | aging, parziali, insoluti, abbuoni | partitario separato dal manuale | partitario tests | residui e partite coerenti | medio-alto | partite quadrate |
| FASE 11 - Registri IVA base e protocolli/sezionali | consolidare i registri | FASE 4-10 | IVA, stampe | acquisti, vendite, corrispettivi, protocolli | registro inventato in UI | registry tests | registri coerenti e numerati | alto | registri base verdi |
| FASE 12 - Liquidazione IVA chiusura storico/export/stati | Completare adempimento IVA | FASE 11 | IVA, views, helper | Blocco periodi definitiva, popup provvisorie, fallback savedRecord, note operative | Riconsolidare periodi definitivi | liquidazione tests, export tests | periodi definitivi bloccati con alert | medio | LIPE UX verde (COMPLETATO ✅) |
| FASE 13 - Registri IVA e stampe definitive | Numerazione e blocco registri | FASE 12 | IVA, stampe | Progressivo di pagina, marca temporale, blocco contabile in prima nota | Modifiche silenti post-stampa | lock/print tests | stampa definitiva protegge il periodo | alto | print lock verde |
| FASE 14 - Import Contabilità audit + riallineamento al manuale | Verificare stato reale import | FASE 3 | import, manuale | Audit e riallineamento import per generare solo draft canonici | Usare legacy come base contabile | scan legacy, draft tests | import riallineato ad Inserimento Manuale | alto | audit import superato |
| FASE 15 - Import Contabilità operativo | Pipeline operativa FE | FASE 14 | import | Matching, suggerimento causali e precompilazione draft | Scritture fuori contratto canonico | integration, parity tests | import produce bozze canoniche | alto | import operativo verde |
| FASE 16 - Cespiti leggeri agganciati a Import/Manuale | Ammortamenti operativi | FASE 15 | cespiti | Inserimento cespiti guidato da alert, notifica dashboard, suggerimento rate dallo storico | Modulo cespiti troppo enterprise | cespiti tests, dashboard tests | prompt inserimento e notifiche operative | medio | cespiti verdi |
| FASE 17 - Partitario + pagamenti/incassi | Controllo partite e residui | FASE 3 | partitario | Aging, parziali, insoluti, abbuoni nel contratto canonico | Partitario separato | partitario tests | partite quadrate e allineate | medio-alto | partitario verde |
| FASE 18 - Ritenute/CU/770 + controllo F24 importati | Ciclo ritenute professionisti | FASE 17 | ritenute | Percipienti, scadenze, CU/770 e controllo ritenute da F24 tributo 1040 | Dati manuali slegati | ritenute/CU/770/F24 tests | quadratura versato F24 e ritenute (Verde/Giallo/Rosso) | alto | ritenute e F24 verdi |
| FASE 19 - Riconciliazione bancaria | Match transazioni estratti conto | FASE 17 | banca | Riconciliazione e generazione scritture canoniche identiche al manuale | Scritture non canoniche | bank match tests | match genera prima nota corretta | alto | riconciliazione verde |
| FASE 20 - Reverse/estero limato | Gestione flussi esteri ridotti | FASE 13 | manuale, IVA | Doppia annotazione acquisti/vendite, IVA neutrale, partitario all'imponibile | Hardcode logiche di reverse | reverse/UE/autofattura tests | causali UE/estere coerenti | alto | estero validato |
| FASE 21 - Note credito edge | Note credito estere | FASE 20 | manuale | Note credito a segno opposto o causali dedicate semplici | Investimenti edge eccessivi | note credito tests | storni note credito corretti | basso | note credito verdi |
| FASE 22 - Modifiche/annulli/storni pragmatici e sicuri | Modifica controllata delle scritture | FASE 7 | manuale | Alert graduati (leggeri/forti/doppia conferma) e backup/ripristino per cancellazioni | Cancellazioni silenti | storno/annullo tests | modifiche protette e tracciate | alto | storno sicuro |
| FASE 23 - Bilancio/mastrini/situazioni | Output contabili ordinari | FASE 19 | bilancio | Mastrini e bilancio di verifica a sezioni contrapposte | Stampa saldi sbilanciati | bilancio tests | bilanci e mastrini pronti per studio | alto | bilancio verde |
| FASE 24 - Scadenzario F24 clienti Entratel | Controllo visuale deleghe | FASE 18 | scadenze | Scadenzario F24 Entratel con storico ricorrenze evidenziato in verde | Modulo F24 ministeriale completo | schedule tests | visualizzazione F24 ricorrenti ed evidenziati | medio | scadenzario F24 verde |
| FASE 25 - Stampe/export/fascicolo cliente | Consegna fine periodo | FASE 23 | stampe | Generazione del PDF unico di fine periodo (fascicolo cliente) | PDF non conformi | export tests | fascicolo cliente generato correttamente | medio | fascicolo cliente verde |
| FASE 26 - Admin/impostazioni/regole | Riapertura periodi chiusi | FASE 13 | admin | Workflow riapertura con motivazione, log, backup preventivo e ristampa | Riaperture ordinarie senza log | lock/reopen tests | solo Owner/Admin riapre con log completo | molto alto | controlli admin verdi |
| FASE 27 - Audit finale + legacy cleanup | Pulizia e stabilizzazione | FASE 25 | tutti | Rimozione `DISUSO` e tabelle deprecate, test di regressione globale | Nuove regressioni | final regression tests | workspace pulito e 100% green | medio-alto | release checklist verde |

## 17. Test suite finale

### Categorie
- Test unitari.
- Test di contratto.
- Test integrazione.
- Test UI.
- Test fiscale/contabile.
- Test regressione.
- Test performance.

### Casi minimi da coprire
- PN semplice bilanciata.
- PN semplice non bilanciata bloccata.
- Fattura passiva ordinaria.
- Fattura attiva ordinaria.
- Nota credito.
- Split payment attivo.
- IVA per cassa con incasso totale.
- IVA per cassa con incasso parziale.
- Reverse charge interno.
- Acquisto UE.
- Acquisto extra UE.
- Autofattura estera.
- Parcella con ritenuta.
- Pagamento parcella.
- F24 ritenuta.
- Liquidazione IVA.
- Stampa registro IVA.
- Libro giornale definitivo.
- Chiusura periodo.
- Blocco modifica su periodo chiuso.
- Riapertura Admin/Owner.
- Bilancio provvisorio.
- Situazione definitiva.
- Cespite.
- Ammortamento.
- Rateo.
- Risconto.
- Storno scrittura.
- Annullo scrittura.
- Export.

### Criterio dei test
- Ogni test deve dimostrare che il dato canonico e coerente.
- Ogni test fiscale deve mostrare blocchi e warning previsti.
- Ogni test di regressione deve dimostrare che il legacy non e stato reintrodotto.

## 18. Criterio 100% studio-grade

Una funzione e completa solo se:
- ha contratto dati canonico;
- ha validatori;
- ha impostazioni controllate;
- ha UI operativa;
- ha persistenza;
- ha audit;
- ha effetto coerente su IVA, partitario, bilancio, scadenze e stampe;
- ha test automatici;
- ha test manuale descritto;
- non usa legacy come base canonica;
- non dipende da fallback ambigui;
- blocca gli errori fiscali e contabili;
- rispetta periodo chiuso e permessi;
- e modificabile solo con workflow corretto.

### Aree escluse o future
- Invio diretto Agenzia Entrate.
- Invio diretto SDI.
- Conservazione sostitutiva.
- Dichiarativi completi con invio.
- Sostituzione totale dei software esterni per gli adempimenti finali.
- Modulo di compilazione/elaborazione delega F24 ministeriale completa (gestito esternamente su TeamSystem).
- Modulo di scarico massivo AdE come canale di ingresso principale (solo utilità strumentale distaccata, gli ZIP passano per l'importazione da Import Contabilità).

### Regola finale
FiscoSim è studio-grade solo quando i 4 moduli core parlano la stessa lingua, i casi fiscali italiani principali sono coperti da contratto + test + audit, i periodi sono governati da lock/riapertura autorizzata e il legacy non guida più alcuna nuova logica.
