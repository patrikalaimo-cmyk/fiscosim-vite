# STATO ATTUALE DEGLI ADEMPIMENTI E MODULI

Il punto nave sulle funzionalità contabili e fiscali implementate in FiscoSim, aggiornato con le ultime decisioni di limitazione perimetro:

## 1. Moduli Core Completati (Studio-Grade)
* **Registrazione Manuale Avanzata**: Supporto completo a contabilità ordinaria, ritenute, split payment e IVA per cassa.
* **Consultazione Prima Nota**: Hardening completo del workflow di visualizzazione e check di integrità referenziale.
* **Integrità Contabile**: Introdotte le guardie referenziali, il workflow per lo storno contabile o l'annullamento logico guidato invece della cancellazione fisica silente.
* **Autenticazione & Tenancy (RLS)**: Ripristinato l'accesso e l'isolamento societario per `utenti_studio.auth_user_id` e sessioni Supabase Auth.
* **Liquidazione IVA Definitiva e Chiusura Operativa Storico/Stati/Export**: Completati gli algoritmi di calcolo, l'RPC PostgreSQL di consolidamento, i controlli di blocco definitiva/conferma provvisoria, il fallback condizionato sui totali consolidati storici e le stampe/export conformi (CSV, HTML, XLSX e comunicazione cliente con F24).

## 2. Moduli in Corso di Sviluppo (Registri IVA e Stampe Definite)
* **Registri IVA e stampe definitive (Prossima Fase - 13)**: Meccanismo di numerazione e blocco del periodo post-stampa.

## 3. Moduli da Sviluppare / Completare (Perimetro Riallineato)
* **Import Contabilità (Fasi 14-15)**: Portale principale di ingresso dei documenti da allineare alle causali del manuale.
* **Libro Cespiti Leggero (Fase 16)**: Gestione anagrafica e quote cespiti, integrato con messaggi di alert su inserimento manuale/import, suggest basate sullo storico.
* **Partitario & Pagamenti (Fase 17)**: Gestione scadenze e scadenziari avanzati.
* **Ritenute e Adempimenti CU/770 (Fase 18)**: Integrazione del controllo ritenute incrociato con i versamenti F24 importati (cod. tributo 1040).
* **Riconciliazione Bancaria (Fase 19)**: Matching automatico transazioni-partite che genera prima nota in formato canonico.
* **Reverse Charge / Estero Limato (Fase 20-21)**: Integrazione delle doppie registrazioni acquisti/vendite per UE/extra-UE governate da policy causali, con partitario all'imponibile.
* **Modifiche / Annulli pragmatici (Fase 22)**: Avvisi graduati e salvaguardia per la cancellazione o la modifica di scritture.
* **Bilancio e Situazioni (Fase 23)**: Mastrini e bilancio di verifica quadrato.
* **Scadenzario F24 clienti Entratel (Fase 24)**: Visualizzazione scadenze e deleghe inviate via Entratel con storico ricorrenze visuale (verde). No modulo compilazione ministeriale F24.
* **Stampe e Fascicolo Cliente (Fase 25)**: Export PDF unico di fine periodo.
* **Admin & Riaperture Periodo Chiuso (Fase 26)**: Gestione delle eccezioni per periodi chiusi con backup, log e autorizzazione Admin/Owner.
* **Scarico Massivo AdE**: Rimosso dalla roadmap principale; distaccato come modulo strumentale/esterno. L'import effettivo avverrà tramite il modulo di Import Contabilità.
