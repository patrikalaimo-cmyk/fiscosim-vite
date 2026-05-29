# PROGETTAZIONE DEFINITIVA STUDIO-GRADE
## MODIFICA, ANNULLAMENTO, STORNO E AUDIT DI PRIMA NOTA
### FASE 3C-ARCH — Report e Specifiche Tecniche Finali

Il presente documento definisce le linee guida architetturali e le specifiche tecniche definitive per l'implementazione del workflow **studio-grade** relativo alla manutenzione ordinaria e straordinaria delle scritture contabili all'interno dell'applicazione FiscoSim.

L'obiettivo è abbandonare in prospettiva futura l'approccio legacy basato su *cancellazione fisica e reinserimento*, definendo un modello di gestione referenziale forte, atomico e conforme ai requisiti fiscali e civilistici italiani (integrità dei libri contabili, inalterabilità dello storico, tracciamento dell'audit trail append-only).

---

## 1. Stato Attuale delle Tabelle nel Database

Attualmente, il database Supabase/PostgreSQL di FiscoSim si articola su un set di tabelle dedicate, coordinate a livello applicativo tramite il repository `contabilitaRepo.js`:

1. **`prima_nota` (Header)**:
   - Contiene i dati generali della scrittura (`id`, `societa_id`, `data_registrazione`, `numero_registrazione`, `causale_codice`, `stato`, `totale_dare`, `totale_avere`, `cliente_fornitore_id`, `cliente_fornitore_nome`).
   - Lo stato (`stato`) è configurato a livello di schema per supportare `'bozza'`, `'definitiva'` e `'annullata'`.
   - **Limiti rilevati**: Manca un collegamento referenziale verso altre scritture (ad esempio, chiavi esterne per tracciare lo storno o la rettifica di una scrittura).

2. **`prima_nota_righe` (Partite Doppie)**:
   - Memorizza i dettagli contabili (`conto_id`, `conto_codice`, `conto_descrizione`, `importo_dare`, `importo_avere`, `riga_numero`).
   - **Limiti rilevati**: Ciascuna riga contabile ha una relazione uno-a-molti verso la testata `prima_nota` tramite `prima_nota_id` con politica di eliminazione fisica in cascata.

3. **`registri_iva` (Fiscale)**:
   - Tabella di staging e calcolo per la liquidazione IVA (`imponibile`, `iva`, `registro_codice`, `causale_iva_codice`).
   - **Limiti rilevati**: Collegata alla testata tramite `prima_nota_id`. Se la testata viene cancellata fisicamente, le righe IVA vengono eliminate, causando buchi di numerazione e disallineamenti se il periodo è consolidato.

4. **`partitario` (Partites Aperte / Scadenziario)**:
   - Tiene traccia delle scadenze e dei pagamenti (`importo_originale`, `importo_pagato`, `importo_residuo`, `stato` [aperta/chiusa], `chiusa_da_prima_nota_id`).
   - **Limiti rilevati**: Estremamente sensibile alla cancellazione fisica. Se si elimina un pagamento, la partita deve essere riaperta in-place.

5. **`ritenute_dacconto` (Professionisti)**:
   - Traccia le ritenute. Colloca i riferimenti in modalità testuale fragile nel campo `note` (es. `%primaNotaId%`).

6. **`liquidazioni_iva_societa` (Consolidamento)**:
   - Memorizza lo storico delle liquidazioni periodiche. Viene usata come barriera di sicurezza per bloccare modifiche su mesi/trimestri consolidati.

7. **Tabella di Audit Log**:
   - **Inesistente nel DB reale**. Attualmente i log e le tracce avvengono unicamente lato client o tramite tracce temporanee in console (`[AUDIT_PN_SEMPLICE_TRACE]`), non garantendo la persistenza inalterabile richiesta a livello studio-grade.

---

## 2. Stato Attuale del Codice Applicativo

1. **`ConsultazioneDetailSidebar.jsx` & `scritturaContabileService.js`**:
   - Agiscono come barriera read-only per la visualizzazione.
   - Implementano un pre-check di eliminazione (`deleteScritturaIsolata` che interroga `getDeleteScritturaGuards`).
   - Se la scrittura è isolata (nessun pagamento, no IVA liquidata, no storno), consente la **cancellazione fisica permanente** dal DB.
   - Se la scrittura è collegata, blocca l'eliminazione fisica e consiglia la generazione automatica dello storno contraria (`annullaRegistrazioneCollegata`).

2. **`RegistrazioneManualeView.jsx` (Salvataggio in modifica)**:
   - Quando si modifica una scrittura contabile, se è presente `state.meta.primaNotaId`, il componente chiama `deleteScritturaControllata` per eliminare permanentemente l'intero record (testata + righe + IVA + partitario) dal database, per poi reinserire il draft como una nuova scrittura con `persistPrimaNotaDraft`.
   - **Bypass critico**: Questa eliminazione fisica in modifica **non** chiama i pre-check di sicurezza `deleteScritturaIsolata`, rischiando di cancellare record protetti se l'utente vi accede direttamente dal modulo di modifica.

3. **`contabilitaRepo.js` (Metodi di storno ed eliminazione)**:
   - `deleteScritturaControllata`: sequenza coordinata lato client di cancellazioni `DELETE` sulle tabelle figlie e poi sulla testata.
   - `annullaRegistrazioneCollegata`: crea una contro-scrittura in Dare/Avere invertiti con importi stornati e imposta lo stato della scrittura originale a `'annullata'`.

---

## 3. Critica del Modello Attuale (Delete + Reinsert)

L'approccio basato su **Delete + Reinsert** (Cancellazione Fisica e Reinserimento) utilizzato per le modifiche in Inserimento Manuale presenta gravissime criticità ed è **inadeguato per sistemi professionali**:

1. **Rottura dell'Integrità dei Dati e Referenzialità**:
   - L'eliminazione fisica distrugge la chiave primaria (`id` UUID) della registrazione originaria. Se altre tabelle del database non monitorate (es. match bancari, allegati documentali, flussi import) puntano a quell'id tramite chiavi esterne, queste relazioni andranno perse o si spezzeranno, generando record orfani o vincoli rotti.

2. **Assenza Totale di Storico e Audit Trail**:
   - Poiché il record precedente viene eliminato, scompare qualsiasi prova che esso sia mai esistito. Non è possibile sapere chi ha modificato la scrittura, quando è stata modificata, quali fossero gli importi prima della modifica e perché sia stata variata. Questo viola i principi base del controllo contabile.

3. **Pericolo di Transazioni Parziali (Mancanza di Atomicità ACID)**:
   - Poiché la cancellazione e il reinserimento avvengono tramite chiamate HTTP client-side separate, se il client perde la connessione a metà esecuzione (dopo il delete ma prima dell'insert), la scrittura viene **definitivamente persa** dal database senza lasciare traccia, con grave danno per l'integrità dei dati dello studio.

4. **Inapplicabilità a Periodi Consolidati**:
   - Una scrittura contabilizzata, stampata sul Libro Giornale definitivo o inclusa in una liquidazione IVA periodica **non deve mai essere modificata o eliminata fisicamente**, poiché altererebbe retroattivamente saldi già depositati, configurando una violazione delle norme fiscali e civilistiche.

---

## 4. Disegno della Soluzione Definitiva

Il modello definitivo prevede di suddividere il workflow in 5 percorsi d'azione controllati e differenziati:

### A) Modifica Scrittura in Periodo Aperto
- **Ammissibilità**: Consentita solo per scritture non definitive (stato `'bozza'` o `'confermata'`), non stampate in definitivo, appartenenti ad un periodo IVA non liquidato ed ad un esercizio non chiuso.
- **Logica di Scrittura**: Eseguire un **update in-place transazionale**. La testata `prima_nota` viene aggiornata con i nuovi valori. Le righe originarie in `prima_nota_righe` vengono rimosse e sostituite con le nuove **all'interno della medesima transazione di database**.
- **Audit**: Salvataggio automatico di uno snapshot *Before* e *After* nella tabella di audit log append-only.
- **Blocchi**: La modifica viene rigidamente bloccata a monte se la scrittura coinvolge moduli IVA, partitari o ritenute, a meno che l'operazione non aggiorni coerentemente tutti i record correlati nella medesima transazione.

### B) Annullo Logico (Logical Cancel)
- **Utilizzo**: Scrittura non più valida ma che non deve essere cancellata fisicamente per preservare la sequenza di numerazione (es. un documento annullato o un errore di registrazione).
- **Stato**: Impostare `stato = 'annullata'` nella testata `prima_nota`.
- **Righe**: Le righe contabili rimangono nel DB ma vengono marcate come inattive, oppure il motore dei saldi e dei mastrini esclude esplicitamente dal calcolo le scritture con `stato = 'annullata'`.
- **Audit**: Registrazione obbligatoria del motivo dell'annullamento, dell'utente e del timestamp.

### C) Storno (Reverse Entry)
- **Utilizzo**: Necessario per rettificare o neutralizzare scritture in periodi consolidati, stampati o collegati a pagamenti.
- **Logica**: Generazione automatica di una contro-scrittura speculare ed invertita (Dare originario diventa Avere stornato e viceversa) con importi identici.
- **Collegamento**: La contro-scrittura deve referenziare esplicitamente la scrittura originale compilando la colonna `storno_of_id` in `prima_nota`.
- **Stato Originale**: L'originale assume lo stato `'annullata'` o `'stornata'`.
- **Effetti**: Neutralizzazione matematica dei mastrini. Per l'IVA, inserimento di record negativi nei registri fiscali per annullare l'imposta senza intaccare i progressivi sequenziali del periodo chiuso.

### D) Rettifica (Correction Entry)
- **Utilizzo**: Modifica parziale di una scrittura consolidata (es. variazione di un importo o di una classificazione di riga) senza dover stornare e rifare l'intera operazione.
- **Logica**: Creazione di una scrittura di rettifica collegata tramite `rettifica_of_id`. Il sistema somma algebricamente gli importi della rettifica a quelli dell'originale per ottenere il saldo reale nel mastrino.
- **Audit**: Log dettagliato append-only del motivo della rettifica.

### E) Cancellazione Fisica
- **Ammissibilità**: Consentita **unicamente per bozze temporanee** (`stato = 'bozza'`) non ancora contabilizzate, non stampate e prive di qualsiasi aggancio referenziale o impatto partitario.
- **Controlli**: Rigidi vincoli di chiave esterna `ON DELETE RESTRICT` su tutte le tabelle collegate per prevenire eliminazioni accidentali a livello database.

---

## 5. Proposta Dati Definitiva (Database Schema)

Per supportare la soluzione definitiva, si propone di estendere il database tramite le seguenti migrazioni:

### Estensione Tabella `prima_nota`
```sql
ALTER TABLE prima_nota 
  ADD COLUMN storno_of_id UUID REFERENCES prima_nota(id) ON DELETE RESTRICT,
  ADD COLUMN rettifica_of_id UUID REFERENCES prima_nota(id) ON DELETE RESTRICT,
  ADD COLUMN motivo_operazione TEXT,
  ADD COLUMN annullata_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN annullata_by UUID REFERENCES auth.users(id),
  ADD COLUMN periodo_chiuso_lock BOOLEAN DEFAULT FALSE,
  ADD COLUMN versione INTEGER DEFAULT 1;
```

### Nuova Tabella `audit_contabile` (Append-Only)
```sql
CREATE TABLE audit_contabile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prima_nota_id UUID REFERENCES prima_nota(id) ON DELETE SET NULL,
  utente_id UUID REFERENCES auth.users(id),
  operazione VARCHAR(30) NOT NULL, -- 'INSERT', 'UPDATE', 'ANNULLA', 'STORNO', 'RETTIFICA'
  motivo TEXT NOT NULL,
  payload_before JSONB,
  payload_after JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- RLS e Politiche di Sicurezza per Audit
ALTER TABLE audit_contabile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo lettura per utenti autenticati" ON audit_contabile FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inserimento riservato alle funzioni di sistema" ON audit_contabile FOR INSERT TO authenticated WITH CHECK (true);
-- NESSUNA politica di UPDATE o DELETE per garantire l'inalterabilità del log contabile
```

---

## 6. Proposta dei Servizi Definitivi (API/Domain)

Si propone la creazione dei seguenti servizi contabili robusti:

1. **`updatePrimaNotaControllata(primaNotaId, payload, motivo)`**:
   - **Input**: ID originale, payload canonico modificato, stringa di motivo.
   - **Output**: ID della scrittura aggiornata.
   - **Validazioni**: Invoca `assertPeriodoAperto` e verifica che la scrittura non sia stornata o collegata ad IVA liquidata.
   - **Rollback**: Esegue un update in-place delle righe in un'unica transazione.

2. **`annullaPrimaNotaLogica(primaNotaId, motivo)`**:
   - **Input**: ID originale, motivo dell'annullamento.
   - **Output**: `{ success: true }`.
   - **Tabelle**: `prima_nota` (stato `'annullata'`), `audit_contabile`.
   - **Validazioni**: Verifica che non sia già annullata e che appartenga a periodo aperto.

3. **`stornaPrimaNota(primaNotaId, motivo)`**:
   - **Input**: ID originale, motivo dello storno.
   - **Output**: ID della nuova scrittura di storno.
   - **Tabelle**: `prima_nota` (insert storno, update originaria), `prima_nota_righe`, `registri_iva`, `partitario`.

4. **`assertPeriodoAperto(societaId, data)`**:
   - **Input**: ID società, data registrazione.
   - **Validazioni**: Controlla `liquidazioni_iva_societa` e lo stato di chiusura generale dell'anno contabile. Solleva un'eccezione se il periodo è bloccato.

5. **`writeAuditLog(primaNotaId, operazione, before, after, motivo)`**:
   - **Input**: Riferimenti e payload prima/dopo.
   - **Azione**: Scrittura sincrona append-only non modificabile in `audit_contabile`.

---

## 7. Atomicità e Procedure Transazionali PostgreSQL (RPC)

Per garantire un'atomicità ACID assoluta ed eliminare qualsiasi rischio di record contabili orfani o parziali dovuti a problemi di rete, **è indispensabile spostare l'intera logica di modifica, storno e annullamento all'interno di funzioni SQL memorizzate (RPC) nel server PostgreSQL di Supabase.**

### Esempio: Schema Funzione RPC per la Modifica Sicura (`modifica_prima_nota_transazionale`)
```sql
CREATE OR REPLACE FUNCTION modifica_prima_nota_transazionale(
  p_prima_nota_id UUID,
  p_societa_id UUID,
  p_utente_id UUID,
  p_header JSONB,
  p_righe JSONB,
  p_motivo TEXT
) RETURNS UUID AS $$
DECLARE
  v_old_state JSONB;
  v_new_state JSONB;
  v_riga RECORD;
BEGIN
  -- 1. Pre-check di sicurezza (Periodo chiuso o liquidato)
  IF EXISTS (
    SELECT 1 FROM liquidazioni_iva_societa 
    WHERE societa_id = p_societa_id 
      AND anno = EXTRACT(YEAR FROM (p_header->>'data_registrazione')::DATE)
      AND (
        (tipo_periodo = 'mensile' AND periodo = EXTRACT(MONTH FROM (p_header->>'data_registrazione')::DATE))
        OR (tipo_periodo = 'trimestrale' AND periodo = CEIL(EXTRACT(MONTH FROM (p_header->>'data_registrazione')::DATE)/3.0))
      )
  ) THEN
    RAISE EXCEPTION 'Impossibile modificare: il periodo contabile/IVA è già stato consolidato o liquidato.';
  END IF;

  -- 2. Cattura dello stato Before per audit log
  SELECT json_build_object(
    'header', row_to_json(pn),
    'righe', (SELECT json_agg(r) FROM prima_nota_righe r WHERE r.prima_nota_id = p_prima_nota_id)
  ) INTO v_old_state
  FROM prima_nota pn WHERE pn.id = p_prima_nota_id;

  -- 3. Update della Testata
  UPDATE prima_nota SET
    data_registrazione = (p_header->>'data_registrazione')::DATE,
    data_documento = (p_header->>'data_documento')::DATE,
    numero_documento = p_header->>'numero_documento',
    causale_codice = p_header->>'causale_codice',
    descrizione = p_header->>'descrizione',
    cliente_fornitore_id = (p_header->>'cliente_fornitore_id')::UUID,
    cliente_fornitore_nome = p_header->>'cliente_fornitore_nome',
    totale_dare = (p_header->>'totale_dare')::NUMERIC,
    totale_avere = (p_header->>'totale_avere')::NUMERIC,
    versione = versione + 1
  WHERE id = p_prima_nota_id AND societa_id = p_societa_id;

  -- 4. Sostituzione atomica delle righe contabili
  DELETE FROM prima_nota_righe WHERE prima_nota_id = p_prima_nota_id;

  FOR v_riga IN SELECT * FROM jsonb_to_recordset(p_righe) AS (
    riga_numero INT, conto_id UUID, conto_codice VARCHAR, 
    conto_descrizione VARCHAR, descrizione_riga TEXT, 
    importo_dare NUMERIC, importo_avere NUMERIC
  ) LOOP
    INSERT INTO prima_nota_righe (
      prima_nota_id, riga_numero, conto_id, conto_codice, 
      conto_descrizione, descrizione_riga, importo_dare, importo_avere
    ) VALUES (
      p_prima_nota_id, v_riga.riga_numero, v_riga.conto_id, v_riga.conto_codice, 
      v_riga.conto_descrizione, v_riga.descrizione_riga, v_riga.importo_dare, v_riga.importo_avere
    );
  END LOOP;

  -- 5. Cattura dello stato After
  SELECT json_build_object(
    'header', row_to_json(pn),
    'righe', (SELECT json_agg(r) FROM prima_nota_righe r WHERE r.prima_nota_id = p_prima_nota_id)
  ) INTO v_new_state
  FROM prima_nota pn WHERE pn.id = p_prima_nota_id;

  -- 6. Scrittura immutabile nel Log di Audit
  INSERT INTO audit_contabile (
    prima_nota_id, utente_id, operazione, motivo, payload_before, payload_after
  ) VALUES (
    p_prima_nota_id, p_utente_id, 'UPDATE', p_motivo, v_old_state, v_new_state
  );

  RETURN p_prima_nota_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 8. Permessi e Matrice RBAC (Role-Based Access Control)

La sicurezza contabile viene blindata definendo 3 ruoli operativi distinti:

1. **Operatore (Contabile Senior / Impiegato)**:
   - *Modifica*: Consentita solo in periodo aperto su scritture con `stato = 'bozza'` o `'confermata'` (non definitive).
   - *Storno/Annullo*: Disabilitato per periodi consolidati. Deve richiedere l'intervento dell'Amministratore.
   - *Cancellazione*: Vietata per qualsiasi scrittura ad esclusione delle bozze temporanee locali.

2. **Admin (Amministratore dello Studio / Capo Contabile)**:
   - *Modifica*: Consentita in periodo aperto.
   - *Storno*: Abilitato su qualsiasi scrittura. Richiede compilazione del motivo obbligatoria per l'audit.
   - *Annullo*: Abilitato su scritture isolate con giustificazione d'audit.

3. **Owner (Titolare dello Studio / SuperAdmin)**:
   - Gode di tutti i diritti dell'Admin.
   - È l'unico che può "Riaprire" un periodo IVA o annuale precedentemente bloccato o consolidato (con generazione di una notifica di audit trail ad alta priorità non cancellabile).

---

## 9. UX Definitiva (Interfaccia Utente)

L'esperienza d'uso all'interno del modulo **Inserimento Manuale** e della **Consultazione** deve riflettere rigidamente queste politiche di sicurezza contabile:

1. **Badge Premium di Contesto**:
   - Quando si apre una scrittura in modalità modifica, l'header deve esibire un badge color oro metallico `"MODIFICA REGISTRAZIONE N° X"`.
   - Se lo stato della registrazione è `'annullata'`, visualizzare un banner rosso bloccante `"REGISTRAZIONE ANNULLATA IN DATA X DA Y"` con impossibilità di effettuare modifiche.
   
2. **Modale Obbligatorio di Giustificazione (Reason Popup)**:
   - All'atto del salvataggio (`F12` / "Salva registrazione") o dello storno in modalità modifica, deve comparire un modale bloccante che richiede all'operatore di digitare obbligatoriamente il **motivo della modifica/storno** (minimo 15 caratteri) prima di abilitare l'invio.

3. **Disabilitazione del Tasto di Rimozione Fisica**:
   - Rimuovere qualsiasi pulsante "Elimina" grafico per le registrazioni confermate e contabilizzate. L'unica opzione visuale deve essere "Annulla Scrittura" (se isolata) o "Esegui Storno Contabile" (se collegata).

---

## 10. Test Suite Definitiva (Scenario Matrix)

La suite di test per certificare la soluzione definitive dovrà validare i seguenti casi d'uso:

| ID Scenario | Descrizione | Azione | Risultato Atteso | Stato Test |
|---|---|---|---|---|
| **ST-01** | Modifica scrittura in periodo aperto | Invio patch testata + righe | Update in-place, righe sostituite, record di audit scritto | `Da implementare` |
| **ST-02** | Modifica scrittura sbilanciata | Invio righe non quadrate | Blocco del commit con errore di sbilancio | `Da implementare` |
| **ST-03** | Modifica in periodo chiuso/liquidato | Salva modifiche in mese consolidato | Blocco a monte con errore `assertPeriodoAperto` | `Da implementare` |
| **ST-04** | Annullo logico scrittura isolata | Chiamata `annullaPrimaNotaLogica` | `stato` diventa `'annullata'`, righe preservate nel DB | `Da implementare` |
| **ST-05** | Storno scrittura collegata | Chiamata `stornaPrimaNota` | Creazione contro-scrittura speculare, originale `'annullata'` | `Da implementare` |
| **ST-06** | Audit trail immutabile | Esecuzione update/storno | Record inserito in `audit_contabile`, payload prima/dopo valorizzati | `Da implementare` |
| **ST-07** | Tentativo cancellazione fisica | Delete su scrittura consolidata | Errore di database (vincolo `ON DELETE RESTRICT`) | `Da implementare` |

---

## 11. Piano Implementativo Consigliato (Fasi di Rilascio)

Per implementare questa architettura senza interrompere il funzionamento dell'applicazione, si consiglia la suddivisione in 3 sottofasi:

### Sottofase 1: Schema DB e Tracciamento Referenziale (Basso Rischio)
- Eseguire la migration SQL per aggiungere le colonne referenziali (`storno_of_id`, `rettifica_of_id`, `motivo_operazione`) e la tabella `audit_contabile` (append-only) su Supabase.
- Questa fase è additiva al 100% e non comporta regressioni sul codice esistente.

### Sottofase 2: Procedure Memorizzate SQL (RPC) e API Services
- Sviluppare e installare la funzione PostgreSQL `modifica_prima_nota_transazionale` e le altre RPC sul server.
- Creare i servizi JavaScript nel backend per avvolgere queste chiamate.
- Scrivere la suite di unit test integrati per convalidare la stabilità delle transazioni DB.

### Sottofase 3: Integrazione UI, Modali e Badge (UX)
- Collegare `RegistrazioneManualeView` e `ConsultazioneDetailSidebar` alle nuove API transazionali, mandando in pensione il vecchio tracciato client-side di cancellazione fisica.
- Implementare i modali grafici di giustificazione e i badge di stato premium.

---

### Raccomandazione Operativa Finale
> [!IMPORTANT]
> **Si consiglia vivamente di NON procedere all'applicazione autonoma di migrazioni del database o refactoring massivi del codice applicativo durante questa sessione.**
> La progettazione tecnica qui descritta fornisce tutte le specifiche necessarie ed è pronta per essere approvata e calendarizzata come una lavorazione autonoma e controllata in cooperazione con il team infrastrutturale e di database.
