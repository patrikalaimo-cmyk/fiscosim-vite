# CORE-CLOSURE-12 — Audit funzionale avanzato vincolante dei 4 moduli motore

## Verdetto generale

No: i 4 moduli non sono ancora da considerare completi come gestionale contabile italiano avanzato.

La base tecnica e il perimetro canonico sono forti, ma la chiusura funzionale reale non e' ancora raggiunta perche' manca ancora il commit atomico reale condiviso e restano casistiche fiscali/operative importanti non chiuse, soprattutto nel flusso import e nel flusso di registrazione manuale.

Il quadro corretto e': baseline protetta, funzionalita' operative avanzate in buona parte presenti, ma chiusura gestionale finale ancora incompleta.

## Tabella sintetica

| Modulo | Stabilita' tecnica | Completezza funzionale | Blocco principale | Stato |
| --- | --- | --- | --- | --- |
| Registrazione manuale | Alta | Media | salvataggio reale ancora bloccato e commit canonico non operativo | Parziale |
| Import Contabilita' | Alta | Media | commit workflow non implementato e casistiche fiscali avanzate non gestite | Parziale |
| Riconciliazione bancaria | Alta | Medio-alta | commit reale assente e copertura completa delle casistiche ancora incompleta | Parziale avanzato |
| Consultazione Prima Nota | Alta | Alta per il solo read-only | nessun write path; il modulo e' corretto ma resta read-only per definizione | Completo nel suo perimetro |

## Analisi per modulo

### 1. Registrazione manuale

Presente: payload canonico, build commit input, pipeline prima nota, validazione e mock path.

Parziale: il flusso reale e' ancora disabilitato, il path operativo resta protetto da guardrail e il commit canonico finale non e' ancora il motore reale condiviso.

Mancante: commit atomico reale, audit persistente del commit, idempotenza materializzata, chiusura completa del path write.

P0: sblocco del salvataggio reale su contratto canonico condiviso; allineamento tra validazione UI, payload e commit.

P1: copertura completa delle casistiche fiscali e contabili che oggi restano fuori dal flusso base.

P2: rifiniture UX e semplificazioni operative.

Test necessari: retry/doppio click, rollback, idempotency replay, persistenza audit, no regression sul mock path.

Stima prompt/block: 2-3 blocchi.

### 2. Import Contabilita'

Presente: parsing, staging, deduplica, working view, build payload canonico, dry-run/match del commit, readiness summary.

Parziale: il flusso di import e' molto piu' maturo del baseline, ma il commit finale resta non implementato e il payload blocca ancora alcune casistiche fiscali avanzate.

Mancante: commit workflow reale, handling operativo completo di ritenute/reverse/estero/IVA per cassa, audit persistente del commit.

P0: implementare il commit reale del flusso import e chiudere le casistiche che oggi vengono esplicitamente bloccate.

P1: copertura di note credito, autofatture, percipienti e casi intermedi se non gia' ricompresi nel contratto finale.

P2: miglioramenti di reporting e classificazione residua.

Test necessari: workflow import end-to-end, blocco duplicate, casistiche fiscalmente complesse, commit replay, rollback, no regression sui blocchi noti.

Stima prompt/block: 3-4 blocchi.

### 3. Riconciliazione bancaria

Presente: classificazione movimenti, proposta decisionale, validazione, mapping canonico, supporto a f24, giroconto, parcella, spesa bancaria, pagamento fornitore, incasso cliente, ignorati e candidate cumulativi.

Parziale: la logica funzionale e' buona e piu' vicina alla chiusura rispetto agli altri moduli, ma il commit reale non esiste ancora e alcune derive fiscali restano solo concettuali o parzialmente presidiate.

Mancante: commit atomico reale della decisione, persistenza audit, chiusura definitiva di cash VAT e withholding nel flusso operativo reale.

P0: commit reale condiviso e validazione di tutte le decisioni che producono effetti contabili.

P1: consolidamento dei casi con IVA per cassa, ritenuta e partitario parziale/cumulativo.

P2: affinamento delle euristiche di matching e dell'esperienza operatore.

Test necessari: decisione accettata/blocked/ignored, cash VAT completeness, withholding completeness, replay idempotente, rollback, casi cumulativi.

Stima prompt/block: 2-3 blocchi.

### 4. Consultazione Prima Nota

Presente: filtri, search, summary, saldo progressivo, export CSV, view model per lista/dettaglio/mastrino, UI read-only esplicita.

Parziale: non ha e non deve avere write path diretti; rispetto al suo perimetro e' gia' molto solido.

Mancante: niente sul piano read-only; eventuali write future devono passare dal flusso canonico comune.

P0: nessuno sul perimetro read-only.

P1: eventuale miglioramento di drill-down e integrazione con i flussi canonici.

P2: rifiniture di visualizzazione e export.

Test necessari: regressione read-only, export, filtri, saldo progressivo, blocco azioni di modifica/storno/partitario.

Stima prompt/block: 0-1 blocco solo se si vuole aggiungere integrazione futura.

## P0 matrix unica

| P0 | Moduli coinvolti | Perche' e' P0 | Criterio di chiusura |
| --- | --- | --- | --- |
| Commit atomico reale condiviso | Registrazione manuale, Import Contabilita', Riconciliazione bancaria | senza questo i write path restano non affidabili e non replay-safe | una sola RPC/funzione atomica con rollback, idempotenza e audit persistente |
| Idempotenza persistente e audit commit | Registrazione manuale, Import Contabilita', Riconciliazione bancaria | senza persistenza il retry non e' operativamente sicuro | replay deterministico con audit salvato e chiavi persistenti |
| Chiusura casistiche fiscali bloccate | Import Contabilita', in parte Riconciliazione bancaria | ritenuta, reverse/estero, IVA per cassa e casi affini sono ancora fuori dal nucleo pieno | le casistiche sono o supportate o ricondotte a un fallback esplicito e verificato |
| Sblocco del write path manuale | Registrazione manuale | il flusso resta protetto e non operativo a fine catena | salvataggio reale canonico attivo con test di rollback e retry |
| Commit operativo della riconciliazione | Riconciliazione bancaria | la decisione deve produrre effetti reali in modo atomico | decisione validata, commit eseguito, audit e replay coerenti |

## Sequenza consigliata per CORE-CLOSURE-13, 14, 15...

### CORE-CLOSURE-13

Obiettivo: mettere in produzione il motore di commit atomico reale condiviso, con idempotenza persistente e audit persistente.

Moduli: base comune per registrazione manuale, import e riconciliazione.

Output atteso: una sola funzione/ RPC canonica, rollback reale, replay deterministico, test di concorrenza e doppio click.

### CORE-CLOSURE-14

Obiettivo: chiudere il write path della registrazione manuale sul nuovo motore atomico.

Moduli: registrazione manuale.

Output atteso: salvataggio reale, validazione completa, regressione su draft/mock, audit persistente.

### CORE-CLOSURE-15

Obiettivo: chiudere il commit dell'Import Contabilita' e rimuovere i blocchi sulle casistiche gia' previste dal dominio.

Moduli: import contabilita'.

Output atteso: import end-to-end con commit reale, duplicate handling robusto, casistiche fiscali gestite o bloccate con motivazione definitiva.

### CORE-CLOSURE-16

Obiettivo: rendere operativa la riconciliazione bancaria sul commit atomico reale.

Moduli: riconciliazione bancaria.

Output atteso: decisione validata, commit, audit, retry sicuro, gestione coerente di f24, giroconto, parcella, IVA per cassa e ritenuta.

### CORE-CLOSURE-17

Obiettivo: hardening finale e regressione di consultazione e integrazioni trasversali.

Moduli: consultazione prima nota e integrazione read models.

Output atteso: nessuna regressione read-only, export stabile, filtri e saldo progressivo invariati, nessun write path introdotto per errore.

## Stima prompt/block complessiva

Stima ragionevole per la chiusura funzionale avanzata: 7-11 blocchi di lavoro focalizzati.

La fascia minima vale solo se il commit atomico comune viene introdotto senza attriti e senza scoprire ulteriori casistiche fiscali nascoste.

## Decisione strategica

Scelta consigliata: mixed approach.

Motivo: il blocco centrale e' il commit atomico reale, ma non ha senso aspettarlo da solo senza chiudere subito i P0 specifici dei moduli write-heavy. La priorita' pratica resta "missing P0 first", con il motore atomico come primo blocco comune e le casistiche mancanti subito dopo.

## Conclusione operativa

Il sistema non e' ancora da dichiarare "advanced gestionale completo". E' una baseline tecnica forte con moduli gia' maturi, ma la chiusura vera richiede ancora almeno un ciclo di commit atomico reale + P0 funzionali per registrazione, import e riconciliazione.