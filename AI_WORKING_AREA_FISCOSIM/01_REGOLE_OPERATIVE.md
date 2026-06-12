# REGOLE OPERATIVE AI

L'AI IDE deve attenersi rigidamente alle seguenti regole operative nello sviluppo di FiscoSim:

1. **Perimetro di lavoro**:
   * Lavorare esclusivamente all'interno della cartella `C:\Users\patri\Desktop\fiscosim-viteBACKUPAntigravity`.
   * Non effettuare modifiche a file di configurazione, ambiente (`.env`, `.env.local`, `.env.example`), Supabase live, policy RLS o logiche di login/auth senza esplicito permesso.

2. **Sicurezza e Integrità**:
   * Prima di iniziare qualsiasi modifica di codice, eseguire `git status --short` per verificare lo stato di partenza.
   * È tassativamente vietato l'uso di `git add .`. Gli staging e i commit devono essere selettivi e puntuali.
   * Non usare mai i comandi distruttivi di git (`git checkout`, `git restore`, `git reset`, `git revert`) senza preventiva validazione delle modifiche.
   * Non creare script volanti o file temporanei all'interno della cartella `scratch/` salvo necessità di audit temporaneo ed eliminazione immediata prima di chiudere il prompt.

3. **Infrastruttura di Sviluppo**:
   * Non creare soluzioni provvisorie, workaround fragili o campi temporanei. Se si apre una funzionalità contabile, va progettata e implementata nella sua versione definitiva Studio-Grade.
   * I dati e le società utilizzate per i test devono essere rigorosamente fittizi o controllati: non usare società reali per test di scrittura o modifiche sul DB remoto.

4. **Documentazione e Comunicazione**:
   * Ogni singola attività completata deve aggiornare il file `REPORT/REPORT_CODEX.md` in modalità append-only.
   * Se l'attività altera lo stato contabile o l'architettura, deve essere aggiornato anche il relativo file nella cartella `AI_WORKING_AREA_FISCOSIM/`.
   * La chat dell'AI deve essere sintetica. Il report di testo per esteso va memorizzato nei file di log su disco, mentre la chat riassume solo l'esito, i file toccati, i test superati e il prossimo step operativo.
