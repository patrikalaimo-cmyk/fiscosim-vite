# FISCOSIM — DEBITO COLLAUDI MANUALI

Stato aggiornato: 2026-10-07.

## Regola

Lo sviluppo può proseguire tra i blocchi A100 con gate automatici verdi. I collaudi manuali vengono accorpati in una sessione finale. Questo documento impedisce che un test differito venga dimenticato o dichiarato implicitamente superato.

## Import Contabilità — pendente

Riferimento completo: `REPORT/IMPORT_25A_FREEZE_AUDIT.md`.

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

## Registrazione Manuale — pendente

Stato automatico: **VERDE** — CI run `37627776086`.

Da verificare nella sessione manuale finale su società di test:
1. movimento generale bilanciato;
2. fattura passiva ordinaria con IVA e partitario;
3. fattura attiva ordinaria con IVA e partitario;
4. nota credito attiva/passiva con segno opposto;
5. documento multi-aliquota;
6. split payment cliente PA;
7. IVA per cassa documento + successivo incasso/pagamento;
8. reverse charge/autofattura estera;
9. parcella professionista con ritenuta e pagamento;
10. blocco salvataggio su periodo definitivo;
11. verifica visiva che ogni proposta/template resti modificabile dall'operatore.

Stato: **AUTOMATICO VERDE / MANUALE PENDENTE**.

## Gate

- sviluppo Manuale/Consultazione/IVA: consentito con CI verde;
- sviluppo Riconciliazione Bancaria: **NON consentito** finché il debito manuale di Import + Manuale + IVA non è chiuso;
- Release A100: **NON consentita** finché tutto il debito manuale non è chiuso.
