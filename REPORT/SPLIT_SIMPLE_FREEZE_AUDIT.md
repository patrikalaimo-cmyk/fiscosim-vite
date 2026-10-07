# SPLIT-SIMPLE-FREEZE — AUDIT

Data: 2026-10-08

## Obiettivo

Congelare il caso operativo semplice di split payment nel percorso contabile canonico, senza trasformarlo in un motore fiscale generico.

Perimetro:
- fattura attiva verso cliente soggetto a split payment;
- nota credito attiva coerente con lo stesso trattamento;
- registrazione Manuale e Import riallineati;
- registro IVA vendite e liquidazione;
- partitario cliente al solo importo incassabile;
- conto tecnico split configurato, mai inventato.

Fuori perimetro del freeze:
- casistiche avanzate o eccezionali non già modellate;
- invii telematici;
- modifiche schema/migration;
- società reali.

## Audit del codice

Catena verificata:
1. `resolveRegistrazioneSplitPayment` attiva il trattamento solo per documento IVA attivo compatibile e presenza di flag su controparte/documento.
2. `buildSplitPaymentRows` elimina la riga IVA ordinaria dalla prima nota, riduce la controparte all'imponibile e genera le due righe tecniche quadrate sul conto split configurato.
3. `buildRegistrazionePartitarioDraft` usa `splitPaymentImportoIncassabile` e apre la partita sul solo imponibile.
4. Le righe IVA mantengono il flag `splitPayment`.
5. La persistenza registra il flag in `registri_iva`.
6. La liquidazione espone l'IVA split separatamente e la sottrae dal debito effettivo.

## Difetto trovato e corretto

Il percorso Import preservava già il lato contabile della controparte:
- fattura attiva: cliente in Dare;
- nota credito attiva: cliente in Avere.

Nel percorso Manuale, `buildSplitPaymentRows` sostituiva invece sempre la riga controparte con:
- Dare = imponibile;
- Avere = 0.

Poiché il resolver ammette anche `isNotaCreditoAttiva`, questa divergenza poteva produrre una nota credito split con segno contabile errato.

Correzione:
- il builder legge il lato originario della riga controparte;
- se la controparte era in Avere, mantiene Avere = imponibile;
- altrimenti mantiene il comportamento ordinario Dare = imponibile.

La fattura attiva ordinaria non cambia.

## Gate automatico

Commit codice:
`91d2365a2efa9a19f099bde61fc12a95a1bd162d`

GitHub Actions:
`37695652369`

Esito:
- Ubuntu: PASS;
- Windows: PASS;
- Import: PASS;
- Manuale: PASS;
- Consultazione: PASS;
- IVA: PASS;
- Split: PASS;
- Core: PASS;
- All safe: PASS;
- build: PASS.

Profilo Split:
- 3 file;
- 25 test;
- PASS su entrambi i sistemi operativi.

## Sicurezza e vincoli

Non sono state:
- applicate migration;
- modificate policy RLS/auth;
- modificate variabili env;
- eseguite scritture su società reali;
- avviate attività di Riconciliazione Bancaria.

## Stato

**AUTOMATICO VERDE / MANUALE PENDENTE**

Il collaudo browser è differito e tracciato in `REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.

Prossimo blocco A100:
**RITENUTE-SCADENZARIO**.

Riconciliazione Bancaria:
**BLOCCATA**.
