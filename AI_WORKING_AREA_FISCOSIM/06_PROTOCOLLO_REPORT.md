# PROTOCOLLO AGGIORNAMENTO REPORT E LOG

Per mantenere ordinato lo storico ed evitare che la chat diventi ingestibile con descrizioni di codice prolisse, l'AI IDE deve seguire questo protocollo:

## 1. Regole per il file REPORT/REPORT_CODEX.md
* Il file `REPORT/REPORT_CODEX.md` è il registro storico append-only ufficiale del progetto.
* Al termine di ogni sessione o modifica completata, aggiungere in coda al file una sezione con titolo stabilito in lettere maiuscole (es. `## NOME-ATTIVITA-COMPLETATA`).
* La sezione deve contenere:
  * Gli obiettivi dell'attività.
  * L'elenco preciso dei file modificati o creati.
  * I dettagli tecnici e le scelte architetturali effettuate.
  * I test eseguiti (con esito dettagliato).
  * La conferma delle regole di sicurezza rispettate (es. nessun tocco a `.env`, RLS, migrazioni non applicate, ecc.).
  * Lo stato del working tree e il prossimo step consigliato.

## 2. Regole per la Chat dell'AI
In chat, l'AI deve presentare solo un riepilogo **sintetico** e schematico (10-15 righe al massimo), rimandando l'utente al report su disco per le specifiche dettagliate.

Schema di risposta in chat:
1. **Esito**: Sintesi di 1-2 righe di cosa è stato fatto.
2. **File Creati/Modificati**: Elenco puntato di file.
3. **Test e Build**: Esito dell'esecuzione dei test e della compilazione.
4. **Sicurezza**: Dichiarazione di aderenza al perimetro (es. DB live intatto, `.env` intatti).
5. **Stato Working Tree**: Stato corrente di git.
6. **Prossimo Step**: Cosa si consiglia di fare al prompt successivo.
