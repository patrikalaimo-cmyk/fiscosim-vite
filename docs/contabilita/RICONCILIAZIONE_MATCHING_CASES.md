# Riconciliazione Matching Cases

Questo documento descrive il dataset mock per la futura riconciliazione bancaria. Non contiene logica di matching, commit, UI o accesso DB.

## Contenuto

- Movimenti bancari importati mock.
- Partite aperte clienti, fornitori e percipiente.
- Casi attesi per match, classificazione diretta, giroconto, F24, spese bancarie, casi ambigui e bloccanti.
- Impatti contabili e fiscali attesi solo in forma concettuale.

## File di riferimento

- [src/modules/contabilita/components/riconciliazione/riconciliazioneMatchingFixtures.js](../../src/modules/contabilita/components/riconciliazione/riconciliazioneMatchingFixtures.js)

## Struttura movimento bancario mock

```js
{
  movementId,
  bankAccountId,
  bankAccountCode,
  operationDate,
  valueDate,
  direction,
  amount,
  descriptionRaw,
  descriptionNormalized,
  counterpartyName,
  counterpartyIban,
  bankCausal,
  sourceStatementId,
  confidence,
  status,
}
```

Valori ammessi:

- `direction`: `in`, `out`
- `status`: `imported`, `needs_review`, `ignored`, `blocked`

## Struttura partita aperta mock

```js
{
  partitaId,
  soggettoId,
  soggettoTipo,
  soggettoNome,
  documentoId,
  documentoTipo,
  numeroDocumento,
  dataDocumento,
  dataScadenza,
  importoOriginario,
  importoAperto,
  contoPatrimonialeId,
  contoPatrimonialeCodice,
  contoPatrimonialeDescrizione,
  causaleOrigine,
  ivaPerCassa,
  ritenuta,
  statoPartita,
}
```

Valori ammessi:

- `soggettoTipo`: `cliente`, `fornitore`, `percipiente`
- `documentoTipo`: `fattura_cliente`, `fattura_fornitore`, `parcella_professionista`, `nota_credito`, `altro`
- `statoPartita`: `aperta`, `parzialmente_chiusa`, `scaduta`, `contestata`

## Struttura expected decision

```js
{
  caseId,
  movementId,
  expectedDecisionType,
  expectedMovementType,
  expectedMatchType,
  expectedPartitaId,
  expectedConfidence,
  expectedWarnings,
  expectedBlockers,
  expectedAccountingProposal,
  cashVatImpact,
  withholdingPaymentProposal,
}
```

## Casi coperti

- A. Incasso cliente perfetto
- B. Pagamento fornitore perfetto
- C. Pagamento parziale fornitore
- D. Incasso parziale cliente
- E. Pagamento cumulativo fornitori
- F. Incasso cliente ambiguo
- G. Spesa bancaria
- H. F24
- I. Giroconto
- J. Parcella professionista con ritenuta
- K. IVA per cassa su incasso cliente
- L. IVA per cassa su pagamento fornitore
- M. Movimento senza match
- N. Movimento duplicato potenziale
- O. Movimento da ignorare

## Uso previsto nella fase successiva

La fase di matching potrà leggere questo dataset per:

- generare working rows di test;
- validare decisioni operatore;
- testare warning/blocchi;
- verificare impatti contabili e fiscali attesi.

La logica di matching reale resterà separata e non dipenderà da questo file.