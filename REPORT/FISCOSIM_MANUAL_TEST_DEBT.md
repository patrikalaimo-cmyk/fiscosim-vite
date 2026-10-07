# FISCOSIM — DEBITO COLLAUDI MANUALI

Stato aggiornato: 2026-10-07.

## Regola

Lo sviluppo può proseguire tra i blocchi A100 con gate automatici verdi. I collaudi manuali vengono accorpati in una sessione finale. Questo documento impedisce che un test differito venga dimenticato o dichiarato implicitamente superato.

## Import Contabilità — pendente

Riferimento: `REPORT/IMPORT_25A_FREEZE_AUDIT.md`.

Da verificare in browser su società esclusivamente di test:
1. XML ordinario + ZIP controllato;
2. Working Table/paginazione;
3. marker “Proposta da storico” e override conto/causale;
4. multi-aliquota 22% + 10% + placeholder 0/0;
5. warning standard IVA vs storico divergente;
6. commit singolo con conferma operatore;
7. coerenza PN / registro IVA / partitario;
8. anti-doppio commit;
9. prova visuale massiva ~500 documenti.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.

## Registrazione Manuale — da popolare nel freeze corrente

Il dettaglio verrà aggiunto dall'audit `MANUALE-CANONICO-FREEZE`.

## Gate

- sviluppo Manuale/Consultazione/IVA: consentito con CI verde;
- sviluppo Riconciliazione Bancaria: **NON consentito** finché il debito manuale di Import + Manuale + IVA non è chiuso;
- Release A100: **NON consentita** finché tutto il debito manuale non è chiuso.
