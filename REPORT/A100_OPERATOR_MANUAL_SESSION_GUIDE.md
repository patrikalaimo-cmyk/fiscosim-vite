# A100 — Guida sessione collaudi (società TEST)

**Politica 2026-10-13:** i collaudi manuali restano **accantonati a fine sviluppo** (regola già in `FISCOSIM_MANUAL_TEST_DEBT.md`). Lo sviluppo LAB/prod code continua con gate automatici verdi; la sessione operatore chiude bug/UX/mancanze sull’intero sistema prima del freeze A100.

## Chi fa cosa

| Ruolo | Cosa |
|---|---|
| **Agente (io)** | Test **LAB** automatici (Puppeteer/JWT/DB) su società sintetica `SG-E2E-*`. Chiude PATH/API se il criterio di accettazione è dimostrato. **Non** scrive su clienti LIVE reali. |
| **Tu (operatore)** | Collaudo **form UI** e **prova visuale** su **società di test** (LAB `http://127.0.0.1:5173` oppure prod `fiscosim-v6` solo se è chiaramente società fittizia). |

Non posso sostituire al 100% i collaudi “caso fiscale completo” nel form Manuale/IVA/Consultazione, né Import #11 (~500 documenti a occhio). Posso guidarti passo-passo e aggiornare il debito quando mi dici PASS/FAIL.

## Ambiente consigliato per la sessione

1. LAB già tipico: `http://127.0.0.1:5173` — login `sg-e2e-a@example.invalid` (password LAB nota negli script Stage3W).
2. Oppure prod `https://fiscosim-v6.vercel.app` **solo** su società test (mai clienti reali).

## Checklist minima (ordine)

### Import Contabilità
- [ ] #11 — carica / elenca ~molti documenti (o ZIP grande) e verifica UI stabile (paginazione, niente freeze). **Solo tu.**

### Registrazione Manuale (form UI)
Per ciascun caso: Nuova registrazione → compila → preview → commit → Controlla PN + registro IVA + partitario.
- [ ] #1 Giroconto cassa/banca senza soggetto/IVA
- [ ] #2 Fattura passiva ordinaria
- [ ] #3 Fattura attiva ordinaria
- [ ] #4 NC passiva + NC attiva
- [ ] #5 Multi-aliquota 22+10
- [ ] #6 Split payment (cliente PA / flag split)
- [ ] #12 Warning/blocker prima del commit (almeno 1 caso)

*(#7–#11/#13 possono seguire in seconda sessione.)*

### IVA
- [ ] Periodo mensile + elenco registri con fatture/NC già presenti
- [ ] Anteprima liquidazione vs consolidata (se hai una definitiva in LAB)
- [ ] Blocco riconsolidamento definitiva

### Consultazione
- [ ] Filtri date/soggetto
- [ ] Dettaglio scrittura + banner read-only
- [ ] Export CSV con N. Prima Nota

## Come lavoriamo insieme

1. Dimmi «parto Import» / «parto Manuale» / «parto IVA».
2. Io ti do **un solo passo** alla volta (cosa cliccare + cosa verificare).
3. Tu rispondi `PASS` / `FAIL` + screenshot se FAIL.
4. Aggiorno `FISCOSIM_MANUAL_TEST_DEBT.md`.

## Già coperto in LAB (non ripete come collaudo automatico)

Import 1–10 (con #11 ancora tuo); Manuale PATH API #1–9 (ordinarie/NC/split/multi2210 + iva_cassa/reverse/parcella JWT); form UI ancora tuo; shell IVA/Consultazione; Bank L5 memory DB+local; P0 sicurezza LIVE allow_all TRUE=0.
