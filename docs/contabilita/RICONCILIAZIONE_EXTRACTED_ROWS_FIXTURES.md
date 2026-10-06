# Riconciliazione bancaria - Fixture contrattuali extractedRows

## Obiettivo

Definire fixture contrattuali (documentali) per validare future implementazioni di:
- normalizzazione righe;
- detection date/importi/IBAN/BIC;
- candidateTypes;
- candidateReasons;
- sectionHint;
- confidence;
- qualityFlags.

Scope: R6C1B-R6C1E.

## Convenzioni

- Formato: pseudo-JSON leggibile e stabile.
- confidenceRange atteso:
  - high: >= 0.90
  - medium: 0.70-0.89
  - low: 0.40-0.69
  - very_low: < 0.40
- detectedDates e detectedAmounts riportano solo elementi rilevanti.
- candidateTypes e candidateReasons possono contenere piu valori.

---

## 1) Banco Sardegna trimestrale

### Fixture BTQ-001
{
  fixtureId: "BTQ-001",
  sourceScenario: "Banco Sardegna trimestrale - IBAN",
  rawText: "IBAN   IT 96 C 01015 03200 000070745491",
  normalizedText: "iban it 96 c 01015 03200 000070745491",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [{ raw: "IT 96 C 01015 03200 000070745491", normalized: "IT96C0101503200000070745491" }],
  detectedBics: [],
  detectedKeywords: ["account_coordinates"],
  candidateTypes: ["iban", "account_number"],
  candidateReasons: ["contains_valid_iban", "near_document_header"],
  sectionHint: "account_coordinates",
  confidenceRange: "high",
  qualityFlags: ["iban_detected"],
  noteOperative: "Usabile come valore IBAN principale; conserva raw con spazi."
}

### Fixture BTQ-002
{
  fixtureId: "BTQ-002",
  sourceScenario: "Banco Sardegna trimestrale - BIC",
  rawText: "BIC   BPMOIT22 XXX",
  normalizedText: "bic bpmoit22 xxx",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [{ raw: "BPMOIT22 XXX", normalized: "BPMOIT22XXX" }],
  detectedKeywords: ["account_coordinates"],
  candidateTypes: ["bic"],
  candidateReasons: ["contains_valid_bic", "near_document_header"],
  sectionHint: "account_coordinates",
  confidenceRange: "high",
  qualityFlags: ["bic_detected"],
  noteOperative: "Normalizzare in uppercase senza spazi."
}

### Fixture BTQ-003
{
  fixtureId: "BTQ-003",
  sourceScenario: "Banco Sardegna trimestrale - riepilogo conto corrente",
  rawText: "Riepilogo Conto Corrente",
  normalizedText: "riepilogo conto corrente",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary"],
  candidateTypes: ["unknown"],
  candidateReasons: ["matches_balance_keyword"],
  sectionHint: "balance_summary",
  confidenceRange: "high",
  qualityFlags: ["likely_header"],
  noteOperative: "Tag sezione riepilogo, non riga movimento."
}

### Fixture BTQ-004
{
  fixtureId: "BTQ-004",
  sourceScenario: "Banco Sardegna trimestrale - saldo iniziale",
  rawText: "Saldo iniziale al 30/09/2025   927,97",
  normalizedText: "saldo iniziale al 30/09/2025 927,97",
  detectedDates: [{ raw: "30/09/2025", normalized: "30/09/2025", roleCandidate: "period_start" }],
  detectedAmounts: [{ raw: "927,97", normalizedNumber: 927.97, roleCandidate: "opening_balance" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary", "statement_period"],
  candidateTypes: ["opening_balance", "period_start"],
  candidateReasons: ["matches_balance_keyword", "high_amount_pattern_confidence"],
  sectionHint: "balance_summary",
  confidenceRange: "high",
  qualityFlags: [],
  noteOperative: "In presenza di piu importi, mantenere opening_balance prioritario per keyword."
}

### Fixture BTQ-005
{
  fixtureId: "BTQ-005",
  sourceScenario: "Banco Sardegna trimestrale - totale entrate",
  rawText: "Totale Entrate   20.000,00",
  normalizedText: "totale entrate 20.000,00",
  detectedDates: [],
  detectedAmounts: [{ raw: "20.000,00", normalizedNumber: 20000.00, roleCandidate: "total_in" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary"],
  candidateTypes: ["total_in"],
  candidateReasons: ["matches_balance_keyword", "high_amount_pattern_confidence"],
  sectionHint: "balance_summary",
  confidenceRange: "high",
  qualityFlags: [],
  noteOperative: "Keyword Totale Entrate deve guidare roleCandidate."
}

### Fixture BTQ-006
{
  fixtureId: "BTQ-006",
  sourceScenario: "Banco Sardegna trimestrale - totale uscite",
  rawText: "Totale Uscite   20.117,45",
  normalizedText: "totale uscite 20.117,45",
  detectedDates: [],
  detectedAmounts: [{ raw: "20.117,45", normalizedNumber: 20117.45, roleCandidate: "total_out" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary"],
  candidateTypes: ["total_out"],
  candidateReasons: ["matches_balance_keyword", "high_amount_pattern_confidence"],
  sectionHint: "balance_summary",
  confidenceRange: "high",
  qualityFlags: [],
  noteOperative: "Gestire anche variante con segno meno nel raw."
}

### Fixture BTQ-007
{
  fixtureId: "BTQ-007",
  sourceScenario: "Banco Sardegna trimestrale - saldo finale",
  rawText: "Saldo finale al 31/12/2025   810,52",
  normalizedText: "saldo finale al 31/12/2025 810,52",
  detectedDates: [{ raw: "31/12/2025", normalized: "31/12/2025", roleCandidate: "period_end" }],
  detectedAmounts: [{ raw: "810,52", normalizedNumber: 810.52, roleCandidate: "closing_balance" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary", "statement_period"],
  candidateTypes: ["closing_balance", "period_end"],
  candidateReasons: ["matches_balance_keyword", "high_amount_pattern_confidence"],
  sectionHint: "closing_balance",
  confidenceRange: "high",
  qualityFlags: [],
  noteOperative: "Usare ruolo closing_balance con priorita su saldo finale."
}

### Fixture BTQ-008
{
  fixtureId: "BTQ-008",
  sourceScenario: "Banco Sardegna trimestrale - header movimenti",
  rawText: "DATA   VALUTA   USCITE   ENTRATE   DESCRIZIONE",
  normalizedText: "data valuta uscite entrate descrizione",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_header", "movement_section_start"],
  candidateTypes: ["movement_header"],
  candidateReasons: ["contains_movement_header_keywords", "possible_table_header"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_table_header", "likely_header"],
  noteOperative: "Header deve abilitare preset Data+Valuta+Uscite+Entrate+Descrizione."
}

### Fixture BTQ-009
{
  fixtureId: "BTQ-009",
  sourceScenario: "Banco Sardegna trimestrale - movimento uscita",
  rawText: "02/10/25   30/09/25   5,49   CANONE SERVIZI TELEMATICI",
  normalizedText: "02/10/25 30/09/25 5,49 canone servizi telematici",
  detectedDates: [
    { raw: "02/10/25", normalized: "02/10/2025", roleCandidate: "operation_date" },
    { raw: "30/09/25", normalized: "30/09/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "5,49", normalizedNumber: 5.49, roleCandidate: "debit_amount", columnHint: "uscite" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "line_has_debit_credit_columns", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "Riga movimento con doppia data e importo uscita."
}

### Fixture BTQ-010
{
  fixtureId: "BTQ-010",
  sourceScenario: "Banco Sardegna trimestrale - movimento entrata",
  rawText: "17/10/25   17/10/25   6.000,00   BONIFICO o/c: SIRIA SRL",
  normalizedText: "17/10/25 17/10/25 6.000,00 bonifico o/c siria srl",
  detectedDates: [
    { raw: "17/10/25", normalized: "17/10/2025", roleCandidate: "operation_date" },
    { raw: "17/10/25", normalized: "17/10/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "6.000,00", normalizedNumber: 6000.00, roleCandidate: "credit_amount", columnHint: "entrate" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "line_has_debit_credit_columns", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "Role credit_amount da colonna entrate."
}

### Fixture BTQ-011
{
  fixtureId: "BTQ-011",
  sourceScenario: "Banco Sardegna trimestrale - multilinea rata prestito",
  rawText: "Quota capitale 6.345,43 Interessi 284,11 Spese/commissioni 22,75",
  normalizedText: "quota capitale 6.345,43 interessi 284,11 spese/commissioni 22,75",
  detectedDates: [],
  detectedAmounts: [
    { raw: "6.345,43", normalizedNumber: 6345.43, roleCandidate: "fee_component" },
    { raw: "284,11", normalizedNumber: 284.11, roleCandidate: "interest_component" },
    { raw: "22,75", normalizedNumber: 22.75, roleCandidate: "fee_component" }
  ],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["payment_terms"],
  candidateTypes: ["multiline_continuation"],
  candidateReasons: ["line_without_date_after_movement", "contains_fee_interest_components"],
  sectionHint: "movement_multiline_detail",
  confidenceRange: "high",
  qualityFlags: ["likely_multiline", "amount_ambiguous"],
  noteOperative: "Non creare nuovo movimento; collegare a parentRowId del movimento rata."
}

### Fixture BTQ-012
{
  fixtureId: "BTQ-012",
  sourceScenario: "Banco Sardegna trimestrale - riassunto scalare",
  rawText: "Riassunto Scalare al 31/12/2025",
  normalizedText: "riassunto scalare al 31/12/2025",
  detectedDates: [{ raw: "31/12/2025", normalized: "31/12/2025", roleCandidate: "statement_date" }],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["scalare_section", "ignore_section"],
  candidateTypes: ["scalare_section", "ignore_section_start"],
  candidateReasons: ["matches_ignore_section_keyword"],
  sectionHint: "ignore_scalare",
  confidenceRange: "high",
  qualityFlags: ["possible_non_movement"],
  noteOperative: "Classificare come sezione da ignorare informativa."
}

### Fixture BTQ-013
{
  fixtureId: "BTQ-013",
  sourceScenario: "Banco Sardegna trimestrale - competenze",
  rawText: "Elementi per il conteggio delle competenze",
  normalizedText: "elementi per il conteggio delle competenze",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["competenze_section", "ignore_section"],
  candidateTypes: ["competenze_section", "ignore_section_start"],
  candidateReasons: ["matches_ignore_section_keyword"],
  sectionHint: "ignore_competenze",
  confidenceRange: "high",
  qualityFlags: ["possible_non_movement"],
  noteOperative: "Contribuisce a ignoreSections senza errori bloccanti."
}

---

## 2) Banco Sardegna mensile

### Fixture BSM-001
{
  fixtureId: "BSM-001",
  sourceScenario: "Banco Sardegna mensile - coordinate spezzate ABI/BIC/IBAN",
  rawText: "ABI: 01015   BIC: SARDIT3S XXX  ... IT   96   C   01015   03200   000070745491",
  normalizedText: "abi 01015 bic sardit3s xxx it 96 c 01015 03200 000070745491",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [{ raw: "IT   96   C   01015   03200   000070745491", normalized: "IT96C0101503200000070745491" }],
  detectedBics: [{ raw: "SARDIT3S XXX", normalized: "SARDIT3SXXX" }],
  detectedKeywords: ["account_coordinates", "bank_identity"],
  candidateTypes: ["iban", "bic", "account_number"],
  candidateReasons: ["contains_valid_iban", "contains_valid_bic", "near_document_header"],
  sectionHint: "account_coordinates",
  confidenceRange: "high",
  qualityFlags: ["iban_detected", "bic_detected"],
  noteOperative: "Normalizzazione robusta su spazi multipli."
}

### Fixture BSM-002
{
  fixtureId: "BSM-002",
  sourceScenario: "Banco Sardegna mensile - header DATA SEGNO D/A IMPORTO VALUTA DESCRIZIONE",
  rawText: "DATA   SEGNO (D/A)   IMPORTO   VALUTA   DESCRIZIONE OPERAZIONE",
  normalizedText: "data segno d/a importo valuta descrizione operazione",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_header"],
  candidateTypes: ["movement_header"],
  candidateReasons: ["contains_movement_header_keywords", "line_has_da_sign", "possible_table_header"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_table_header", "likely_header"],
  noteOperative: "Attiva preset Data+Segno+Importo+Valuta+Descrizione."
}

### Fixture BSM-003
{
  fixtureId: "BSM-003",
  sourceScenario: "Banco Sardegna mensile - movimento D",
  rawText: "2/10/25   D   5,49   30/09/25   CANONE SERVIZI TELEMATICI",
  normalizedText: "2/10/25 d 5,49 30/09/25 canone servizi telematici",
  detectedDates: [
    { raw: "2/10/25", normalized: "02/10/2025", roleCandidate: "operation_date" },
    { raw: "30/09/25", normalized: "30/09/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "5,49", normalizedNumber: 5.49, roleCandidate: "debit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "line_has_da_sign", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "Segno D => uscita."
}

### Fixture BSM-004
{
  fixtureId: "BSM-004",
  sourceScenario: "Banco Sardegna mensile - movimento A",
  rawText: "17/10/25   A   6.000,00   17/10/25   BONIFICO o/c: SIRIA SRL",
  normalizedText: "17/10/25 a 6.000,00 17/10/25 bonifico o/c siria srl",
  detectedDates: [
    { raw: "17/10/25", normalized: "17/10/2025", roleCandidate: "operation_date" },
    { raw: "17/10/25", normalized: "17/10/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "6.000,00", normalizedNumber: 6000.00, roleCandidate: "credit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "line_has_da_sign", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "Segno A => entrata."
}

### Fixture BSM-005
{
  fixtureId: "BSM-005",
  sourceScenario: "Banco Sardegna mensile - multilinea bonifico",
  rawText: "a favore di BANCO DI SARDEGNA SIRIA S.R.L. Num. Bon.Sepa 252901...",
  normalizedText: "a favore di banco di sardegna siria s.r.l. num bon sepa 252901",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["payment_terms"],
  candidateTypes: ["multiline_continuation"],
  candidateReasons: ["line_without_date_after_movement", "inside_detected_movement_section"],
  sectionHint: "movement_multiline_detail",
  confidenceRange: "medium",
  qualityFlags: ["likely_multiline"],
  noteOperative: "Descrizione estesa del movimento precedente, non nuova riga movimento."
}

### Fixture BSM-006
{
  fixtureId: "BSM-006",
  sourceScenario: "Banco Sardegna mensile - multilinea rata",
  rawText: "Quota capitale   6.345,43   Interessi   284,11 Spese/commissioni   22,75",
  normalizedText: "quota capitale 6.345,43 interessi 284,11 spese/commissioni 22,75",
  detectedDates: [],
  detectedAmounts: [
    { raw: "6.345,43", normalizedNumber: 6345.43, roleCandidate: "fee_component" },
    { raw: "284,11", normalizedNumber: 284.11, roleCandidate: "interest_component" },
    { raw: "22,75", normalizedNumber: 22.75, roleCandidate: "fee_component" }
  ],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["payment_terms"],
  candidateTypes: ["multiline_continuation"],
  candidateReasons: ["line_without_date_after_movement", "contains_fee_interest_components", "amount_ambiguous"],
  sectionHint: "movement_multiline_detail",
  confidenceRange: "high",
  qualityFlags: ["likely_multiline", "amount_ambiguous"],
  noteOperative: "Esempio chiave per parent/child linking."
}

---

## 3) Banca Sella

### Fixture SEL-001
{
  fixtureId: "SEL-001",
  sourceScenario: "Banca Sella - bank name",
  rawText: "Banca Sella - Societa per azioni",
  normalizedText: "banca sella societa per azioni",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["bank_identity"],
  candidateTypes: ["bank_name"],
  candidateReasons: ["contains_bank_identity_keyword", "near_document_header"],
  sectionHint: "document_header",
  confidenceRange: "high",
  qualityFlags: [],
  noteOperative: "Identita banca primaria."
}

### Fixture SEL-002
{
  fixtureId: "SEL-002",
  sourceScenario: "Banca Sella - conto n.",
  rawText: "Conto n.   M352904037280",
  normalizedText: "conto n m352904037280",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["account_coordinates"],
  candidateTypes: ["account_number"],
  candidateReasons: ["matches_account_number_keyword", "near_document_header"],
  sectionHint: "account_coordinates",
  confidenceRange: "high",
  qualityFlags: [],
  noteOperative: "Alfanumerico, non trattare come importo."
}

### Fixture SEL-003
{
  fixtureId: "SEL-003",
  sourceScenario: "Banca Sella - IBAN",
  rawText: "IBAN:   IT39I0326803212052904037280",
  normalizedText: "iban it39i0326803212052904037280",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [{ raw: "IT39I0326803212052904037280", normalized: "IT39I0326803212052904037280" }],
  detectedBics: [],
  detectedKeywords: ["account_coordinates"],
  candidateTypes: ["iban"],
  candidateReasons: ["contains_valid_iban"],
  sectionHint: "account_coordinates",
  confidenceRange: "high",
  qualityFlags: ["iban_detected"],
  noteOperative: "IBAN completo senza spazi."
}

### Fixture SEL-004
{
  fixtureId: "SEL-004",
  sourceScenario: "Banca Sella - BIC",
  rawText: "BIC:   SELBIT2BXXX",
  normalizedText: "bic selbit2bxxx",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [{ raw: "SELBIT2BXXX", normalized: "SELBIT2BXXX" }],
  detectedKeywords: ["account_coordinates"],
  candidateTypes: ["bic"],
  candidateReasons: ["contains_valid_bic"],
  sectionHint: "account_coordinates",
  confidenceRange: "high",
  qualityFlags: ["bic_detected"],
  noteOperative: "BIC Sella forte per detection profilo."
}

### Fixture SEL-005
{
  fixtureId: "SEL-005",
  sourceScenario: "Banca Sella - riepilogo movimenti",
  rawText: "RIEPILOGO MOVIMENTI Data contabile Data valuta Descrizione Uscite Entrate",
  normalizedText: "riepilogo movimenti data contabile data valuta descrizione uscite entrate",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_header", "movement_section_start"],
  candidateTypes: ["movement_header"],
  candidateReasons: ["contains_movement_header_keywords", "possible_table_header"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_table_header", "likely_header"],
  noteOperative: "Header Sella con Data contabile + Data valuta."
}

### Fixture SEL-006
{
  fixtureId: "SEL-006",
  sourceScenario: "Banca Sella - movimento uscita",
  rawText: "01 12 25   01 12 25   COMMISSIONI ADDEBITO DIRETTO SEPA   0,50",
  normalizedText: "01 12 25 01 12 25 commissioni addebito diretto sepa 0,50",
  detectedDates: [
    { raw: "01 12 25", normalized: "01/12/2025", roleCandidate: "operation_date" },
    { raw: "01 12 25", normalized: "01/12/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "0,50", normalizedNumber: 0.50, roleCandidate: "debit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "medium",
  qualityFlags: ["possible_movement"],
  noteOperative: "In layout Sella l uscita puo apparire a fine riga senza colonna esplicita nel testo flat."
}

### Fixture SEL-007
{
  fixtureId: "SEL-007",
  sourceScenario: "Banca Sella - movimento entrata",
  rawText: "01 12 25   01 12 25   INCASSO AX 5361846/00003-30-11   146,00",
  normalizedText: "01 12 25 01 12 25 incasso ax 5361846/00003-30-11 146,00",
  detectedDates: [
    { raw: "01 12 25", normalized: "01/12/2025", roleCandidate: "operation_date" },
    { raw: "01 12 25", normalized: "01/12/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "146,00", normalizedNumber: 146.00, roleCandidate: "credit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "medium",
  qualityFlags: ["possible_movement"],
  noteOperative: "Classificazione debit/credit puo richiedere contesto colonnare."
}

### Fixture SEL-008
{
  fixtureId: "SEL-008",
  sourceScenario: "Banca Sella - riga sospetta/multilinea",
  rawText: "URI   50,00",
  normalizedText: "uri 50,00",
  detectedDates: [],
  detectedAmounts: [{ raw: "50,00", normalizedNumber: 50.00, roleCandidate: "unknown_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["unknown"],
  candidateTypes: ["multiline_continuation", "unknown"],
  candidateReasons: ["line_without_date_after_movement", "possible_ocr_noise"],
  sectionHint: "movement_multiline_detail",
  confidenceRange: "low",
  qualityFlags: ["likely_multiline", "needs_operator_review"],
  noteOperative: "Riga corta e ambigua; non promuovere automaticamente a movimento."
}

---

## 4) OCR / testo rumoroso

### Fixture OCR-001
{
  fixtureId: "OCR-001",
  sourceScenario: "OCR rumoroso - IBAN con spazi strani",
  rawText: "IBAN IT 9 6 C 01015 03200 000070745491",
  normalizedText: "iban it 9 6 c 01015 03200 000070745491",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [{ raw: "IT 9 6 C 01015 03200 000070745491", normalized: "IT96C0101503200000070745491" }],
  detectedBics: [],
  detectedKeywords: ["account_coordinates"],
  candidateTypes: ["iban"],
  candidateReasons: ["contains_valid_iban", "possible_ocr_noise"],
  sectionHint: "account_coordinates",
  confidenceRange: "medium",
  qualityFlags: ["has_ocr_noise", "iban_detected"],
  noteOperative: "Consentire recovery OCR con normalizzazione robusta."
}

### Fixture OCR-002
{
  fixtureId: "OCR-002",
  sourceScenario: "OCR rumoroso - importo con simboli sporchi",
  rawText: "Totale Uscite * 20.117,45 ?",
  normalizedText: "totale uscite 20.117,45",
  detectedDates: [],
  detectedAmounts: [{ raw: "20.117,45", normalizedNumber: 20117.45, roleCandidate: "total_out" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary"],
  candidateTypes: ["total_out"],
  candidateReasons: ["matches_balance_keyword", "possible_ocr_noise"],
  sectionHint: "balance_summary",
  confidenceRange: "medium",
  qualityFlags: ["has_ocr_noise"],
  noteOperative: "Ripulire simboli spurii senza perdere il valore."
}

### Fixture OCR-003
{
  fixtureId: "OCR-003",
  sourceScenario: "OCR rumoroso - data parzialmente leggibile",
  rawText: "3l/12/2025 SALDO FINALE 810,52",
  normalizedText: "3l/12/2025 saldo finale 810,52",
  detectedDates: [{ raw: "3l/12/2025", normalized: null, roleCandidate: "unknown_date" }],
  detectedAmounts: [{ raw: "810,52", normalizedNumber: 810.52, roleCandidate: "closing_balance" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary"],
  candidateTypes: ["closing_balance", "period_end"],
  candidateReasons: ["matches_balance_keyword", "date_ambiguous", "possible_ocr_noise"],
  sectionHint: "closing_balance",
  confidenceRange: "low",
  qualityFlags: ["date_ambiguous", "has_ocr_noise", "needs_operator_review"],
  noteOperative: "Data ambigua: richiede conferma operatore."
}

### Fixture OCR-004
{
  fixtureId: "OCR-004",
  sourceScenario: "OCR rumoroso - riga mojibake",
  rawText: "Totale Entrate 20.000,00 ┬ñ",
  normalizedText: "totale entrate 20.000,00",
  detectedDates: [],
  detectedAmounts: [{ raw: "20.000,00", normalizedNumber: 20000.00, roleCandidate: "total_in" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["balance_summary"],
  candidateTypes: ["total_in"],
  candidateReasons: ["matches_balance_keyword", "possible_ocr_noise"],
  sectionHint: "balance_summary",
  confidenceRange: "medium",
  qualityFlags: ["has_mojibake", "has_ocr_noise"],
  noteOperative: "Mojibake non deve impedire detection se pattern resta riconoscibile."
}

### Fixture OCR-005
{
  fixtureId: "OCR-005",
  sourceScenario: "OCR rumoroso - needs_operator_review",
  rawText: ".. / / .. ??? 1O,O0",
  normalizedText: ".. / / .. ??? 1o,o0",
  detectedDates: [],
  detectedAmounts: [],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["unknown"],
  candidateTypes: ["unknown"],
  candidateReasons: ["possible_ocr_noise"],
  sectionHint: "unknown",
  confidenceRange: "very_low",
  qualityFlags: ["has_ocr_noise", "no_numeric_data", "needs_operator_review"],
  noteOperative: "Esempio limite da non classificare automaticamente."
}

---

## 5) CSV / Excel futuro

### Fixture CSV-001
{
  fixtureId: "CSV-001",
  sourceScenario: "CSV - colonne esplicite",
  rawText: "2025-10-02;2025-09-30;5.49;OUT;CANONE SERVIZI",
  normalizedText: "2025-10-02 2025-09-30 5.49 out canone servizi",
  detectedDates: [
    { raw: "2025-10-02", normalized: "02/10/2025", roleCandidate: "operation_date" },
    { raw: "2025-09-30", normalized: "30/09/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "5.49", normalizedNumber: 5.49, roleCandidate: "debit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["inside_detected_movement_section", "line_has_debit_credit_columns"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "sourceType=csv, tableHints.inferredColumns forte."
}

### Fixture CSV-002
{
  fixtureId: "CSV-002",
  sourceScenario: "CSV - amount signed",
  rawText: "2025-10-03;BONIFICO;-6652.29",
  normalizedText: "2025-10-03 bonifico -6652.29",
  detectedDates: [{ raw: "2025-10-03", normalized: "03/10/2025", roleCandidate: "operation_date" }],
  detectedAmounts: [{ raw: "-6652.29", normalizedNumber: 6652.29, sign: "-", roleCandidate: "debit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "high_amount_pattern_confidence"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "Sign negativo determina direction out."
}

### Fixture CSV-003
{
  fixtureId: "CSV-003",
  sourceScenario: "Excel - dare/avere separati",
  rawText: "02/10/2025 | 30/09/2025 | Dare=5,49 | Avere= | CANONE",
  normalizedText: "02/10/2025 30/09/2025 dare 5,49 avere canone",
  detectedDates: [
    { raw: "02/10/2025", normalized: "02/10/2025", roleCandidate: "operation_date" },
    { raw: "30/09/2025", normalized: "30/09/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "5,49", normalizedNumber: 5.49, roleCandidate: "debit_amount", columnHint: "dare" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_has_debit_credit_columns", "inside_detected_movement_section"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "sourceType=spreadsheet, valorizzare sourceMeta.sheetName."
}

### Fixture CSV-004
{
  fixtureId: "CSV-004",
  sourceScenario: "CSV/Excel - descrizione pulita",
  rawText: "2025-10-17;2025-10-17;6000.00;IN;BONIFICO DA CLIENTE",
  normalizedText: "2025-10-17 2025-10-17 6000.00 in bonifico da cliente",
  detectedDates: [
    { raw: "2025-10-17", normalized: "17/10/2025", roleCandidate: "operation_date" },
    { raw: "2025-10-17", normalized: "17/10/2025", roleCandidate: "value_date" }
  ],
  detectedAmounts: [{ raw: "6000.00", normalizedNumber: 6000.00, roleCandidate: "credit_amount" }],
  detectedIbans: [],
  detectedBics: [],
  detectedKeywords: ["movement_row"],
  candidateTypes: ["movement_row"],
  candidateReasons: ["line_starts_with_date", "high_amount_pattern_confidence"],
  sectionHint: "movement_table",
  confidenceRange: "high",
  qualityFlags: ["possible_movement"],
  noteOperative: "Caso di riferimento per parsing tabellare pulito."
}

---

## Copertura e uso contrattuale

Copertura scenari:
- Banco Sardegna trimestrale: 13 fixture
- Banco Sardegna mensile: 6 fixture
- Banca Sella: 8 fixture
- OCR/testo rumoroso: 5 fixture
- CSV/Excel futuro: 4 fixture

Totale fixture: 36

Uso previsto:
- contratti di accettazione per normalizer e classifier;
- base fixture per test automatici futuri (snapshot/contract);
- allineamento tra detection, viewer e mapping guidato;
- riduzione regressioni su reason/confidence/sectionHint.

## Note di perimetro

Documento solo documentale. Nessun codice operativo, parser, UI reale, DB o API modificato.
