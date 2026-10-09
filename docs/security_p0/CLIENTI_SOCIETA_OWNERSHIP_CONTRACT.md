# P0 — Contratto di isolamento CRM cliente / società contabile

Stato: **SPECIFICA CANDIDATA / NON IMPLEMENTATA**. Non autorizza deploy né modifica del DB reale.
Ambito: `clienti`, `societa`, `utenti_studio_societa`, `avvisi_ade`,
`revisioni_dichiarativi`, `utenti_studio.clienti_assegnati`,
`documenti_import`, notifiche e moduli che leggono l'anagrafica.

## Fatti verificati (Stage3I/Stage3L + moduli applicativi)
- `clienti` ha `id`, CF/PIVA, `responsabile_id`, `codice_cliente` ma **non ha `societa_id`** né una FK canonica verso `societa`.
- `societa` è l'entità contabile; `utenti_studio_societa` lega utente Auth e profilo a una o più società.
- `avvisi_ade.cliente_id` e `revisioni_dichiarativi.cliente_id` hanno FK verso `clienti.id`, non verso `societa.id`.
- `revisioni_dichiarativi.company_id`, `tenant_id` e `owner_user_id` sono nullable senza mappatura referenziale verificata. `avvisi_ade` non ha un campo `societa_id`.
- I moduli browser `clienti`, AgeCon, revisione e selezione clienti collaboratori interrogano `clienti` direttamente; AgeCon e revisione espongono anche write diretti sulle rispettive tabelle.
- Stage3M ha contenuto altre sei tabelle; Stage3N ha revocato write diretti browser su `utenti_studio`. Restano `avvisi_ade` e `revisioni_dichiarativi` con policy authenticated generiche.

## Decisioni NON autorizzate
- Non assumere che `clienti.id == societa.id`.
- Non collegare automaticamente per uguaglianza di CF, PIVA, email, nome o `responsabile_id`.
- Non copiare `societa.id` in `revisioni_dichiarativi.company_id` senza dichiarare, verificare e vincolare la semantica del campo.
- Non utilizzare `user_metadata`, ruolo owner/admin globale, `codice_studio` libero, tenant/company IDs forniti dal client come autorità.
- Non accettare `cliente_id = NULL` come autorizzazione di accesso più ampia.
- Non creare policy permissive per "risolvere" accessi mancanti e non forzare backfill sui dati storici.

## Modello target da implementare dopo audit dati locali
1. Distinguere esplicitamente *studio proprietario*, *società contabile* e *cliente CRM*. Se l'app mantiene più studi indipendenti, occorre una entità di tenancy canonica, **non** riutilizzare il legacy `studios` senza una conversione verificata.
2. Stabilire il rapporto cliente↔società con una **assegnazione esplicita e revisionabile**. Valutare relazione 1:N/M:N sulla base delle regole operative, non delle somiglianze anagrafiche. Una tabella ponte da sola **non basta** a isolare avvisi/revisioni quando un cliente è associato a più società.
3. Ogni record fiscale sensibile deve portare un ownership scope **univoco, immutabile dopo la conferma**, verificato server-side; per AgeCon e revisioni, introdurre una FK/colonna di ambito appropriata o risolvere univocamente la proprietà mediante un legame vincolato. Zero assunzioni sui record legacy.
4. Accesso DB: `USING` + `WITH CHECK` legati a `auth.uid()` e membership attiva dello specifico target, senza owner/admin bypass globale. Preferire `SECURITY INVOKER`, nessun definer in `public` per aggirare le RLS.
5. Scritture UI: un percorso canonico con autenticazione server JWT, validazione cliente/società e ruoli; lato browser mai `service_role`. `cliente_id`, `responsabile_id`, `created_by` sono soggetti a verifica, non valori fidati.
6. Permessi "Solo clienti assegnati": verificare gli ID cliente ricevuti rispetto alle relazioni autorizzate, non basta limitare le `societa_assegnate`. Evitare che i clienti di altre società compaiano nel selettore.
7. Dati preesistenti senza proprietà certa: stato **UNASSIGNED / QUARANTINED**, non leggibile/scrivibile dagli utenti generici. Assegnazione manuale motivata, registrata e verificata, con eventuale approvazione del responsabile.
8. Indici, FK, trigger e unique constraint progettati prima di migrare; non bloccare implicitamente l'intero archivio durante l'esercizio. L'eventuale schema target deve essere creato e provato **solo sul clone Docker**, poi collaudato con Auth/API/UX.

## Acceptance matrix — E2E reale, non mock
| ID | Scenario con dati fittizi e sessione JWT firmata | Esito obbligatorio |
|---|---|---|
| TEN-01 | Owner A apre clienti A, AgeCon A, revisioni A | Consentito solo per A |
| TEN-02 | Owner A prova a leggere/scrivere cliente B | 403/nessun record B |
| TEN-03 | Admin A prova `UPDATE` avviso B conoscendone l'UUID | 403/0 righe modificate |
| TEN-04 | Collaboratore A prova a cambiare `cliente_id` o `societa_id` verso B | Bloccato da API e RLS |
| TEN-05 | Cliente CRM assegnato esplicitamente ad A e B; avviso creato per A | Utente B non vede l'avviso di A |
| TEN-06 | Record storico senza proprietà certa | Non leggibile; compare solo in coda di riconciliazione autorizzata |
| TEN-07 | Owner A tenta di assegnare al collaboratore un cliente B | 403 e nessuna modifica membership |
| TEN-08 | Utente prova a cambiare `user_metadata` / ID client per apparire Owner B | Nessuna escalation |
| TEN-09 | Accesso anon a Clienti, AgeCon, revisioni | Negato |
| TEN-10 | Creazione effettiva cliente A → avviso 36-bis → modifica esito → CIVIS → storico | Tracciamento, scadenze e proprietà coerenti |
| TEN-11 | Revisione dichiarativi A con creazione cliente, archiviazione, riapertura | Proprietà A conservata in tutto il ciclo |
| TEN-12 | Disattivazione utente A con JWT ancora valido | Nessun accesso ai dati attraverso API/JWT |
| TEN-13 | Operatore importa XML per società A e collega CRM cliente A | Impossibile associare una controparte appartenente solo a B |
| TEN-14 | Annullamento/errore a metà salvataggio multitabella | Nessuna assegnazione parziale o record orfano |

## Gating di rilascio
- **Stage3N SQL LAB**: PASS documentato (non ripetere).
- **Stage3O UI**: build/suite statiche PASS, JWT UI E2E NON PROVATO.
- **P0 cliente-società**: non chiuso senza schema proprietario, remapping controllato e TEN-01..TEN-14 con prove da API/DB.
- **Studio-grade complessivo**: non chiuso senza scenari operativi reali contabili/fiscali XML→prima nota→IVA→liquidazioni→stampe, per ciascun regime/caso applicabile.

Non applicare questa specifica come migrazione SQL senza il relativo piano di transizione e collaudo isolato.


## Stage3P foundation preparata (non applicata)
- `sql/security_p0/41_stage3p_ownership_preflight_READ_ONLY.sql` e `scripts/security_p0/run-stage3p-preflight.ps1` raccolgono solo cataloghi e conteggi aggregati su cliente/società/avvisi/revisioni, in transazione `BEGIN READ ONLY ... ROLLBACK`.
- `sql/security_p0/42_stage3p_empty_crm_link_LAB_ONLY.sql` crea **solo** `public.crm_cliente_societa_link` con PK composta `(cliente_id,societa_id)`, tre FK a `clienti`, `societa` e `auth.users`, obbligo di `assigned_by` e `decision_reason`, RLS attiva, zero policy, zero grants browser, grants service_role `SELECT/INSERT` soltanto. Nessun collegamento creato automaticamente e nessun dato fiscale modificato.
- `43_stage3p_empty_crm_link_TEST_ONLY.sql` copre `anon`, `authenticated` e `service_role` con SQL a zero righe e `ROLLBACK`. Tutti i risultati SQL Stage3P sono **DA COLLAUDARE NEL DOCKER** prima di accettare la fondazione.
- La tabella ponte **non è sufficiente** per la sicurezza effettiva dei record. Non vengono modificate RLS o privilegi attuali di `clienti`, `avvisi_ade`, `revisioni_dichiarativi`. Questi ultimi restano P0 APERTI.
- Una relazione cliente↔società M:N non identifica automaticamente il **singolo proprietario** di un avviso, di una revisione o di un documento. Serviranno scope fiscal-record univoci, vincoli server e RLS complete, con backfill legacy soltanto dopo riconciliazione manuale.
- Prima di eseguire `42` occorre esaminare l'output effettivo di `41` per verificare nomi, tipi, vincoli e dati preesistenti. Nessuna applicazione automatica al database reale.
