# A100 — Guida sessione collaudi (società TEST)

**Stato 2026-10-13:** sviluppo residuale automatizzabile **chiuso** (~84% A100). Questa sessione chiude il debito **form UI / visuale** verso freeze A100.

## Chi fa cosa

| Ruolo | Cosa |
|---|---|
| **Agente** | Guida passo-passo; aggiorna debito su PASS/FAIL; LAB auto già verde. **Non** scrive su clienti LIVE reali. |
| **Tu** | Collaudo **form UI** su società **di test** (LAB o prod fittizia). |

## Ambiente

1. **Consigliato:** LAB `http://127.0.0.1:5173` — login `sg-e2e-a@example.invalid` (password negli script Stage3W / `.env.stage3w.lab.local` se la conosci).
2. Oppure prod `https://fiscosim-v6.vercel.app` **solo** società test (mai clienti reali).

Dimmi `parto LAB` o `parto prod-test` prima di iniziare.

## Checklist sessione 1 (ordine obbligatorio)

Rispondi `PASS` / `FAIL` (+ screenshot se FAIL) per ogni riga.

### A — Import Contabilità
- [ ] **A1 / #11** — carica molti documenti (ZIP grande o batch) e verifica UI stabile (paginazione, niente freeze).

### B — Registrazione Manuale (form UI)
Per ogni caso: Nuova registrazione → compila → preview → commit → Controlla PN + registro IVA + partitario.
- [ ] **B1** Giroconto cassa/banca senza soggetto/IVA
- [ ] **B2** Fattura passiva ordinaria
- [ ] **B3** Fattura attiva ordinaria
- [ ] **B4** NC passiva + NC attiva (segni)
- [ ] **B5** Multi-aliquota 22+10 (2 righe IVA)
- [ ] **B6** Split payment (cliente PA)
- [ ] **B7** Warning/blocker prima del commit (es. sbilancio o campi obbligatori) — almeno 1 caso

### C — IVA / Liquidazione
- [ ] **C1** Periodo mensile + elenco registri con fatture/NC già presenti
- [ ] **C2** Anteprima liquidazione (e warning se esiste una definitiva)
- [ ] **C3** Blocco riconsolidamento su liquidazione definitiva (se disponibile in LAB)

### D — Consultazione
- [ ] **D1** Filtri date/soggetto
- [ ] **D2** Dettaglio scrittura + banner read-only
- [ ] **D3** Export CSV con N. Prima Nota

### E — Stampe (smoke breve)
- [ ] **E1** Partitari o Aging: Genera anteprima → dati società attiva
- [ ] **E2** Fascicolo: genera file unico + hash visibile (print-to-PDF opzionale)

### F — Bank (smoke breve, società test)
- [ ] **F1** Import estratto / match proposta su partitario
- [ ] **F2** Conferma high-confidence (o dry-run) senza write LIVE reali

## Sessione 2 (se tempo)

Manuale avanzati già PATH LAB (form ancora utile): IVA cassa, reverse, parcella, pagamento parziale, periodo chiuso.

## Come lavoriamo

1. Tu: `parto Import` / `parto Manuale` / `parto IVA` / …
2. Io: **un solo passo** (click + verifica).
3. Tu: `PASS` / `FAIL`.
4. Io aggiorno `FISCOSIM_MANUAL_TEST_DEBT.md`.

## Già coperto in LAB (non ripetere come smoke automatico)

- Import #1–10; Manuale PATH API #1–13 (fiscali + partitario + lock + payload blockers)
- L6CORE4; Aging tab; Bank L5 memory DB+local; P0 LIVE allow_all TRUE=0
- Fascicolo HTML+hash; Stampe partitari/mastrini/bilancio modelli

## Dopo la sessione

Solo con checklist verde: dichiarare **A100** / Bank live. Bug/UX trovati → fix → re-smoke mirato.
