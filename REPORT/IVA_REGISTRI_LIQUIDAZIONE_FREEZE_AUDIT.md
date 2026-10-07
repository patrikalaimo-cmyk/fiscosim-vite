# IVA / REGISTRI / LIQUIDAZIONE — FREEZE AUDIT

Data: 2026-10-07  
Branch: `mio-branch`

## Esito

Stato del blocco: **AUTOMATICO VERDE / MANUALE PENDENTE**.

Il freeze riguarda il percorso IVA operativo collegato alla contabilità canonica e alla Tax Compliance:
`registrazione canonica → registri_iva → dominio liquidazione → consolidamento transazionale`.

Non viene dichiarata la rimozione totale del legacy dal repository: esistono ancora percorsi storici basati su `accounting_entries`, ma non costituiscono il percorso Tax Compliance sottoposto a questo freeze.

## Audit iniziale

L'audit ha confermato:
- persistenza delle righe IVA da payload canonico;
- registri IVA separati per acquisti/vendite e supporto multi-aliquota;
- liquidazione periodica con split payment, IVA per cassa, reverse charge, crediti/acconti/interessi già modellati;
- consolidamento tramite RPC transazionale già presente nel repository;
- stampe/prospetti IVA basati sui registri.

Sono emersi quattro gap da chiudere prima del freeze.

### 1. Detraibilità esplicita zero

Nel dominio liquidazione era presente il fallback:
`row.iva_detraibile || row.iva`.

Con `iva_detraibile = 0`, JavaScript considerava lo zero falsy e usava l'IVA lorda, generando indebitamente IVA detraibile. Lo stesso difetto interessava la quota acquisti differita nell'IVA per cassa.

Correzione: lo zero esplicito viene ora preservato; il fallback all'IVA lorda avviene solo quando il valore detraibile è realmente assente.

### 2. Split payment nel dashboard

Il dominio produce `ivaSplitEsclusa`, mentre il dashboard cercava prioritariamente un campo diverso. Il dashboard ora usa il campo canonico del dominio e, per gli snapshot salvati, i campi consolidati reali.

### 3. Fallback dimostrativi in UI

Sono stati rimossi:
- conteggio registri `27` mostrato quando il valore reale era zero;
- nome operatore personale hardcoded nello storico;
- dicitura `Pro-rata: 100%` non derivata da una configurazione reale.

Il principio applicato è: nessun dato fiscale/operativo può essere inventato per riempire la UI.

### 4. Tenant scope

Sono stati rafforzati:
- lookup causali IVA limitato alla società attiva;
- snapshot della liquidazione richiesto con `liquidazioneId + societaId`;
- query snapshot filtrata anche per `societa_id`;
- lettura registri arricchita con dati documento/controparte realmente persistiti.

## Guard e regressioni

È stato introdotto il profilo ufficiale:
`npm run test:iva`.

La suite comprende 15 file e copre:
- liquidazione provvisoria e definitiva;
- IVA ordinaria acquisti/vendite;
- note credito e multi-aliquota;
- detraibilità/indetraibilità;
- split payment;
- IVA per cassa differita/rilasciata;
- reverse charge;
- aggregatori registri;
- RPC client/orchestrator;
- prospetti ed export;
- model registri;
- mapper IVA dal payload canonico;
- guard di freeze sul percorso Tax Compliance e sul tenant scope.

## Gate CI

Commit dati:
`e612ca03e75ae6aa11ff9b5b09686ce6cfc4826a`

Commit test:
`583d7d6b4cf3e3f24ba105ba321cf49ed10a6184`

GitHub Actions run:
`37680695367`

Esito Ubuntu e Windows:
- Import: **231/231 PASS**
- Manuale: **413/413 PASS**
- Consultazione: **38/38 PASS**
- IVA: **148/148 PASS**
- Core: **584/584 PASS**
- All safe: **959/959 PASS**
- Production build: **PASS**

## Vincoli rispettati

Durante il blocco:
- nessuna migration è stata applicata;
- nessun file `.env*` è stato modificato;
- nessuna auth/RLS/policy Supabase è stata modificata;
- nessuna società reale è stata letta o scritta;
- nessuna contabilizzazione autonoma è stata introdotta;
- Riconciliazione Bancaria non è stata avviata.

## Debito manuale

Il collaudo browser resta intenzionalmente pendente ed è tracciato in:
`REPORT/FISCOSIM_MANUAL_TEST_DEBT.md`.

Il gate automatico non equivale al collaudo utente finale.

## Decisione di freeze

Il blocco `IVA-REGISTRI-LIQUIDAZIONE` può essere congelato sul piano automatico.

Stato finale del blocco:
**AUTOMATICO VERDE / MANUALE PENDENTE**.

Prossimo blocco A100:
**SPLIT-SIMPLE**.

La Riconciliazione Bancaria resta **BLOCCATA** secondo il gate già stabilito.
