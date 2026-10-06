# FINAL-COMMIT-19A - Perimetro tecnico Registrazione manuale IVA semplice

## 1. Stato iniziale da FINAL-COMMIT-18

FINAL-COMMIT-18 e' chiusa con verdetto A. Risultato consolidato:

- Registrazione manuale non IVA consolidata.
- Primo commit reale locale riuscito.
- Replay idempotente verificato.
- Cleanup idempotente.
- Rollback verificato.
- Zero residui finali.
- Nessun DB remoto.
- Nessuna UI.
- Nessun Import Contabilita.
- Nessuna Riconciliazione.
- Guard finali verdi.
- Build verde.

Lo smoke locale non IVA e' quindi un punto fermo gia' validato.

## 2. Scenario IVA semplice proposto

Primo scenario IVA ammesso per la Registrazione manuale:

- source_module = `manual_registration`
- scenario = `simple_iva_22`
- una sola aliquota
- aliquota 22%
- imponibile 100
- IVA 22
- totale 122
- nessun documento_contabilita
- nessun documenti_import
- nessun partitario
- nessuna ritenuta
- nessun reverse charge
- nessuna IVA per cassa
- nessuno split payment
- nessun movimento bancario

Idempotency key proposta:

- `manual-smoke-local-simple-iva-22-v1`

## 3. Payload minimo IVA

L'analisi del codice mostra che il payload canonical della Registrazione manuale supporta gia' una sezione IVA strutturata.

Campi IVA supportati:

- `vat.enabled`
- `vat.rows`
- `vat.registerType`
- `vat.aliquota`
- `vat.natura`
- `vat.imponibile`
- `vat.imposta`
- `vat.detraibilitaPercent`
- `vat.indetraibileAmount`
- `vat.splitPayment`
- `vat.reverseCharge`
- `vat.ivaPerCassa`
- `vat.proRata`
- `vat.autofattura`
- `vat.integrazioneEstero`

Per lo scenario semplice IVA 22 il payload minimo atteso e':

- `vat.enabled = true`
- `vat.registerType` coerente con gli acquisti/operazioni previste
- una singola riga IVA
- `imponibile = 100`
- `aliquota = 22`
- `imposta = 22`
- `natura = null`
- `detraibilitaPercent` coerente con il caso semplice
- nessuna complessita' aggiuntiva

## 4. Righe contabili attese

Schema contabile di riferimento da validare nel futuro smoke IVA:

1. Dare costo/imponibile: 100
2. Dare IVA a credito: 22
3. Avere debito/contropartita: 122

Se il canonical finale prevede una separazione diversa tra righe contabili e righe IVA, la struttura dovra' comunque risultare quadrata e coerente con il payload.

## 5. Riga registro IVA attesa

La migrazione locale mostra che la tabella `registri_iva` esiste ed e' scrivibile nel perimetro locale.

Per lo scenario semplice IVA ci si aspetta una riga `registri_iva` coerente con:

- documento/commit locale
- imponibile 100
- IVA 22
- aliquota 22
- tipo coerente
- detraibilita' coerente
- causale IVA 22%

## 6. Tabelle toccabili

Solo nel futuro execute locale, e solo per questo scenario:

- `canonical_accounting_commit_audit`
- `prima_nota`
- `prima_nota_righe`
- `registri_iva`

## 7. Tabelle vietate

Resta vietato toccare:

- `documenti_contabilita`
- `documenti_import`
- `partitario`
- `partitari`
- `movimenti_bancari`
- `riconciliazione`
- `liquidazione_iva`
- `liquidazioni_iva_righe`
- `f24`
- `percipienti`
- `ritenute`
- `certificazioni_uniche`
- tabelle AI/memoria
- qualunque remoto

## 8. Seed eventualmente necessari

L'audit tecnico indica che, per passare dal perimetro tecnico al primo execute IVA, e' probabile servano seed locali coerenti per:

- conto costo
- conto IVA
- conto debito/fornitore generico
- causale IVA 22%

Se questi seed non sono gia' presenti e consistenti nel locale, il futuro 19B non dovrebbe partire.

## 9. Cleanup / rollback richiesto

Lo smoke locale IVA dovra' includere:

- cleanup idempotente
- rollback completo
- rimozione di:
  - `prima_nota`
  - `prima_nota_righe`
  - `registri_iva`
  - audit locale correlato
- zero residui finali

Il cleanup dovra' funzionare anche se uno smoke fallisce a meta'.

## 10. Idempotency key

La chiave proposta per lo scenario IVA semplice e':

- `manual-smoke-local-simple-iva-22-v1`

Requisiti:

- diversa dallo scenario non IVA
- locale-only
- usata per preflight, replay e cleanup

## 11. Rischi contabili / fiscali

Rischi principali prima di autorizzare l'execute IVA:

- impostazione errata dell'aliquota
- registri IVA non allineati ai seed locali
- conti IVA/costo non coerenti
- riga contabile non quadrata
- duplicazioni se il replay non viene bloccato
- cleanup incompleto su `registri_iva`

## 12. Rischi tecnici

Rischi tecnici principali:

- il path reale di commit risulta ancora review-ready / bloccato a livello servizio
- il canonical service mostra ancora logica non completamente implementata per il real commit
- serve confermare che lo script IVA possa riusare la stessa struttura dello smoke non IVA senza rompere i guard
- serve verificare che il cleanup copra anche `registri_iva`

## 13. Decisione

Stato attuale del perimetro IVA semplice:

- supporto canonical e schema locale: presente
- real commit path: non ancora autorizzato / non ancora maturo
- seed locali: probabilmente necessari o comunque da verificare

Decisione:

- `19B` non autorizzabile ancora come execute reale
- necessaria preparazione minima su seed e hardening dello smoke IVA

## 14. Verdetto

Verdetto finale per FINAL-COMMIT-19A:

- **B**

Motivo:

- lo scenario IVA semplice e' tecnicamente rappresentabile nel payload canonical e nello schema locale
- ma il percorso di commit reale e il set di seed IVA non risultano ancora pronti per l'execute
- serve una fase preparatoria minima prima del primo smoke reale locale IVA

