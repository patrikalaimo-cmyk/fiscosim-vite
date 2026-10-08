# STAMPE-EXPORT-FASCICOLO — AUDIT E GATE PARZIALE

Data: 2026-10-08
Stato: **IN CORSO — BLOCCO NON CONGELATO**.

## Contratto A100

Gli output di studio devono derivare dalle scritture canoniche della società e del periodo selezionati. Non è consentito presentare dati demo come saldi reali, né marcare provvisorio come definitivo.

Obiettivo finale del blocco:
- registri IVA acquisti/vendite/corrispettivi;
- libro giornale, mastrini, bilancio di verifica, partitario, registro ritenute;
- CSV/XLSX e stampe PDF coerenti;
- fascicolo cliente PDF unico;
- separazione provvisorio/definitivo;
- società, periodo, data, stato, versione/checksum e audit.

## Audit iniziale

Percorsi realmente alimentati da dati contabili:
- registri IVA: `getRegistriIvaPerStampa` → `buildRegistroIvaRowsModel` → export provvisorio;
- giornale: `getLibroGiornalePerStampa` → `buildLibroGiornaleModel` → export provvisorio;
- consolidamento: precheck + RPC tramite `StampaDefinitivaPanel`; la conformità completa del contenuto hash è ancora da verificare.

Percorsi non realmente operativi:
- Partitari/Mastrini/Bilancio nella vista Stampe conservano dati fac-simile storici.
- Il fascicolo PDF unico di fine periodo non è ancora generato da modelli canonici.

## Hardening applicato

1. Intercettato l'accesso da `StampeView` ai tre tab fac-simile; al loro posto si espone un messaggio non operativo senza saldi campione. Il relativo codice demo resta da rimuovere durante il completamento funzionale.
2. Gli arricchimenti `causali_iva` e `prima_nota` dei registri IVA applicano esplicitamente `societa_id`.
3. Se la classificazione vendite/corrispettivi perde una relazione PN o una query di arricchimento fallisce, il registro non viene restituito come se fosse completo.
4. I periodi con almeno 1000 righe o scritture non vengono esportati con troncamento silenzioso: blocco temporaneo in attesa di paginazione completa.
5. Gli HTML provvisori non riportano più il falso contatore `Pagina 1 di 1`; la paginazione resta a cura del browser.
6. Introdotto profilo automatico `test:stampe` e relativo step CI su Ubuntu e Windows.

## Gap residui bloccanti per il freeze

- **Fascicolo PDF unico**: non realizzato.
- **Dati canonici per Mastrini, Bilancio e Partitario**: non ancora collegati nella vista Stampe.
- **Export voluminosi**: oggi bloccati per sicurezza oltre la soglia; serve paginazione completa senza perdita di righe e test >1000.
- **Checksum definitivo**: `generateStampaChecksum` riceve società, tipo, anno, periodo, timestamp, numero righe e totale; non riceve le righe/byte effettivamente stampati. Non dimostra pertanto l'inalterabilità dell'output e deve essere ricondotto al contenuto finale verificabile.
- **Pagine e definitività**: numerazione reale e audit ristampa/lock da collaudare contro database di test.
- **Simulate/Stornate nel Giornale**: restano una selezione per anteprima, non devono transitare nella stampa fiscale definitiva come ordinario senza esplicita policy.
- **Mock storici**: diventati non raggiungibili nell'entrypoint Stampe, ma ancora fisicamente nel sorgente; rimozione completa da effettuare.

## Regole di sicurezza

- Nessuna migration applicata.
- Nessun auth/RLS/policy modificato.
- Nessuna modifica a .env.
- Nessuna società reale toccata.
- Riconciliazione Bancaria ancora **BLOCCATA**.

Questo documento fotografa **un hardening intermedio**, non un freeze e non una dichiarazione A100.


## Addendum 2026-10-08 — Paginazione completa

Il blocco a 999 righe introdotto come protezione temporanea è sostituito dall'helper `fetchAllStampeRows`: letture `range` da 500, ordinamento stabile con tie-breaker ID, fail-closed su errore/doppione/pagina invalida, batch da 100 per arricchimenti causale/PN e righe del giornale.

Evidenza sintetica: fixture oltre 1000 righe, errore a metà, doppione, multiplo esatto e limite di paginazione.

**Non chiude il freeze.** Residui: verifica dello snapshot sotto modifiche concorrenti, PDF fascicolo unico, report canonici di Mastrini/Bilancio/Partitario, hash su contenuti di stampa, test browser e PDF.


## Addendum 2026-10-08 — Export sicuro e modello saldi di movimentazione

- `d0bb3ed` CI `37738239233` SUCCESS: stringhe CSV potenzialmente interpretabili come formule (inizio `=`, `+`, `-`, `@`, anche precedute da whitespace) vengono rese testo prima dell'escaping CSV. Test fittizi su Registro IVA e Libro Giornale.
- `5524709` CI `37738561308` SUCCESS: creato modello puro di aggregazione per conto su PN canonica; verifica quadratura in centesimi, coerenza di società/periodo, stato confermato/definitivo, anagrafica conto e riferimenti univoci. Il modello produce saldi di **movimentazione nel periodo** e progressivi analitici, non saldo di apertura.
- L'output è deliberatamente `definitive: false` e porta warning esplicito per saldo iniziale/esercizi precedenti non ricostruiti. Nessuna UI sostituita con un presunto bilancio reale.
- Restano bloccanti: base saldi iniziali e classificazione piano dei conti, integrazione UI e stampe reali, fascicolo PDF unico, checksum del contenuto, controllo snapshot e collaudo.
- Il perimetro Bank resta in sola simulazione; sviluppo sbloccato, commit reale non autorizzato.


## Addendum 2026-10-08 — Saldi per conto e progressivi intraesercizio

Nuovo `buildSaldiPerContoEsercizioModel` (dominio application): da testate/righe Prima Nota canoniche all'interno dello stesso esercizio distingue saldi precedenti e movimenti periodo; aggancia piano dei conti per natura patrimoniale/economica e conti terminali. Restituisce saldi finali, progressivi e quadratura al centesimo. Rifiuta classi conto sconosciute, differenze di società, conti mancanti/doppi, periodi inesistenti, movimenti su conto non foglia, gerarchie cicliche e squadrature.

Questo **non** risolve saldi d'apertura derivanti da chiusura/riapertura esercizio precedente: i campi precalcolati `saldo_iniziale` del piano conti non sono una base verificata; l'algoritmo li ignora. Anche quando il modello è matematicamente valido, `definitive: false` e avvisi impediscono di promuoverlo a bilancio definitivo. Lettura/snapshot e UI non integrate, fascicolo PDF e checksum ancora mancanti.

Test sintetici inclusi in `test:stampe`; CI del commit in corso di verifica. Nessun gate finale dichiarato.


## Gate automatico addendum saldi intraesercizio

Commit `1ec940c` verificato in GitHub Actions run `37766190172`: **SUCCESS** Windows e Ubuntu; `test:stampe` **61/61**, `test:all` **1004/1004**, build PASS. Stato modulo invariato **IN CORSO / NON FREEZE** fino a chiusura saldi d'apertura verificati, UI/export/PDF e collaudi.

## Addendum 2026-10-08 — raccordo inter-esercizio e mastrini ID/codice

Implementato `auditRaccordoEserciziModel` in sola lettura: esige causali apertura/chiusura canoniche tramite `causale_id`, ID espliciti delle chiusure patrimoniali e PN dell'esercizio precedente; controlla azzeramento del precedente, economici esclusi dalla chiusura patrimoniale e saldi della riapertura opposti per conto. Non sostituisce una procedura contabile reale, né dimostra completezza/snapshot, perciò non promuove il bilancio a stampa definitiva. Il report precedente della sola movimentazione infrannuale resta non certificato.
Corretto anche l'ordinamento dei saldi progressivi quando PN storiche usano alternativamente `conto_id` e `conto_codice`: l'aggregazione per conto precede ora il sorting cronologico.
Fascicolo unico, UI Bilancio/Mastri/Partitario, checksum, snapshot e QA PDF ancora NON FREEZE.

## Addendum 2026-10-08 — repository evidence storico

Nuovo loader read-only per il raccordo: query società filtrate per PN precedente completo, aperture per ID, conti e causali compresi inattivi storici, righe PN paginated e join in batch; indisponibilità di righe ed errori di lettura bloccano. Wrapper in `contabilitaRepo`. Non è una sorgente transazionale serializzabile: `snapshotCertified` e `completenessCertified` restano falsi anche in presenza di audit contabile localmente valido. Nessuna UI o definitiva sbloccata.

## Addendum 2026-10-08 — hash file reale, utility indipendente

Aggiunto `hashStampaContenuto` (SHA-256, input `Uint8Array`/`ArrayBuffer`), che fallisce esplicitamente senza bytes del documento o provider WebCrypto. Identità del file, tipo stampa e periodo inclusi nel digest; non più soltanto il numero righe o timestamp. **L'utility non è ancora usata dal componente `StampaDefinitivaPanel` e non corregge da sola il consolidamento storico metadata-only.** Occorrono byte finali effettivamente archiviati, acquisizione in transazione/snapshot, hash verificato server-side, versionamento e test E2E; STAMPE NON FREEZE.
