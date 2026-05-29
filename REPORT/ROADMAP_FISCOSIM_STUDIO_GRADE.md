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
| Stato scrittura | bozza, da_verificare, confermata, contabilizzata, annullata, stornata, rettificata, chiusa, esportata | locked_period, reopened_by_admin | Workflow canonico | transizioni consentite, blocco periodo, ruoli | Manuale, Import, Banca, Admin | Tutto il sistema | comanda l'ammissibilita delle azioni |

## 4. Stato business standard

| Stato | Significato | Chi lo imposta | Azioni consentite | Azioni vietate | Effetto su periodo chiuso | Effetto su audit | Effetto su stampe definitive |
|---|---|---|---|---|---|---|---|
| bozza | Dati in composizione | Operatore, Import, Banca | edit, validazione, preview | export definitivo, contabilizzazione finale | nessun effetto | crea tracce di costruzione | nessun effetto |
| da verificare | Pronta ma non ancora confermata | Operatore | correzione, approvazione, rifiuto | write definitivo | blocca passaggio automatico se ci sono warning rossi | registra warning/override | nessun effetto |
| confermata | Contenuto approvato | Operatore con permesso | commit, annullo se aperto | modifiche arbitrarie | se periodo chiuso non passa | evento di conferma obbligatorio | stampabile provvisoriamente |
| contabilizzata | Scrittura persistita | Sistema | consultazione, export, storno controllato | edit diretto | se chiuso resta read-only | audit append-only | stampabile provvisoria o definitiva se aperto |
| annullata | Scrittura annullata con tracciamento | Operatore autorizzato, Admin | consultazione, riapertura tecnica se permessa | edit del contenuto originario | se chiuso richiede riapertura autorizzata | evento annullo obbligatorio | esclusa dalle definitive salvo ristampa storica |
| stornata | Scrittura rovesciata da contro-scrittura | Sistema o Operatore autorizzato | consultazione, correlazione con originaria | modifica retroattiva | ammessa solo con workflow controllato | genera legame causale | impatta definitivi solo se periodo aperto |
| rettificata | Correzione tracciata con nuova scrittura | Operatore autorizzato | consultazione, nuova registrazione | riscrittura silente | periodo chiuso solo con riapertura | storico before/after obbligatorio | aggiorna quadri ma non cancella storia |
| chiusa | Periodo o esercizio chiuso | Admin/Owner | sola lettura, export, stampa | edit, commit, storno libero | blocca tutte le scritture non autorizzate | audit di chiusura obbligatorio | definitive bloccate |
| esportata | Output inviato a file/sistema esterno | Sistema | consultazione, ristampa, duplicazione controllata | mutate payload esportato senza audit | nessun write automatico | traccia export e checksum | usata per consegne e controlli esterni |

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

## 8. Ritenute, percipienti, CU, 770 e F24

### Cosa serve e perche
Serve un ciclo completo e coerente: parcella -> ritenuta -> pagamento -> F24 -> CU -> 770. Il percipiente deve essere identificato con fortezza, non con testo libero fragile.

### Flussi da coprire
- Parcella professionista con ritenuta.
- Parcella con cassa previdenziale.
- Rivalsa INPS 4%.
- Contributi previdenziali.
- Spese anticipate non imponibili.
- Bollo.
- Pagamento parcella.
- Data pagamento come evento fiscale rilevante.
- Generazione debito ritenuta.
- Scadenza versamento.
- F24 ritenute.
- CU.
- 770.

### Dati usa e produce
- Usa: percipiente, CF, imponibile, ritenuta, tipo ritenuta, data pagamento, cassa previdenziale, bollo, scadenza, tributo.
- Produce: scrittura contabile, debito ritenuta, scadenza F24, dati CU, dati 770, audit.

### Regole
- La parcella deve essere identificata come professionista quando il flusso lo richiede.
- La ritenuta deve essere coerente con il percipiente e con la data rilevante.
- Il pagamento e spesso l'evento che rende concreta la scadenza del versamento.
- CU e 770 devono derivare dalla stessa base dati, non da reinserimenti separati.

### Blocchi
- Percipiente mancante o CF incoerente.
- Ritenuta prevista ma non calcolata.
- Pagamento parcella senza scadenza F24 dove richiesta.
- CU/770 con dati non quadrati rispetto alla contabilita.

### Warning
- Cassa previdenziale presente ma regime non chiarissimo.
- Rivalsa INPS o bollo presenti ma non chiaramente classificati.
- Percipiente estero solo se previsto dalla politica dati.

### Impostazioni servono
- Conti ritenute.
- Conti percipienti.
- Causali professionisti.
- Regole di calcolo per cassa previdenziale e bollo.
- Codici tributo F24.

### Test minimo
- Parcella con ritenuta.
- Parcella con cassa previdenziale.
- Pagamento parcella.
- F24 ritenuta.
- CU generata dalla stessa base dati.
- 770 quadrato con CU e ritenute.

### Fase
- FASE 16.

### Vietato
- Usare dati manuali separati per CU e 770.
- Slegare il pagamento dal versamento.

### Rischi regressione
- Percipiente non allineato.
- F24 con importo sbagliato.
- CU e 770 non quadrati.

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

## 12. Cespiti e ammortamenti

### Cosa deve coprire
- Acquisto cespite da fattura.
- Anagrafica cespite.
- Categoria.
- Coefficiente.
- Data entrata in funzione.
- Costo storico.
- Fondo ammortamento.
- Quota civilistica.
- Quota fiscale.
- Ammortamento ordinario.
- Ammortamento parziale primo anno se previsto.
- Dismissione.
- Vendita.
- Plusvalenza/minusvalenza.
- Stampa registro cespiti.
- Collegamento con bilancio e prima nota.
- Simulazione quote future.
- Audit.

### Regole
- Il cespite deve essere un oggetto con vita propria, non un semplice conto di costo.
- L'ammortamento deve essere calcolabile, auditabile e collegato al bilancio.
- La dismissione deve produrre una storia chiara tra costo storico, fondo e plus/minus.

### Blocchi
- Categoria assente.
- Coefficiente mancante.
- Fondo ammortamento incoerente.
- Dismissione senza collegamento al cespite originario.

### Warning
- Ammortamento parziale primo anno.
- Costo storico con dati incompleti ma recuperabili.

### Test minimo
- Acquisto cespite.
- Ammortamento annuale.
- Dismissione.
- Stampa registro cespiti.
- Raccordo bilancio.

### Fase
- FASE 17.

## 13. Gestione modifiche, annulli, storni e cancellazioni

### Regola base
- Inserimento Manuale e il solo contratto canonico per creare, modificare, annullare, stornare, rettificare e salvare.
- Consultazione non deve modificare direttamente.
- Le scritture contabilizzate devono essere modificate solo tramite workflow controllato.
- La cancellazione fisica di scritture contabilizzate e da evitare; preferire annullo, storno o rettifica tracciata.

### Azioni
| Azione | Quando ammessa | Chi puo farla | Cosa produce | Cosa vieta | Audit |
|---|---|---|---|---|---|
| Modifica | periodo aperto o workflow di riapertura | Operatore autorizzato | nuova versione o draft aggiornato | modifica silente | before/after obbligatorio |
| Annulla | scrittura da neutralizzare | Operatore autorizzato, Admin | annullo tracciato | perdita della storia | evento annullo obbligatorio |
| Storna | quando serve contro-scrittura | Sistema o Operatore autorizzato | scrittura opposta collegata | cancellazione silente | legame con originaria obbligatorio |
| Rettifica | correzione puntuale | Operatore autorizzato | nuova scrittura correttiva | riscrittura del passato | collegamento alla originaria |
| Cancellazione | quasi mai su contabilizzate | solo casi tecnici di staging | rimozione tecnica | perdita del dato contabile canonico | audit tecnico obbligatorio |

### Effetti obbligatori
- IVA.
- Partitario.
- Scadenze.
- Bilancio.
- Stampe.
- Audit.

### Blocchi
- Periodo chiuso.
- Scrittura gia stampata definitiva.
- Scrittura gia consumata da liquidazioni chiuse senza riapertura autorizzata.

### Test minimo
- Modifica in periodo aperto.
- Annulla con audit.
- Storno con contro scrittura.
- Rettifica collegata.
- Blocchi su periodo chiuso e stampe definitive.

### Fase
- FASE 7, FASE 12, FASE 20.

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
| Pagamento parcella | professionisti | pagamento parcella | n/a | n/a o cash | banca, debito fornitore, debito ritenuta | nessun effetto diretto o cash event | chiude partita | scadenza F24 ritenuta | si, alimenta scadenza | riduce debiti | coerenza pagamento + ritenuta | differenza importo | pagamento completo | 16 |
| Versamento ritenuta F24 | professionisti | F24 ritenuta | n/a | n/a | banca, debito ritenuta, F24 | nessuno | chiude debito ritenuta | scadenza 16 mese successivo | si, consuntivo | riduce debiti fiscali | tributo e periodo | importo errato | F24 completo | 16 |
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
| Stipendi | tutti | costo personale | n/a | n/a | salari, debiti INPS, erario, banca | nessuno | partitario se previsto | scadenze contributi/fiscali | si, se rilevante | costo personale | cedolino/paghe coerenti | dati incompleti | scrittura paghe | 10-16 |
| F24 | tutti | pagamento tributo | n/a | n/a | banca, debiti tributari, F24 | nessuno | chiude debito | scadenza tributo | si | debiti fiscali ridotti | tributo e periodo | importo non valido | F24 completo | 16 |
| Ritenute | professionisti | accantonamento/versamento | n/a | n/a | debito ritenuta, banca, percipiente | nessuno | scadenza percipiente | 16 mese successivo | si | debito fiscale | percipiente e tributo | periodo incoerente | ritenuta | 16 |
| Cespite | ordinaria | acquisto cespite | eventuale | acquisti | cespite, IVA, debiti | effetto normale | eventuale partita fornitore | pagamento | no | incremento attivo | categoria obbligatoria | utile residua incoerente | cespite | 17 |
| Ammortamento | ordinaria | ammortamento | n/a | n/a | fondo ammortamento, costo ammortamento | nessuno | no | no | no | riduce utile | piano ammortamento coerente | quota anomala | ammortamento | 17 |
| Dismissione cespite | ordinaria | dismissione | eventuale | acquisti o vendite secondo caso | cespite, fondo, plus/minus | eventuale IVA se vendita | eventuale partita cliente | scadenza se vendita | no | plus/minus | costo storico e fondo coerenti | valore residuo | dismissione | 17 |
| Rateo | tutti | assestamento rateo | n/a | n/a | ratei attivi/passivi, costo/ricavo | nessuno | no | no | no | competenza corretta | data competenza | periodo errato | rateo | 18 |
| Risconto | tutti | assestamento risconto | n/a | n/a | risconti, costo/ricavo | nessuno | no | no | no | competenza corretta | competenza temporale | calcolo giorni | risconto | 18 |
| Assestamento | tutti | assestamento | n/a | n/a | conti competenza, assestamenti | nessuno | no | no | no | rettifica risultato | causale assestamento | doppio assestamento | assestamento | 18 |
| Chiusura conto economico | ordinaria | chiusura esercizio | n/a | n/a | ricavi/costi, utile/perdita | nessuno | no | no | no | chiusura CE | esercizio aperto/chiuso | utili non quadrati | chiusura | 19-21 |
| Riapertura conti | ordinaria | apertura esercizio | n/a | n/a | conti patrimoniali | nessuno | no | no | no | porta saldi iniziali | solo Admin/Owner | periodo chiuso | riapertura | 21 |
| Scrittura di rettifica | tutti | rettifica | dipende dal caso | dipende dal caso | conti originali e correttivi | eventuale | partite aggiornate | eventuale | dipende | rettifica saldi | collegamento originaria | correzione senza link | rettifica | 7-20 |
| Storno scrittura | tutti | storno | dipende | dipende | conti originari | eventuale | partitario coerente | eventuale | dipende | neutralizza effetto | riferimento originaria | storno duplicato | storno | 7-20 |
| Annulla scrittura | tutti | annullo | dipende | dipende | conti originari | eventuale | partitario coerente | eventuale | dipende | neutralizza effetto | permesso e periodo | annullo non autorizzato | annullo | 7-20 |

## 16. Roadmap rigida per fasi

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
| FASE 12 - Liquidazioni IVA ordinarie | produrre output periodico | FASE 11 | IVA, stampe | liquidazione periodica, annuale base | liquidazione non quadrata | liquidazione tests | liquidazioni coerenti | alto | liquidazioni verdi |
| FASE 13 - Split payment | separare IVA split dal debito ordinario | FASE 12 | manuale, IVA, liquidazioni | flag cliente, registri, stampa, partitario | trattarlo come IVA ordinaria | split tests | split chiaro e bloccato se incoerente | alto | split certificato |
| FASE 14 - IVA per cassa | gestire sospensione e rilascio | FASE 12-13 | manuale, banca, IVA | documento+partita+cash event | gestirla solo nella fattura | cash event tests | rilascio corretto al pagamento/incasso | alto | regime cassa verde |
| FASE 15 - Reverse charge, UE, extra UE, autofatture | distinguere i casi esteri | FASE 12-14 | manuale, import, IVA | doppia rilevazione, classificazione interna | una sola regola generica | reverse/UE/autofattura tests | casi distinti e coerenti | alto | esteri validati |
| FASE 16 - Ritenute, percipienti, CU, 770, F24 | chiudere il ciclo professionisti | FASE 3-15 | ritenute, CU, 770, F24 | percipienti, scadenze, export, quadrature | dati manuali separati | ritenute/CU/770/F24 tests | quadratura parcella -> pagamento -> F24 -> CU -> 770 | alto | adempimenti verdi |
| FASE 17 - Cespiti e ammortamenti | blindare immobilizzazioni | FASE 11-16 | cespiti, bilancio | anagrafica cespite, quote, dismissioni | cespite come semplice costo | asset tests | registro cespiti e bilancio coerenti | medio-alto | cespiti verdi |
| FASE 18 - Ratei, risconti, assestamenti | completare fine periodo | FASE 11-17 | bilancio, manuale | competenza, assestamenti, giroconti | assestamenti senza link | accrual tests | assestamenti coerenti | medio-alto | assestamenti verdi |
| FASE 19 - Bilancio, situazioni, mastrini, libro giornale | output contabile completo | FASE 11-18 | bilancio, stampe | bilanci, situazioni, mastrini, giornale | stampare con saldi incoerenti | bilancio tests | output contabile pronto per studio | alto | bilancio e giornale verdi |
| FASE 20 - Stampe definitive e blocco periodo | fermare le modifiche quando serve | FASE 19 | stampe, periodi | definitive, checksum, blocco modifiche | modifiche silenti dopo stampa definitiva | lock/print tests | stampato definitivo = protetto | alto | print lock verde |
| FASE 21 - Apertura nuovo esercizio/anno IVA e chiusura esercizio | governare il ciclo annuale | FASE 19-20 | admin, periodi, IVA | chiusura, riapertura, anno IVA, audit | riapertura senza autorizzazione | close/open tests | solo Admin/Owner riapre | molto alto | chiusura approvata |
| FASE 22 - Scadenzario unico e task studio | unificare le scadenze operative | FASE 10-21 | agenda, F24, ritenute, liquidazioni | task, priorita, reminder, follow-up | task non legati a eventi canonici | schedule tests | un solo calendario studio | medio | scadenzario verde |
| FASE 23 - Export/interoperabilita | produrre output per software esterni | FASE 8-22 | export, report | csv/xlsx/pdf, checksum, mapping esterno | export che altera il canonico | export contract tests | export ripetibile e riconciliabile | medio | export validato |
| FASE 24 - Test suite fiscale-contabile italiana | consolidare copertura | FASE 1-23 | tutti | suite integrata per casi italiani | test solo smoke | unit/contract/integration/UI/fiscal/regression/perf | casi critici coperti | alto | suite verde |
| FASE 25 - Hardening anti-regressione e audit finale studio-grade | stabilizzare il sistema | FASE 1-24 | tutti | observability, performance, RLS, quality gate, report update | nuove eccezioni silenti | perf/load/audit/resilience tests | sistema pronto per uso interno stabile | medio-alto | release checklist approvata |

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

### Regola finale
FiscoSim e studio-grade solo quando i 4 moduli core parlano la stessa lingua, i casi fiscali italiani principali sono coperti da contratto + test + audit, i periodi sono governati da lock/riapertura autorizzata e il legacy non guida piu alcuna nuova logica.
