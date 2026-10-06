# Roadmap Operativa FiscoSim

Questo è il documento di tracciamento ufficiale dello sviluppo di FiscoSim. Viene aggiornato passo-passo ad ogni traguardo raggiunto, includendo le istruzioni di verifica (i test manuali da fare nel browser) per considerare chiusa ciascuna attività prima di passare alla successiva.

---

## 🟢 FASE 1: Core Contabile & Persistenza Reale (In Corso)
Questa fase si concentra sul rendere stabile, sicuro e interamente persistito su database Supabase il modulo di **Registrazione Manuale** e di consultazione.

### 1.1 Sblocco del Salvataggio Reale ("Real Save")
*   **Stato:** `[x]` Completato
*   **Descrizione:** Abilitazione del salvataggio atomico delle registrazioni manuali semplici direttamente su Supabase. Scrive in modo transazionale e coordinato su `prima_nota`, `prima_nota_righe`, `registri_iva` e `partitario`.
*   **Istruzioni di Verifica per l'Utente:**
    1. Apri la schermata **Registrazione Manuale**.
    2. Seleziona una causale contabile con IVA (es. `FF` - Fattura Fornitore).
    3. Compila gli importi delle righe contabili e la causale IVA nel pannello IVA in modo da bilanciare il documento (Dare = Avere).
    4. Noterai che il pulsante in alto a destra o la scorciatoia **F12** avvia il salvataggio reale. Salva la registrazione.
    5. Vai su Supabase e verifica che siano state scritte correttamente le righe corrispondenti su `prima_nota`, `prima_nota_righe`, `registri_iva` e `partitario`.

### 1.2 Correzione Warning Registro IVA & Pulizia Messaggi di Stato
*   **Stato:** `[x]` Completato
*   **Descrizione:** 
    *   Risolto il bug di UI per cui il registro IVA sulla prima riga rimaneva `"da assegnare"`, generando il messaggio di errore `"registro IVA non definito sulla riga 1"`.
    *   **Rimozione Messaggi Fuorvianti:** Abbiamo nascosto il banner giallo di stato del "Salvataggio reale" quando il salvataggio è attivo e privo di errori (l'operatore vedrà la schermata pulita senza allarmi gialli o rossi non necessari).
    *   **Prevenzione Doppi Warning:** Evitato il warning di registro IVA non definito quando una causale IVA non è ancora stata selezionata su una riga (evitando di confondere l'utente con warning ridondanti).
*   **Istruzioni di Verifica per l'Utente:**
    1. Apri la schermata **Registrazione Manuale** e seleziona `FF` o `FC`.
    2. Spostati sulla scheda **IVA**.
    3. Verifica che sulla riga 1 compaia in automatico il registro corretto (es. `01` per acquisti su `FF` o `02` per vendite su `FC`) ereditato dalla causale.
    4. Verifica che **non ci siano scritte gialle o rosse** e che il banner di stato del salvataggio reale sia nascosto, lasciando la pagina contabile pulita e pronta per l'operatività.

### 1.3 Consultazione, Storni e Rettifiche (PROSSIMO PASSO)
*   **Stato:** `[ ]` Da iniziare
*   **Descrizione:** Consolidamento di `PrimaNotaHubView.jsx` per visualizzare le registrazioni reali caricate su Supabase e implementazione della funzionalità di annullamento/storno controllato delle prima note (creazione di una scrittura di rettifica con segno invertito o cancellazione guidata se in bozza).
*   **Istruzioni di Verifica previste:** (Verranno definite all'avvio dell'attività)

---

## 🟡 FASE 2: Ciclo Attivo/Passivo & IVA
*   **Stato:** `[ ]` Da iniziare

### 2.1 Pipeline Documento Contabile Unico (XML/PDF -> Bozza)
*   **Stato:** `[ ]` Da iniziare
*   **Descrizione:** Collegamento del motore di importazione (XML fattura elettronica e PDF con parser AI) affinché generi una bozza di prima nota pre-compilata direttamente nel pannello di approvazione della Registrazione Manuale.

### 2.2 Liquidazione IVA Periodica
*   **Stato:** `[ ]` Da iniziare
*   **Descrizione:** Sviluppo del modulo di liquidazione mensile o trimestrale con calcolo degli sbilanci IVA a partire dalle righe scritte nella tabella `registri_iva`.

---

## 🔵 FASE 3: Scadenzario, Ritenute e Adempimenti Studio
*   **Stato:** `[ ]` Da iniziare

### 3.1 Partitario Avanzato & Scadenzario
*   **Stato:** `[ ]` Da iniziare
*   **Descrizione:** Generazione automatica dello scadenzario clienti/fornitori dalle fatture e inserimento agevolato delle registrazioni di incasso/pagamento con chiusura automatica delle partite.

### 3.2 Modulo Percipienti, Ritenute & Certificazione Unica
*   **Stato:** `[ ]` Da iniziare
*   **Descrizione:** Gestione delle ritenute d'acconto (calcolo e inserimento automatico del conto ritenute in prima nota) e aggregazione dei compensi percipienti per la CU.

### 3.3 Delega F24
*   **Stato:** `[ ]` Da iniziare
*   **Descrizione:** Generazione automatica dei modelli F24 per il pagamento dell'IVA liquidata e delle ritenute operate, con tracciamento dello stato di versamento.
