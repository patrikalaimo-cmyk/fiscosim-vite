# MODULI CORE 02 - Hardening operativo Registrazione manuale

## 1. Stato iniziale
La Registrazione manuale e` il primo modulo core da completare dopo la fase di smoke tecnico.

Contesto gia` raggiunto:
- Supabase locale avviabile.
- Env local-only.
- Seed locale auth/societa` funzionante.
- UI locale navigabile.
- Registrazione manuale ha gia` completato un commit reale locale non IVA.
- Replay idempotente e cleanup sono stati verificati.
- Scenario IVA semplice e` stato preparato in dry-run.
- Execute IVA reale non e` stato eseguito.
- DB remoto non e` mai stato toccato.

## 2. Cosa funziona
Oggi la Registrazione manuale dispone gia` di:
- builder canonical del payload;
- validator canonical del payload;
- smoke dev locale con dry-run di default;
- cleanup idempotente;
- replay idempotente;
- guard su target locale;
- supporto tecnico per uno scenario IVA semplice in dry-run;
- struttura UI avanzata con righe Dare/Avere, IVA, partitario e anteprima bozza;
- blocco reale temporaneo nel salvataggio UI.

## 3. Cosa e` ancora gated
Restano volutamente bloccati o non riaperti:
- commit reale IVA da UI;
- commit reale automatico;
- salvataggio reale se il flag di blocco e` attivo;
- casi fiscali complessi non ancora consolidati come percorso prodotto;
- percorsi che aprirebbero Import Contabilita`, Consultazione Prima Nota o Riconciliazione bancaria.

## 4. Cosa manca per uso operativo reale
Per uno studio, il modulo non e` ancora pienamente pronto finche` non sono chiari e stabili:
- il confine tra bozza, dry-run e reale;
- il comportamento dei pulsanti di conferma e salvataggio;
- il supporto IVA semplice come percorso prodotto e non solo tecnico;
- la chiarezza delle causali e dei conti richiesti;
- la leggibilita` dei blocchi e dei messaggi di errore;
- la coerenza tra anteprima, validazione e write finale.

## 5. Validazioni contabili da completare
Da consolidare meglio prima di riaprire il commit reale da UI:
- quadratura sempre esplicita;
- almeno due righe coerenti quando richiesto;
- conti obbligatori chiaramente evidenziati;
- causale contabile obbligatoria ben validata;
- importi Dare/Avere coerenti;
- data registrazione e esercizio coerenti;
- descrizione registrazione sempre presente e leggibile;
- blocco chiaro per casi incompleti o ambigui.

## 6. Validazioni fiscali da completare
Prima di riaprire l execute reale IVA servono blocchi e messaggi piu` netti su:
- aliquota IVA;
- registro IVA;
- natura IVA;
- detraibilita`;
- reverse charge;
- split payment;
- IVA per cassa;
- ritenute;
- scenari misti o complessi non supportati.

## 7. UX da rifinire
Le aree piu` importanti da rendere piu` chiare sono:
- distinzione visiva tra bozza, dry-run e reale;
- pulsanti di salvataggio e verifica;
- messaggi di errore e blocco;
- etichette sulle sezioni Dare/Avere, IVA e partitario;
- aiuti contestuali per conti e causali;
- chiarezza sulla disattivazione del salvataggio reale;
- riduzione del rischio di confondere preview e commit.

## 8. Messaggi e blocchi da migliorare
Da rendere piu` espliciti:
- salvataggio reale bloccato;
- execute IVA non autorizzato;
- causale mancante;
- conto mancante o incoerente;
- quadratura non valida;
- scenario fiscale non supportato;
- necessaria revisione prima del commit.

## 9. Cosa NON toccare
In questa fase non va toccato:
- Import Contabilita`;
- Consultazione Prima Nota;
- Riconciliazione bancaria;
- DB remoto;
- migration;
- guard di sicurezza gia` esistenti sul commit reale;
- replay/idempotenza gia` validati;
- cleanup gia` validato.

## 10. Interventi prioritari
1. Rendere piu` leggibile la differenza tra bozza, dry-run e reale.
2. Consolidare la gestione UX delle validazioni contabili e fiscali.
3. Preparare il modulo a diventare il riferimento operativo per lo scenario IVA semplice.
4. Mantenere il commit reale ancora gated finche` i messaggi e i percorsi non sono chiari per l operatore.

## 11. Micro-roadmap
1. Rifinire UX e messaggi di blocco della Registrazione manuale.
2. Stabilizzare il perimetro IVA semplice come caso operativo, senza aprire ancora l'execute reale.
3. Solo dopo, riaprire con cautela il commit reale da UI.

## 12. Verdetto
La Registrazione manuale e` **B**.

Motivo:
- e` gia` molto solida tecnicamente;
- il primo commit reale locale non IVA e` riuscito;
- ma per un uso da studio manca ancora hardening mirato su UX, validazioni e chiarezza dei gate.

### Quando potra` essere riaperto il commit reale da UI?
Solo dopo che:
- i messaggi di blocco sono chiari;
- la distinzione bozza/dry-run/reale e` esplicita;
- lo scenario IVA semplice e` stabile come percorso prodotto;
- non ci sono ambiguita` sui casi fiscali complessi ancora gated.

