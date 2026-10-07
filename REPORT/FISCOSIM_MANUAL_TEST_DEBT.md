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

## IVA / Registri / Liquidazione — da consolidare nel relativo freeze

I casi manuali specifici verranno aggiunti durante `IVA-REGISTRI-LIQUIDAZIONE` e mantenuti qui fino al collaudo finale.

## Gate

- sviluppo Manuale/Consultazione/IVA: consentito con CI verde;
- sviluppo Riconciliazione Bancaria: **NON consentito** finché il debito manuale di Import + Manuale + IVA non è chiuso secondo il gate stabilito;
- Release A100: **NON consentita** finché tutto il debito manuale non è chiuso.
