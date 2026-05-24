# MODULI CORE 01 - Piano completamento funzionale post-smoke

## 1. Stato tecnico raggiunto
La base tecnica locale e` stata chiusa con risultati solidi:
- Supabase locale avviabile.
- Grafo migration bootstrapabile.
- Env local-only.
- Seed locali auth/societa` funzionanti.
- UI locale navigabile.
- Quattro moduli core apribili.
- Build verde.
- Commit reale locale Registrazione manuale non IVA riuscito.
- Replay idempotente e cleanup verificati.
- Scenario IVA semplice preparato in dry-run.
- Seed locali IVA/conti/causale presenti e idempotenti.
- Nessun execute IVA reale eseguito.
- Nessun DB remoto toccato.

Conclusione tecnica: la piattaforma e` pronta per il completamento funzionale dei moduli, non per continuare con smoke avanzati ripetuti.

## 2. Decisione strategica
Si sospendono per ora i commit tecnici avanzati e i nuovi smoke reali non necessari.

Motivo:
- i commit smoke gia` dimostrati non devono essere rifatti prima che i moduli core siano funzionalmente completi;
- ulteriori write reali in questa fase aumentano il rischio di dover poi riaprire lo stesso percorso dopo nuove funzioni;
- la priorita` ora e` chiudere i confini operativi dei moduli, non allargare ancora il perimetro tecnico.

## 3. Stato sintetico dei 4 moduli core

| Modulo | Cosa funziona oggi | Cosa e` demo/dry-run/gated | Cosa manca davvero | Rischi residui | Priorita` |
|---|---|---|---|---|---|
| Registrazione manuale | Flusso locale reale non IVA completato; replay idempotente; cleanup; dry-run IVA preparato; canonical payload e guard gia` presenti | Execute IVA reale ancora non autorizzato; real save UI ancora protetto | Chiusura operativa IVA semplice; rifinitura UX operatore; consolidamento audit e confini di errore | Rischio fiscale/contabile su IVA, causali, registri; rischio di confusione tra dry-run e reale | 1 |
| Consultazione Prima Nota | Lettura, filtri, export, dettaglio, navigazione; UI di consultazione stabile | Modifica/storno/resto operazioni sono ancora stub/read-only | Definire bene i confini operativi: cosa si puo` vedere, cosa si puo` cambiare, audit trail e collegamenti ai registri | Rischio di aspettative utente: sembra gestionale ma resta prevalentemente consultivo | 2 |
| Import Contabilita` | Working view, canonical payload plumbing, dry-run/preview, validazioni di base, assistenza operatore | Commit reale ancora controllato/gated; parte di workflow ancora orientata a staging | Chiusura del percorso reale di import, con validazioni contabili/fiscali definitive e guard su commit | Rischio di commit parziale o ambiguo; rischio di payload validi ma non ancora realmente finalizzabili | 3 |
| Riconciliazione bancaria | Import, staging locale, audit, review, preview documento, vista ampia, jump table, persistenza locale | E` ancora il modulo piu` demo/gated e piu` complesso; commit reale non da riaprire ora | Chiusura di matching, review e confini di conferma; robustezza sui profili banca; allineamento UX operativa | Rischio maggiore di regressioni, parsing fragile, conflitti tra demo/staging/import reale | 4 |

## 4. Classificazione A/B/C
- Registrazione manuale: **A**
- Consultazione Prima Nota: **B**
- Import Contabilita`: **B**
- Riconciliazione bancaria: **C**

Motivo della scelta:
- Registrazione manuale e` l'unico modulo che ha gia` un primo commit reale locale chiuso con replay e cleanup.
- Consultazione Prima Nota e` stabile come lettura ma non ancora una console operativa completa.
- Import Contabilita` ha struttura e staging, ma il percorso reale deve essere ancora consolidato.
- Riconciliazione bancaria resta la piu` complessa e piu` esposta a regressioni, quindi va trattata per ultima.

## 5. Priorita` consigliata
Ordine consigliato:
1. Registrazione manuale.
2. Consultazione Prima Nota.
3. Import Contabilita`.
4. Riconciliazione bancaria.

Questo ordine riduce il rischio di dover rifare smoke reali dopo nuove funzionalita`.

## 6. Primo modulo da completare
Il primo modulo da completare deve essere **Registrazione manuale**.

## 7. Perche` partire da Registrazione manuale
Perche` e` il modulo piu` vicino alla produzione operativa:
- ha gia` un commit reale locale non IVA chiuso;
- ha guard, dry-run, replay e cleanup;
- il caso IVA semplice e` gia` pronto a livello tecnico, ma ancora non deve essere eseguito reale;
- consente di stabilizzare regole, audit e UX prima di passare ai moduli che dipendono da quei concetti.

In pratica: prima si completa il modulo che scrive meglio e piu` in sicurezza, poi si costruisce attorno ad esso la consultazione e l'import.

## 8. Cosa NON fare ora
- Non fare altri smoke reali avanzati.
- Non eseguire il commit reale IVA.
- Non aprire il partitario come obiettivo di questa fase.
- Non riaprire il commit reale da UI per Import Contabilita`.
- Non riaprire il commit reale da UI per Riconciliazione bancaria.
- Non introdurre nuovi flussi tecnici prima di chiudere i confini operativi dei moduli.

## 9. Cosa completare subito
### Registrazione manuale
- Chiarire il perimetro operativo tra non IVA e IVA semplice.
- Stabilizzare eventuali casi limite dei controlli di validazione.
- Rifinire UX operatore e messaggi di blocco.
- Tenere l'execute IVA ancora gated finche` non e` formalmente autorizzato.

### Consultazione Prima Nota
- Definire bene lettura, filtri, dettaglio, export e confini di modifica.
- Rendere esplicito cosa e` consultazione e cosa e` operativita` correttiva.
- Verificare collegamenti audit/registri senza aprire scritture reali.

### Import Contabilita`
- Consolidare il percorso reale di commit/import.
- Chiarire quando il payload e` solo staging e quando e` finalizzabile.
- Chiudere le ambiguita` tra demo, dry-run e reale.

### Riconciliazione bancaria
- Rimandare il completamento finale.
- Tenere solo hardening mirato se serve, ma nessun nuovo smoke reale.

## 10. Rischi contabili e fiscali
- IVA: rischio di scritture formalmente corrette ma non ancora autorizzate operativamente.
- Registri IVA: rischio di incoerenze tra payload canonical e registrazione finale.
- Audit trail: rischio di perdere chiarezza su cosa e` solo preview e cosa e` write reale.
- Idempotenza: rischio di duplicati se si apre troppo presto il perimetro execute.
- Casi complessi: split payment, reverse charge, IVA per cassa, partitario e documenti possono introdurre troppe varianti se riaperti ora.

## 11. Rischi architetturali
- Troppe varianti di stato tra demo, dry-run, staging e reale.
- Rischio di regressioni quando un rename o un refactor tocca flussi gia` stabili.
- Rischio di guard troppo permissivi o troppo rigidi.
- Rischio di consolidare solo il parser e non il wiring end-to-end.
- Rischio di ripetere smoke tecnici prima che il prodotto sia davvero pronto.

## 12. Roadmap breve
1. Chiudere Registrazione manuale come modulo operativo completo.
2. Rendere Consultazione Prima Nota il punto di controllo e audit.
3. Consolidare Import Contabilita` come percorso reale con guard chiari.
4. Solo dopo, tornare su Riconciliazione bancaria.

## 13. Prossimi 3 prompt massimo
1. `FASE MODULI-CORE-02 - Hardening operativo Registrazione manuale`
2. `FASE MODULI-CORE-03 - Consultazione Prima Nota: audit, filtri e confini operativi`
3. `FASE MODULI-CORE-04 - Import Contabilita: chiusura percorso reale e guard`

## 14. Verdetto operativo
La decisione e` chiara:
- basta commit tecnici avanzati per ora;
- il primo modulo da completare e` Registrazione manuale;
- i successivi sono Consultazione Prima Nota e Import Contabilita`;
- Riconciliazione bancaria resta ultima;
- i nuovi commit reali devono restare gated finche` i moduli core non sono completati funzionalmente.

