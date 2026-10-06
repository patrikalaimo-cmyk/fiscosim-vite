# AUDIT STUDIO-GRADE FISCOSIM

Questo documento contiene l'audit critico di conformità di FiscoSim rispetto allo standard **Studio-Grade** (uso interno per studi di commercialisti).

## 1. Obiettivo livello "Studio-Grade"
Per essere definito Studio-Grade, FiscoSim deve:
* Garantire precisione fiscale assoluta (arrotondamenti al centesimo, scomputi e riporti corretti).
* Impedire disallineamenti di saldi tra Libro Giornale e liquidazioni IVA.
* Consentire la tracciabilità delle azioni dell'operatore contabile (audit trail).
* Blindare i periodi consolidati e i periodi chiusi con stampa definitiva dei registri (nessuna modifica a prima nota in date passate già liquidate).
* Sostituire in affiancamento il gestionale di studio (NES) per le ditte/società configurate.
* **Nota**: FiscoSim non effettua l'invio diretto telematico a SDI o Agenzia delle Entrate, né sostituisce TeamSystem per gli adempimenti finali F24. Genera il file XML delle LIPE per il caricamento sui portali ufficiali e fornisce prospetti di controllo interni.

---

## 2. Moduli Completati o Molto Avanzati

### Registrazione Manuale
* **Stato**: Avanzato.
* **Punti di Forza**: Gestisce con causali contabili le righe contabili, le ritenute e l'IVA.
* **Limiti**: Modificato per allineare il salvataggio al contratto dati canonico, con rollback best-effort lato client in attesa di future procedure memorizzate.

### Consultazione Prima Nota
* **Stato**: Completato (Hardening).
* **Punti di Forza**: Check referenziali rigidi che impediscono la rimozione fisica di scritture collegate a partite aperte, ritenute o liquidazioni.

### IVA per cassa & Split Payment
* **Stato**: Completato (Validato).
* **Punti di Forza**: Test di integrità coprono la ripartizione proporzionale e l'esclusione dal debito IVA dello split payment.

### Ritenute e Scadenzario
* **Stato**: Avanzato.
* **Punti di Forza**: Generazione automatica del debito Erario (cod. 1040) al pagamento della parcella.
* **Integrazione**: Inserito in roadmap il controllo ritenute da F24 importati (incrocio pagamento parcella, scadenza e codici tributo 1040 per evidenziare versato/ritardo/scoperto).

### Liquidazione IVA Definitiva, Chiusura Storico ed Export
* **Stato**: Completato.
* **Punti di Forza**: Domain service con suite di test, RPC PostgreSQL di consolidamento testata, gestione dello storico con fallback sui totali salvati condizionato (solo se non ci sono dettagli reali e `options.isSaved === true`) e nota operativa diagnostica negli export CSV/HTML/Excel. Blocco dei periodi con stato `definitiva` e alert per le provvisorie.

---

## 3. Moduli Parziali o da Completare (Riallineati)

### LIPE
* **Stato**: Parziale. I dati sono aggregati correttamente nel prospetto consolidato. Manca l'esportazione XML conforme alle specifiche ministeriali per l'invio.

### Gestione F24 (Scadenzario Clienti Entratel)
* **Stato**: Riorientato. FiscoSim non implementa un compilatore F24 completo (gestito su TeamSystem). Fornisce lo scadenzario F24 per i clienti gestiti dallo studio tramite Entratel e uno storico visuale che evidenzia in verde i tributi ricorrenti pagati nei mesi precedenti per agevolare il controllo dell'operatore. Il prospetto liquidazione IVA include le righe di calcolo F24 finali.

### Registri IVA e Stampe Definitive (Fase 13)
* **Stato**: Parziale. Manca la stampa in PDF conforme dei registri con numerazione progressiva e marca temporale che blocca permanentemente il periodo in prima nota (consentendo la riapertura solo ad Owner/Admin con log, motivazione e backup).

### Bilancio e Chiusure Esercizio
* **Stato**: Da implementare. Scritture di assestamento (ratei, risconti) e registrazioni di chiusura e riapertura dei conti a fine esercizio.

### Cespiti Leggeri (Fase 16)
* **Stato**: Semplificato. Modulo non enterprise, ma strettamente operativo e agganciato a Inserimento Manuale ed Import. Alla registrazione del cespite propone la compilazione nel libro cespiti, con possibilità di rimandare (notifica persistente in dashboard). Aliquote e durata suggerite dallo storico.

### Import Contabilità & Riconciliazione Bancaria
* **Stato**: Da auditare. Devono restare i canali primari di ingresso, generando draft/payload canonici conformi alla Registrazione Manuale (nessuna scrittura contabile orfana o non standard).

### Scarico Massivo AdE
* **Stato**: Rimosso dalla roadmap principale. Diventa un modulo esterno/strumentale per generare istruzioni/file Agenzia Entrate per lo studio. L'import effettivo dei file ZIP passerà da Import Contabilità.

---

## 4. Rischi Architetturali Attuali
* **Dipendenze Legacy**: Presenza di file inutilizzati nelle cartelle `DISUSO` o tabelle deprecate (`accounting_entries`), da ripulire nella fase finale.
* **Transazioni Client-Side**: Il salvataggio manuale fa uso di rollback client-side. Una vera atomicità contabile ACID richiederà in futuro RPC server-side per il commit contabile completo.
* **Modifiche / Annulli**: La cancellazione o la modifica di fatture/scritture contabili sensibili deve essere protetta da alert graduati (leggeri per prima nota semplice, forti per fatture, doppia conferma se impattano IVA/partitario/ritenute) per prevenire disallineamenti.
