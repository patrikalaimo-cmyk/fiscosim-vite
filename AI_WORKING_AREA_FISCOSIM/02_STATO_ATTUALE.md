# STATO ATTUALE DEGLI ADEMPIMENTI E MODULI

Il punto nave sulle funzionalità contabili e fiscali implementate in FiscoSim:

## 1. Moduli Core Completati (Studio-Grade)
* **Registrazione Manuale Avanzata**: Supporto completo a contabilità ordinaria, ritenute, split payment e IVA per cassa.
* **Consultazione Prima Nota**: Hardening completo del workflow di visualizzazione e check di integrità referenziale.
* **Integrità Contabile**: Introdotto il workflow per storno o annullamento logico invece di cancellazione fisica/reinserimento.
* **Autenticazione & Tenancy (RLS)**: Ripristinato l'accesso e l'isolamento societario per `utenti_studio.auth_user_id` e sessioni Supabase Auth (commit `c3d3e3a`).
* **Visual Encoding IVA**: Corretti tutti i Mojibake e cornici box-drawing danneggiate nella UI del modulo Adempimenti (commit `6dd7608`).

## 2. Moduli in Corso di Sviluppo (Liquidazione IVA Definitiva)
* **Fase 1 (Schema & Dominio)**: Completato (commit `4387bb3`).
  * Creata la migrazione additiva `20260612150000_liquidazione_iva_definitiva_fase1.sql`.
  * Creato il domain service puro `calcoloLiquidazioneIvaDefinitiva.js`.
  * Creata la suite di test unitari con 16 scenari di calcolo coperti al 100%.
* **Fase 2 (Repository & RPC)**: Previsto lo sviluppo delle query di lettura/scrittura e della funzione RPC transazionale Supabase per il consolidamento definitivo.

## 3. Moduli da Sviluppare / Completare
* **LIPE**: Comunicazioni Periodiche IVA (prospetti ed export XML).
* **F24**: Deleghe di pagamento collegate alle liquidazioni.
* **Dichiarazione IVA Annuale**: Calcolo dei quadri di sintesi (VE, VF, VL).
* **Riconciliazione Bancaria**: Rework/allineamento dopo aver blindato i vincoli di prima nota.
* **Import Contabilità (SDI)**: Integrazione dei flussi fatture elettroniche con generazione automatica delle registrazioni manuali.
