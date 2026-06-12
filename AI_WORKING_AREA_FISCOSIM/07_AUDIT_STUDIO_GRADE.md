# AUDIT STUDIO-GRADE FISCOSIM

Questo documento contiene l'audit critico di conformità di FiscoSim rispetto allo standard **Studio-Grade** (uso interno per studi di commercialisti).

## 1. Obiettivo livello "Studio-Grade"
Per essere definito Studio-Grade, FiscoSim deve:
* Garantire precisione fiscale assoluta (arrotondamenti al centesimo, scomputi e riporti corretti).
* Impedire disallineamenti di saldi tra Libro Giornale e liquidazioni IVA.
* Consentire la tracciabilità delle azioni dell'operatore contabile (audit trail).
* Blindare i periodi consolidati (nessuna modifica a prima nota in date passate già liquidate).
* Sostituire in affiancamento il gestionale di studio (NES) per le ditte/società configurate.
* **Nota**: FiscoSim non effettua l'invio diretto telematico a SDI o Agenzia delle Entrate, ma genera i file XML di LIPE, F24 e prima nota pronti per il caricamento sui portali ufficiali.

---

## 2. Moduli Completati o Molto Avanzati

### Registrazione Manuale
* **Stato**: Avanzato.
* **Punti di Forza**: Gestisce con causali automatiche le righe contabili, le ritenute e l'IVA.
* **Limiti**: Mancava un meccanismo ACID lato server per la modifica (ora in corso di migrazione verso RPC transazionali).

### Consultazione Prima Nota
* **Stato**: Completato (Hardening).
* **Punti di Forza**: Check referenziali rigidi che impediscono la rimozione fisica di scritture collegate a partite aperte, ritenute o liquidazioni.

### IVA per cassa & Split Payment
* **Stato**: Completato (Validato).
* **Punti di Forza**: Test di integrità coprono la ripartizione proporzionale e l'esclusione dal debito IVA dello split payment.

### Ritenute e Scadenzario
* **Stato**: Avanzato.
* **Punti di Forza**: Generazione automatica del debito Erario (cod. 1040) al pagamento della parcella.
* **Limiti**: Da integrare con la generazione automatica delle deleghe F24 collegate.

### Liquidazione IVA Definitiva (Fase 1)
* **Stato**: Completato (Dominio e Schema).
* **Punti di Forza**: Domain service puro con 16 unit test copre calcoli complessi, interessi trimestrali, split, e acconti.

---

## 3. Moduli Parziali o da Completare

### Liquidazione IVA Definitiva (Fase 2)
* **Stato**: In corso. Mancano le query di persistenza su `liquidazione_iva` e lo snapshot delle righe in `liquidazioni_iva_righe`.

### LIPE
* **Stato**: Parziale. Mancano i prospetti periodici consolidati e l'esportazione XML conforme alle specifiche ministeriali.

### Deleghe F24
* **Stato**: Da implementare. Il modulo per generare la delega F24 associata alla liquidazione IVA o al pagamento delle ritenute d'acconto è assente.

### Registri IVA e Stampe Fiscali
* **Stato**: Parziale. Manca la stampa in PDF conforme dei registri IVA (Acquisti/Vendite/Corrispettivi) con numerazione progressiva di pagina e marca temporale di chiusura.

### Bilancio e Chiusure Esercizio
* **Stato**: Da implementare. Mancano le scritture di assestamento automatiche (ratei, risconti, ammortamenti) e le registrazioni di chiusura e riapertura dei conti a fine esercizio.

---

## 4. Rischi Architetturali Attuali
* **Dipendenze Legacy**: Presenza di file inutilizzati o deprecati nelle cartelle `DISUSO` o importazioni non coerenti con il flusso a causali.
* **Transazioni Client-Side**: Alcuni moduli contabili modificano lo stato del database eseguendo chiamate API sequenziali multiple dal browser. Se la connessione cade, si rischiano record orfani. La migrazione a RPC server-side è fondamentale.
* **Bypass di validazione in modifica**: La schermata di modifica contabile esegue una rimozione fisica controllata dal client, che rischia di bypassare le guardie di sicurezza se non interamente gestita a livello server.

---

## 5. Gap Fiscale-Contabile
* Mancanza di calcolo del pro-rata per IVA parzialmente indetraibile in ditte con attività esenti.
* Gestione delle autofatture per acquisti da soggetti non UE (reverse charge esterno con emissione di autofattura cartacea o elettronica TD17/TD18/TD19) da integrare nei workflow di prima nota.
