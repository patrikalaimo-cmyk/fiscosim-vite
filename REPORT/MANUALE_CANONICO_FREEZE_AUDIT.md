# MANUALE-CANONICO-FREEZE — AUDIT AUTOMATICO

Data: 2026-10-07  
Branch: `mio-branch`

## Esito

**AUTOMATICO VERDE / MANUALE PENDENTE**

CI ufficiale: run `37627776086`, verde su Ubuntu e Windows.

## Copertura automatica consolidata

- movimenti generali Dare/Avere;
- fatture attive e passive ordinarie;
- registri IVA e partitario;
- note credito con segno opposto;
- multi-aliquota;
- split payment;
- IVA per cassa documento e pagamento/incasso;
- reverse charge / autofatture / acquisti esteri;
- parcelle e ritenute;
- blocchi periodo definitivo;
- canonical mapper e persistence condivisa;
- controlli contro payload incompleti o incoerenti.

## Regressioni emerse dal nuovo gate e corrette

1. direzione IVA non determinabile: eliminato fallback implicito a vendite;
2. corrispettivi/solo IVA: niente apertura partitario implicita;
3. riga economica manual-required: non viene potata prima della scelta operatore;
4. ritenute: validazione usa il codice tributo risolto dall'anagrafica/configurazione;
5. fixture/test legacy riallineati al contratto canonico corrente senza allentare i requisiti.

## Vincoli

- nessuna migration;
- nessuna modifica a `.env`;
- nessuna modifica auth/RLS/policy;
- nessuna scrittura su società reali;
- nessun collaudo manuale dichiarato eseguito.

## Debito manuale

Registrato in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.

## Gate successivo

`CONSULTAZIONE-FREEZE`.
