# FISCOSIM — DEBITO COLLAUDI MANUALI

Stato aggiornato: 2026-10-07.

## Regola

Lo sviluppo può proseguire tra i blocchi A100 con gate automatici verdi. I collaudi manuali vengono accorpati in una sessione finale. Questo documento impedisce che un test differito venga dimenticato o dichiarato implicitamente superato.

## Import Contabilità — pendente

Riferimento: `REPORT/IMPORT_25A_FREEZE_AUDIT.md`.

Da verificare in browser su società esclusivamente di test:
1. XML singolo ordinario;
2. ZIP controllato;
3. Working Table / Working View e paginazione;
4. marker “Proposta da storico” e override conto/causale;
5. multi-aliquota 22% + 10%;
6. placeholder IVA 0/0 ignorato se non fiscalmente significativo;
7. warning standard Studio vs storico divergente;
8. commit singolo con conferma operatore;
9. coerenza PN / registro IVA / partitario;
10. anti-doppio commit;
11. prova visuale massiva ~500 documenti.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.

## Registrazione Manuale — pendente

Riferimento: `REPORT/MANUALE_CANONICO_FREEZE_AUDIT.md`.

Da verificare in browser su società esclusivamente di test:
1. movimento generale/giroconto bilanciato senza soggetto/IVA quando non richiesti;
2. fattura passiva ordinaria: preview, PN, registro acquisti e partita fornitore;
3. fattura attiva ordinaria: preview, PN, registro vendite e partita cliente;
4. nota credito passiva e attiva: registro corretto, segno opposto e partita negativa/opposta;
5. documento multi-aliquota 22% + 10% senza collassamento delle righe IVA;
6. split payment semplice con cliente configurato PA e partitario sul netto corretto;
7. IVA per cassa: fattura differita e successivo rilascio su incasso/pagamento;
8. reverse charge / autofattura / UE-extra UE: doppia annotazione ove prevista e IVA neutrale;
9. parcella professionista con ritenuta, cassa previdenziale, spese escluse e maturazione ritenuta al pagamento;
10. partitario: apertura, chiusura, pagamento/incasso anche parziale e segni corretti sulle NC;
11. modifica/storno su periodo aperto e verifica blocco su periodo chiuso/stampato;
12. verifica visuale di warning/blocker del payload canonico prima del commit;
13. verifica che l'eventuale proposta cespite post-save resti accessoria e non duplichi la scrittura contabile.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.

## IVA / Registri / Liquidazione — pendente

Riferimento: `REPORT/IVA_REGISTRI_LIQUIDAZIONE_FREEZE_AUDIT.md`.

Da verificare in browser su società esclusivamente di test:
1. selezione periodo mensile e trimestrale e coerenza delle date incluse;
2. fattura attiva/passiva ordinaria e note credito con corretti segni nei registri;
3. documento multi-aliquota e dettaglio separato per aliquota/natura;
4. acquisto con IVA parzialmente detraibile e totalmente indetraibile, verificando che `iva_detraibile = 0` resti zero;
5. split payment semplice: IVA esposta ma esclusa dal debito della liquidazione;
6. IVA per cassa: riga differita esclusa e successivo rilascio incluso nel periodo corretto;
7. reverse charge/autofattura: esposizione coerente di debito e credito;
8. cambio società attiva senza contaminazione di registri, causali IVA, liquidazioni o snapshot;
9. anteprima corrente rispetto a liquidazione già consolidata/definitiva, con warning coerente;
10. selezione operatore e conferma esplicita prima del consolidamento;
11. blocco del riconsolidamento di una liquidazione definitiva;
12. prospetto/export con numero documento, controparte, imponibile, IVA, detraibile/indetraibile e natura reali;
13. periodo senza righe: valori zero e nessun conteggio dimostrativo/fittizio;
14. storico liquidazioni: nessun operatore inventato e dati coerenti con lo snapshot salvato;
15. eventuale dettaglio snapshot consolidato, se esposto dalla UI, limitato alla società attiva.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.

## Gate

- sviluppo Manuale/Consultazione/IVA: consentito con CI verde;
- sviluppo Riconciliazione Bancaria: **NON consentito** finché il debito manuale di Import + Manuale + IVA non è chiuso secondo il gate stabilito;
- Release A100: **NON consentita** finché tutto il debito manuale non è chiuso.


## Consultazione Prima Nota — pendente

Riferimento: `REPORT/CONSULTAZIONE_FREEZE_AUDIT.md`.

Da verificare in browser su società esclusivamente di test:
1. caricamento Consultazione con società attiva e default “Ordinarie”;
2. filtri esercizio/date/soggetto/documento/causale/conto;
3. selezione conto e coerenza saldo precedente + saldo progressivo;
4. toggle Ordinarie / Stornate / Simulate;
5. apertura dettaglio scrittura e coerenza testata/righe/quadratura;
6. verifica visuale del banner read-only;
7. verifica che Modifica/Storno/Elimina simulata non siano eseguibili dalla Consultazione;
8. periodo chiuso/stampato mostrato come non operativo;
9. export CSV compatto e completo con N. Prima Nota;
10. ordinamento numerico N. Prima Nota e riga;
11. navigazione tastiera ↑/↓/Invio/Esc;
12. warning e comportamento visuale sul limite 10.000 righe.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.
