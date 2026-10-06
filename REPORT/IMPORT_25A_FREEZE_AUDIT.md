# IMPORT-25A-FREEZE — AUDIT AUTOMATICO

Data audit: 2026-10-06  
Branch: `mio-branch`

## Esito

**Gate automatico: PASS**, subordinato alla CI del commit di freeze.

Il modulo Import Contabilità 25A soddisfa i requisiti automatici definiti per il blocco A100. La chiusura definitiva del blocco richiede ancora il collaudo manuale finale in browser su ambiente/società di test; nessun test manuale viene dichiarato eseguito in questo audit.

## Matrice di freeze

| Area | Evidenza automatica | Esito |
|---|---|---|
| Input XML | `importContabilitaInputNormalizer.test.js` — XML singolo invariato; workflow file valido | PASS |
| Input P7M | normalizer + workflow P7M -> XML | PASS |
| Input ZIP | normalizer ZIP 100 file -> 50 XML | PASS |
| Dataset massivo | 500 documenti, 5 pagine da 100, cache matching/readiness | PASS |
| Anagrafica forte | match P.IVA/CF, niente falso “nuova” per fornitore noto | PASS |
| IVA placeholder 0/0 | pruning se non fiscalmente significativo; mantenimento/blocco se natura/causale reale | PASS |
| Causale IVA standard | standard Studio per aliquota/natura | PASS |
| Storico IVA | P2 per controparte/direzione/aliquota, read-only | PASS |
| Conflitto P1/P2 | mantiene standard e produce warning non bloccante | PASS |
| Detraibilità | proposta storica editabile; override manuale preservato | PASS |
| Storico conto/casuale | proposta modale conto costo/ricavo + causale contabile | PASS |
| Override storico | manuale/batch/snapshot non sovrascritto | PASS |
| Readiness | conti/causali/IVA significative obbligatorie; 0/0 non blocca | PASS |
| Payload canonico | righe PN bilanciate e righe IVA effettive preservate | PASS |
| Anti-duplicazione import | già contabilizzato escluso dallo staging operativo | PASS |
| Anti-doppio commit | stato processed/committed blocca prima del persist | PASS |
| Periodo definitivo | commit bloccato se periodo stampato definitivo | PASS |
| Validazione operatore | commit abilitato solo con Working View coerente + click esplicito + `window.confirm` | PASS |
| Commit diretto Working Table | nessuna chiamata diretta a `runCommitWorkflow` dalla tabella | PASS |
| Storico read-only | loader storici senza insert/update/delete | PASS |
| Build / regressioni | CI ufficiale Windows + Linux | DA CONFERMARE SUL COMMIT FREEZE |

## Principi confermati

- Import propone, precompila e segnala: non contabilizza autonomamente.
- La Working View resta il punto di validazione prima del commit.
- L'operatore può modificare le proposte prima della contabilizzazione.
- Gli override manuali prevalgono sullo storico.
- Le righe IVA 0/0 non fiscali non entrano nei movimenti IVA.
- Un documento già contabilizzato non viene riproposto come operativo e non può essere committato due volte.
- Nessuna migration, policy RLS, auth o configurazione ambiente è stata modificata.

## Collaudo manuale finale richiesto

Da eseguire una sola volta a fine blocco Import, non per micro-fix:

1. selezionare una società esclusivamente di test;
2. importare un XML ordinario e uno ZIP controllato;
3. verificare Working Table e paginazione;
4. aprire una fattura con storico noto e verificare i marker “Proposta da storico”;
5. sostituire manualmente conto costo e causale contabile e verificare che lo storico non li ripristini;
6. verificare una fattura multi-aliquota 22% + 10% con placeholder 0/0;
7. verificare warning standard IVA vs storico divergente;
8. contabilizzare un solo documento dopo il popup di conferma;
9. verificare passaggio a registrato, prima nota, registro IVA e partitario;
10. tentare nuovamente lo stesso documento e verificare il blocco anti-duplicato;
11. prova visuale massiva ~500 documenti per reattività/paginazione.

## Gate successivo

Se il collaudo manuale sopra è positivo, `IMPORT-25A-FREEZE` può essere dichiarato **CHIUSO** e il lavoro passa a `MANUALE-CANONICO-FREEZE`.

La Riconciliazione Bancaria resta fuori perimetro fino alla chiusura di Import + Manuale + IVA.
