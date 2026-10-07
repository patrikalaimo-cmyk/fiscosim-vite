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
