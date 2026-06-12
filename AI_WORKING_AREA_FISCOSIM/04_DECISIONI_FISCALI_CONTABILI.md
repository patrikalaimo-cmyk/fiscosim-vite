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
