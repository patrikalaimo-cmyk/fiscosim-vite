# DECISIONI FISCALI E CONTABILI CONSOLIDATE

Le principali regole contabili e scelte fiscali adottate all'interno di FiscoSim:

## 1. Note di Credito e Rettifiche
* **NC Attive (Vendite)**: Registrate nello stesso registro delle vendite ma con segno negativo per ridurre il debito IVA complessivo del periodo, oppure sommate al credito se il saldo inverte.
* **NC Passive (Acquisti)**: Registrate nello stesso registro degli acquisti con segno negativo per ridurre l'IVA detraibile.
* **Aggiornamento in Storno**: Modifiche a scritture già definitive non avvengono tramite cancellazione del record (Delete + Reinsert) ma tramite la creazione di una riga di storno contabile contraria con segno negativo per preservare la cronologia dei progressivi di protocollo.

## 2. Regime Split Payment (PA / Società quotate)
* L'IVA addebitata in fattura confluisce regolarmente nei registri vendite (fa volume d'affari) ma deve essere esclusa dal debito IVA effettivo da versare all'Erario (l'imposta viene stornata e versata direttamente dall'ente pubblico acquirente).

## 3. IVA per Cassa (Cash VAT)
* **Differimento**: Per le fatture emesse o ricevute in regime di IVA per Cassa, l'IVA è differita. Non entra in liquidazione alla data del documento ma rimane in sospeso.
* **Rilascio**: L'IVA viene rilasciata ed entra in liquidazione solo nel periodo in cui avviene l'incasso o il pagamento (registrato su partitario).
* **Parzialità**: In caso di incasso/pagamento parziale, l'IVA viene rilasciata proporzionalmente all'importo effettivamente pagato.

## 4. Ritenute d'Acconto e Certificazione Unica
* Il debito verso l'Erario per la ritenuta d'acconto (Modello F24 cod. 1040) sorge esclusivamente al momento dell'effettivo pagamento della parcella del professionista. Il tracciamento CU/770 è guidato unicamente dal flusso dei pagamenti registrati.

## 5. Reverse Charge (Inversione Contabile)
* L'IVA viene integrata dall'acquirente ed annotata sia sul registro vendite (debito) sia sul registro acquisti (credito). L'effetto finanziario sulla liquidazione è zero, ma i dati imponibile/imposta devono essere tracciati separatamente nei due registri.

## 6. Import Contabilità — Priorità proposte IVA e storico controparte

Per le fatture importate, FiscoSim mantiene il principio **proposta + validazione utente**. Nessuna causale IVA o percentuale di detrazione proveniente dallo storico può diventare una decisione definitiva senza conferma dell'operatore.

Ordine di priorità per la causale IVA:
1. **P1 — Standard Studio**: causale IVA configurata come predefinita per aliquota/natura nelle Impostazioni Procedure.
2. **P2 — Storico controparte**: causale IVA modale delle registrazioni già contabilizzate della stessa controparte, stessa direzione acquisto/vendita e stessa aliquota.
3. **P3 — AI**: riservato a evoluzione successiva; non deve superare silenziosamente P1/P2.
4. **Override manuale**: una scelta effettuata dall'operatore nella Working View prevale sulla proposta automatica e deve essere preservata nella rigenerazione della bozza.

Se P1 e P2 divergono, FiscoSim **mantiene P1** e mostra un warning operativo non bloccante. Non deve scegliere lo storico in modo silenzioso.

La percentuale di detrazione IVA può essere proposta dallo storico della stessa controparte/aliquota. È sempre editabile prima del commit; un override manuale prevale sullo storico e viene preservato nella bozza.

Lo storico usato per le proposte è **read-only** e deriva da registrazioni IVA già contabilizzate; non comporta contabilizzazioni autonome né scritture di apprendimento durante la semplice apertura della Working View.

