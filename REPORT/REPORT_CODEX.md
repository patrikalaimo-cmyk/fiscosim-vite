

## 2026-10-07 — IVA-REGISTRI-LIQUIDAZIONE / code gate verde e formalizzazione freeze

- Commit hardening dati: `e612ca03e75ae6aa11ff9b5b09686ce6cfc4826a`.
- Commit gate test: `583d7d6b4cf3e3f24ba105ba321cf49ed10a6184`.
- GitHub Actions run `37680695367`: **SUCCESS** su Ubuntu e Windows.
- Risultati: Import 231/231; Manuale 413/413; Consultazione 38/38; IVA 148/148; Core 584/584; All safe 959/959; build PASS.
- Formalizzato audit corrente in `REPORT/IVA_REGISTRI_LIQUIDAZIONE_FREEZE_AUDIT.md`.
- Aggiornate matrice test, debito manuale e roadmap A100.
- Stato del blocco dopo CI documentale: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Prossimo blocco previsto: `SPLIT-SIMPLE`.
- Riconciliazione Bancaria resta BLOCCATA.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Stato del commit documentale: **CI PENDENTE**.


## 2026-10-08 — SPLIT-SIMPLE / audit e hardening segni nota credito

- Audit avviato dal gate IVA già verde sul branch `mio-branch`.
- Confermata la catena principale split: flag controparte/documento -> draft Manuale -> conto tecnico configurato -> partitario al solo imponibile -> registro IVA con flag split -> esclusione dal debito effettivo in liquidazione.
- Individuata divergenza reale Manuale/Import: il workflow Import preservava il lato Dare/Avere della controparte, mentre `buildSplitPaymentRows` nel Manuale forzava sempre la controparte in Dare.
- Correzione applicata: la controparte split mantiene il lato contabile originario; fattura attiva resta in Dare, nota credito attiva resta in Avere.
- Aggiunta regressione specifica per nota credito attiva split, con quadratura delle righe e rimozione della riga IVA ordinaria.
- Introdotto profilo dedicato `test:split` e step CI Windows/Linux.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Riconciliazione Bancaria resta BLOCCATA.
- Stato: **CI PENDENTE**.


## 2026-10-08 — SPLIT-SIMPLE / freeze automatico verde

- Commit codice: `91d2365a2efa9a19f099bde61fc12a95a1bd162d`.
- GitHub Actions run `37695652369`: **SUCCESS** su Ubuntu e Windows.
- Profilo `test:split`: **3 file / 25 test PASS**.
- Tutti gli step CI risultano verdi: Import, Manuale, Consultazione, IVA, Split, Core, All safe, build.
- Formalizzato audit in `REPORT/SPLIT_SIMPLE_FREEZE_AUDIT.md`.
- Aggiornate matrice test, debito manuale e roadmap A100.
- Stato del blocco: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Prossimo blocco: `RITENUTE-SCADENZARIO`.
- Riconciliazione Bancaria resta BLOCCATA.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Stato commit documentale: **CI PENDENTE**.


## 2026-10-08 — RITENUTE-SCADENZARIO / audit e hardening architetturale

- Verificato gate documentale SPLIT-SIMPLE: CI `37695914834` verde su Ubuntu e Windows.
- Il percorso canonico Manuale gestisce parcella, pagamento integrale, chiusura partitario, maturazione ritenuta, debito Erario, scadenza e link PN.
- Individuato bypass legacy in `TaxComplianceView.jsx`: "Nuovo pagamento" scriveva direttamente `ritenute_dacconto` e aggiornava il documento senza Prima Nota/partitario/persistenza canonica.
- Vista Ritenute resa sola lettura: scadenzario derivato esclusivamente dai pagamenti contabilizzati.
- CU/770 "pronto" richiede ora anche CF del percipiente.
- Rimossa inferenza euristica aliquota: senza dato esplicito da draft/causale/percipiente il validator blocca.
- Aggiunto `test:ritenute` e step CI Windows/Linux.
- Nessuna migration/env/auth/RLS/policy/societa reale; Bank resta BLOCCATA.
- Stato: **CI PENDENTE**.


### 2026-10-08 — RITENUTE-SCADENZARIO / triage CI aliquota

- CI `37696964818`: Import PASS; Manual falliva su 4 regressioni ritenute.
- Diagnosi: il draft puo contenere `aliquotaRitenuta = 0`; una selezione con nullish coalescing fermava la priorita prima dell'aliquota positiva configurata sul percipiente.
- Fix: priorita esplicita sul primo valore **positivo** tra draft, default causale e percipiente. Nessun fallback euristico testuale; se nessun valore positivo e configurato resta 0 e il validator blocca.
- Stato: nuova CI pendente.


## 2026-10-08 — RITENUTE-SCADENZARIO / freeze automatico verde

- Commit hardening: `56b173b05ae9b2d84f0993318ba91d382ecee642`.
- Commit fix aliquota configurata: `9fb3b04782a7dc41d8846022a69746e15e530130`.
- GitHub Actions run `37697140035`: **SUCCESS** su Ubuntu e Windows.
- Profilo `test:ritenute`: **4 file / 27 test PASS**.
- Tutti gli step CI verdi: Import, Manuale, Consultazione, IVA, Split, Ritenute, Core, All safe, build.
- Formalizzato audit in `REPORT/RITENUTE_SCADENZARIO_FREEZE_AUDIT.md`.
- Aggiornate matrice test, debito manuale e roadmap A100.
- Limite residuo esplicito: pagamento parziale con ritenuta non supportato; il validator lo blocca e il requisito resta aperto prima della Release A100 salvo esclusione formale.
- Stato del blocco: **AUTOMATICO VERDE / MANUALE PENDENTE**.
- Prossimo blocco: `STAMPE-EXPORT-FASCICOLO`.
- Riconciliazione Bancaria resta BLOCCATA.
- Nessuna migration applicata; nessuna modifica auth/RLS/policy/env; nessun accesso a società reali.
- Stato commit documentale: **CI PENDENTE**.


## 2026-10-08 — STAMPE-EXPORT-FASCICOLO / audit iniziale e hardening di sicurezza

- Base di partenza: RITENUTE-SCADENZARIO document gate `37697581159` SUCCESS su Ubuntu e Windows.
- Audit codice: `StampeView` conserva ancora pannelli fac-simile per Partitari, Mastrini e Bilancio. Intercettata la navigazione ai tre tab per mostrare stato non operativo, senza esporre valori campione come situazioni contabili.
- Audit registri: letture principali tenant-scoped, ma arricchimento `causali_iva` e classificazione `prima_nota` non applicavano esplicitamente il filtro società. Hardening con scoping e fail-closed quando manca una relazione necessaria.
- Export potenzialmente troncato dal limite predefinito Supabase di 1000 righe: inserito blocco esplicito conservativo su libri/registri a soglia, in attesa di paginazione integrale.
- Rimossa la dicitura ingannevole "Pagina 1 di 1" dagli HTML provvisori, non compatibile con stampe multipagina.
- Aggiunto gate `test:stampe` in CI Linux/Windows e guard dedicato.
- Non è stato generato il fascicolo cliente PDF unico; non è stato implementato il bilancio/mastrino canonico né la lettura paginata oltre soglia; restano aperti.
- Ulteriore criticità documentale: il checksum di stampa definitiva oggi calcola hash di metadati/timestamp, non delle righe effettivamente stampate. Non dichiarare garanzia d'inalterabilità del contenuto finché non sarà corretto/validato.
- Stato blocco: **IN CORSO — NON FREEZE**. Nessuna migration, modifica auth/RLS/policy/env, società reale o Bank.
- CI del commit codice: **PENDENTE**.


### 2026-10-08 — Stampe / triage CI Windows

- Run `37699566213`: Ubuntu PASS completo; Windows `test:stampe` 36/37 per confronto test che usava un newline LF letterale, convertito in CRLF da checkout Windows.
- Fix confinato al test: confronto dell'ordine tra guard e dettaglio tramite regex whitespace-agnostic.
- Nessuna regola fiscale/contabile alterata. CI successiva pendente.
