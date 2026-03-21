-- ============================================
-- MODULO CONTABILITÀ COMPLETO - SCHEMA DATABASE
-- FiscoSim v3.0 - VERSIONE DEFINITIVA
-- ============================================

-- ═══════════════════════════════════════════
-- SEZIONE 1: SOCIETÀ E CONFIGURAZIONE
-- ═══════════════════════════════════════════

-- SOCIETÀ/AZIENDE
CREATE TABLE IF NOT EXISTS societa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codice TEXT UNIQUE NOT NULL,
  denominazione TEXT NOT NULL,
  codice_fiscale TEXT,
  partita_iva TEXT,
  indirizzo TEXT,
  cap TEXT,
  citta TEXT,
  provincia TEXT,
  nazione TEXT DEFAULT 'IT',
  regime_contabile TEXT DEFAULT 'ordinaria', -- ordinaria, semplificata, professionisti, iva_cassa
  -- Esercizi
  esercizio_da DATE,
  esercizio_a DATE,
  anno_iva_corrente INTEGER,
  anno_contabile_corrente INTEGER,
  -- Numeratori
  ultimo_protocollo_vendite INTEGER DEFAULT 0,
  ultimo_protocollo_acquisti INTEGER DEFAULT 0,
  ultimo_protocollo_corrispettivi INTEGER DEFAULT 0,
  ultimo_numero_registrazione INTEGER DEFAULT 0,
  -- Stati
  attiva BOOLEAN DEFAULT true,
  anno_chiuso BOOLEAN DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE societa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_societa" ON societa FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 2: PIANO DEI CONTI E ANAGRAFICHE
-- ═══════════════════════════════════════════

-- PIANO DEI CONTI (con anagrafica integrata)
CREATE TABLE IF NOT EXISTS piano_conti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  -- Struttura gerarchica
  codice TEXT NOT NULL, -- "01 02 20 0014"
  codice_mastro TEXT, -- "01" ATTIVITA
  codice_mastrino TEXT, -- "02" ATTIVO CIRCOLANTE
  codice_conto TEXT, -- "20" CREDITI V/CLIENTI
  codice_sottoconto TEXT, -- "0014"
  descrizione TEXT NOT NULL,
  -- Classificazione
  tipo TEXT NOT NULL, -- patrimoniale, economico
  natura TEXT, -- attivo, passivo, costo, ricavo
  sezione TEXT, -- dare, avere
  livello INTEGER DEFAULT 1, -- 1=mastro, 2=mastrino, 3=conto, 4=sottoconto
  parent_id UUID REFERENCES piano_conti(id),
  -- Flags tipo conto
  is_cliente BOOLEAN DEFAULT false,
  is_fornitore BOOLEAN DEFAULT false,
  is_banca BOOLEAN DEFAULT false,
  is_cassa BOOLEAN DEFAULT false,
  is_iva BOOLEAN DEFAULT false,
  is_professionista BOOLEAN DEFAULT false,
  is_transitorio BOOLEAN DEFAULT false, -- Conto sospeso AI
  -- Anagrafica (per clienti/fornitori)
  anagrafica_tipo TEXT, -- cliente_italia, cliente_estero, fornitore_italia, fornitore_estero, professionista
  ragione_sociale_2 TEXT,
  indirizzo TEXT,
  cap TEXT,
  citta TEXT,
  provincia TEXT,
  nazione TEXT DEFAULT 'IT',
  codice_iso TEXT DEFAULT 'IT',
  codice_fiscale TEXT,
  partita_iva TEXT,
  codice_sdi TEXT,
  pec TEXT,
  -- Defaults contabili
  contropartita_id UUID REFERENCES piano_conti(id),
  causale_iva_default TEXT,
  condizioni_pagamento TEXT,
  banca_appoggio TEXT,
  -- Flags FE
  consumatore_finale BOOLEAN DEFAULT false,
  soggetto_iva BOOLEAN DEFAULT true,
  split_payment BOOLEAN DEFAULT false,
  -- Saldi
  saldo_iniziale NUMERIC(15,2) DEFAULT 0,
  saldo_dare NUMERIC(15,2) DEFAULT 0,
  saldo_avere NUMERIC(15,2) DEFAULT 0,
  -- Stato
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, codice)
);

ALTER TABLE piano_conti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_piano_conti" ON piano_conti FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_piano_conti_societa ON piano_conti(societa_id);
CREATE INDEX idx_piano_conti_codice ON piano_conti(codice);
CREATE INDEX idx_piano_conti_tipo ON piano_conti(tipo);
CREATE INDEX idx_piano_conti_cliente ON piano_conti(is_cliente) WHERE is_cliente = true;
CREATE INDEX idx_piano_conti_fornitore ON piano_conti(is_fornitore) WHERE is_fornitore = true;

-- PERCIPIENTI (per CU)
CREATE TABLE IF NOT EXISTS percipienti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  conto_id UUID REFERENCES piano_conti(id) ON DELETE CASCADE,
  codice TEXT NOT NULL,
  ragione_sociale TEXT NOT NULL,
  codice_fiscale TEXT,
  -- Dati soggetto
  codice_tributo TEXT DEFAULT '001', -- 001 = Lavoro autonomo abituale
  descrizione_tributo TEXT DEFAULT 'LAVORO AUTONOMO ABITUALE',
  -- INPS
  soggetto_inps BOOLEAN DEFAULT false,
  codice_inps TEXT,
  quota_carico_percipiente NUMERIC(5,2) DEFAULT 0,
  quota_carico_azienda NUMERIC(5,2) DEFAULT 0,
  massimale_inps_raggiunto BOOLEAN DEFAULT false,
  -- Cassa previdenza
  soggetto_cassa_prev BOOLEAN DEFAULT false,
  percentuale_cassa_prev NUMERIC(5,2) DEFAULT 0,
  -- ENASARCO
  soggetto_enasarco BOOLEAN DEFAULT false,
  codice_enasarco TEXT,
  quota_enasarco_percipiente NUMERIC(5,2) DEFAULT 0,
  quota_enasarco_azienda NUMERIC(5,2) DEFAULT 0,
  massimale_enasarco_raggiunto BOOLEAN DEFAULT false,
  -- Stato
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, codice)
);

ALTER TABLE percipienti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_percipienti" ON percipienti FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 3: CAUSALI
-- ═══════════════════════════════════════════

-- CAUSALI CONTABILI
CREATE TABLE IF NOT EXISTS causali_contabili (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  codice TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  tipo TEXT NOT NULL, -- fattura_fornitore, fattura_cliente, pagamento, incasso, parcella, giroconto, apertura, chiusura, corrispettivo
  -- Gestione partite
  gestione_partite TEXT DEFAULT 'ignora', -- ignora, apre, chiude
  partitario_tipo TEXT, -- cliente, fornitore
  -- Registro IVA
  registro_iva TEXT, -- vendite, acquisti, corrispettivi, null
  -- Righe predefinite
  righe_predefinite JSONB,
  -- Flags
  genera_scadenza BOOLEAN DEFAULT false,
  richiede_documento BOOLEAN DEFAULT false,
  richiede_iva BOOLEAN DEFAULT true,
  genera_ritenuta BOOLEAN DEFAULT false, -- Per parcelle professionisti
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, codice)
);

ALTER TABLE causali_contabili ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_causali_contabili" ON causali_contabili FOR ALL USING (true) WITH CHECK (true);

-- CAUSALI IVA
CREATE TABLE IF NOT EXISTS causali_iva (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  codice TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  aliquota NUMERIC(5,2) DEFAULT 0,
  -- Classificazione
  tipo TEXT, -- imponibile, non_imponibile, esente, escluso
  regime TEXT DEFAULT 'normale',
  -- Detraibilità
  detraibile BOOLEAN DEFAULT true,
  percentuale_detraibilita NUMERIC(5,2) DEFAULT 100,
  -- FE
  codice_natura_fe TEXT, -- N1, N2, N3, N4, N5, N6, N7
  -- Flags
  include_liquidazione BOOLEAN DEFAULT true,
  include_dichiarazione BOOLEAN DEFAULT true,
  reverse_charge BOOLEAN DEFAULT false,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, codice)
);

ALTER TABLE causali_iva ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_causali_iva" ON causali_iva FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 4: DOCUMENTI E WORKFLOW AI
-- ═══════════════════════════════════════════

-- DOCUMENTI IMPORTATI
CREATE TABLE IF NOT EXISTS documenti_contabilita (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  -- File
  filename TEXT NOT NULL,
  file_path TEXT,
  file_url TEXT,
  mime_type TEXT,
  file_size INTEGER,
  -- Tipo documento
  tipo_documento TEXT, -- fattura_attiva, fattura_passiva, nota_credito, parcella, corrispettivo, altro
  -- Dati estratti
  numero_documento TEXT,
  data_documento DATE,
  -- Soggetto
  soggetto_denominazione TEXT,
  soggetto_piva TEXT,
  soggetto_cf TEXT,
  soggetto_tipo TEXT, -- cedente, cessionario
  -- Importi
  imponibile NUMERIC(15,2),
  iva NUMERIC(15,2),
  totale NUMERIC(15,2),
  -- Match
  conto_id UUID REFERENCES piano_conti(id),
  conto_match_type TEXT, -- auto, manual, none
  -- Workflow
  workflow_status TEXT DEFAULT 'imported', -- imported, parsed, proposed, validated, registered, error
  validation_status TEXT DEFAULT 'pending', -- pending (🟡), confirmed (🟢), error (🔴)
  -- AI
  ai_confidence NUMERIC(3,2),
  ai_processed_at TIMESTAMPTZ,
  -- Operatore
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  note_operatore TEXT,
  -- Registrazione
  prima_nota_id UUID,
  registered_at TIMESTAMPTZ,
  -- Bulk
  bulk_operation_id UUID,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documenti_contabilita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_documenti_contabilita" ON documenti_contabilita FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_doc_cont_societa ON documenti_contabilita(societa_id);
CREATE INDEX idx_doc_cont_workflow ON documenti_contabilita(workflow_status);
CREATE INDEX idx_doc_cont_validation ON documenti_contabilita(validation_status);

-- PROPOSTE AI
CREATE TABLE IF NOT EXISTS ai_proposte (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  documento_id UUID REFERENCES documenti_contabilita(id) ON DELETE CASCADE,
  -- Proposta
  causale_codice TEXT,
  conto_cliente_fornitore_id UUID REFERENCES piano_conti(id),
  conto_costo_ricavo_id UUID REFERENCES piano_conti(id),
  causale_iva_codice TEXT,
  -- Righe proposte
  righe_proposte JSONB,
  -- Confidence
  confidence NUMERIC(3,2),
  is_transitorio BOOLEAN DEFAULT false, -- usa conto transitorio
  motivo_transitorio TEXT,
  -- Stato
  accettata BOOLEAN,
  modificata BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_proposte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ai_proposte" ON ai_proposte FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 5: PRIMA NOTA
-- ═══════════════════════════════════════════

-- PRIMA NOTA TESTATA
CREATE TABLE IF NOT EXISTS prima_nota (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  -- Numerazione
  esercizio INTEGER NOT NULL,
  numero_registrazione INTEGER NOT NULL,
  protocollo_iva INTEGER,
  registro_iva TEXT, -- vendite, acquisti, corrispettivi
  -- Date
  data_registrazione DATE NOT NULL,
  data_documento DATE,
  data_competenza_iva DATE,
  -- Documento
  numero_documento TEXT,
  causale_id UUID REFERENCES causali_contabili(id),
  causale_codice TEXT,
  descrizione TEXT,
  -- Soggetto
  conto_cliente_fornitore_id UUID REFERENCES piano_conti(id),
  cliente_fornitore_codice TEXT,
  cliente_fornitore_nome TEXT,
  -- Totali
  totale_dare NUMERIC(15,2) DEFAULT 0,
  totale_avere NUMERIC(15,2) DEFAULT 0,
  totale_imponibile NUMERIC(15,2) DEFAULT 0,
  totale_iva NUMERIC(15,2) DEFAULT 0,
  -- Stato
  stato TEXT DEFAULT 'provvisoria', -- provvisoria, definitiva, annullata
  -- Origine
  documento_id UUID REFERENCES documenti_contabilita(id),
  tipo_registrazione TEXT DEFAULT 'manuale', -- manuale, import_fatture, corrispettivo
  -- Ritenute
  genera_ritenuta BOOLEAN DEFAULT false,
  ritenuta_id UUID,
  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, esercizio, numero_registrazione)
);

ALTER TABLE prima_nota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_prima_nota" ON prima_nota FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_pn_societa ON prima_nota(societa_id);
CREATE INDEX idx_pn_esercizio ON prima_nota(esercizio);
CREATE INDEX idx_pn_data ON prima_nota(data_registrazione);
CREATE INDEX idx_pn_stato ON prima_nota(stato);

-- PRIMA NOTA RIGHE (movimenti contabili)
CREATE TABLE IF NOT EXISTS prima_nota_righe (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prima_nota_id UUID REFERENCES prima_nota(id) ON DELETE CASCADE,
  riga_numero INTEGER NOT NULL,
  -- Conto
  conto_id UUID REFERENCES piano_conti(id),
  conto_codice TEXT,
  conto_descrizione TEXT,
  descrizione_riga TEXT,
  -- Importi
  importo_dare NUMERIC(15,2) DEFAULT 0,
  importo_avere NUMERIC(15,2) DEFAULT 0,
  -- Partitario
  apre_partita BOOLEAN DEFAULT false,
  chiude_partita BOOLEAN DEFAULT false,
  partita_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prima_nota_righe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_pn_righe" ON prima_nota_righe FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_pn_righe_pn ON prima_nota_righe(prima_nota_id);

-- PRIMA NOTA MOVIMENTI IVA
CREATE TABLE IF NOT EXISTS prima_nota_iva (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prima_nota_id UUID REFERENCES prima_nota(id) ON DELETE CASCADE,
  riga_numero INTEGER NOT NULL,
  -- Causale IVA
  causale_iva_id UUID REFERENCES causali_iva(id),
  causale_iva_codice TEXT,
  descrizione TEXT,
  -- Importi
  imponibile NUMERIC(15,2) DEFAULT 0,
  imposta NUMERIC(15,2) DEFAULT 0,
  imposta_non_detraibile NUMERIC(15,2) DEFAULT 0,
  -- Aliquota
  aliquota NUMERIC(5,2),
  percentuale_detraibilita NUMERIC(5,2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prima_nota_iva ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_pn_iva" ON prima_nota_iva FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 6: PARTITARIO E SCADENZE
-- ═══════════════════════════════════════════

-- PARTITARIO
CREATE TABLE IF NOT EXISTS partitario (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- cliente, fornitore
  conto_id UUID REFERENCES piano_conti(id),
  -- Documento origine
  prima_nota_id UUID REFERENCES prima_nota(id),
  numero_documento TEXT,
  data_documento DATE,
  -- Scadenza
  data_scadenza DATE,
  -- Importi
  importo_originale NUMERIC(15,2) NOT NULL,
  importo_pagato NUMERIC(15,2) DEFAULT 0,
  importo_residuo NUMERIC(15,2),
  -- Stato
  stato TEXT DEFAULT 'aperta', -- aperta, parziale, chiusa
  -- Chiusura
  chiusa_da_prima_nota_id UUID REFERENCES prima_nota(id),
  data_chiusura DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE partitario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_partitario" ON partitario FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_partitario_societa ON partitario(societa_id);
CREATE INDEX idx_partitario_stato ON partitario(stato);
CREATE INDEX idx_partitario_scadenza ON partitario(data_scadenza);

-- ═══════════════════════════════════════════
-- SEZIONE 7: RITENUTE E CU
-- ═══════════════════════════════════════════

-- RITENUTE D'ACCONTO
CREATE TABLE IF NOT EXISTS ritenute (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  percipiente_id UUID REFERENCES percipienti(id),
  -- Documento origine
  prima_nota_id UUID REFERENCES prima_nota(id),
  numero_documento TEXT,
  data_documento DATE,
  -- Importi
  imponibile NUMERIC(15,2),
  aliquota_ritenuta NUMERIC(5,2) DEFAULT 20,
  importo_ritenuta NUMERIC(15,2),
  importo_netto NUMERIC(15,2),
  -- Contributi
  imponibile_inps NUMERIC(15,2),
  contributo_inps NUMERIC(15,2),
  contributo_enasarco NUMERIC(15,2),
  contributo_cassa_prev NUMERIC(15,2),
  -- Scadenza e pagamento
  data_scadenza_versamento DATE,
  data_versamento DATE,
  versata BOOLEAN DEFAULT false,
  -- CU
  inclusa_cu BOOLEAN DEFAULT true,
  cu_generata BOOLEAN DEFAULT false,
  anno_cu INTEGER,
  -- Codice tributo
  codice_tributo TEXT DEFAULT '001',
  causale_cu TEXT DEFAULT 'A',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ritenute ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ritenute" ON ritenute FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_ritenute_societa ON ritenute(societa_id);
CREATE INDEX idx_ritenute_percipiente ON ritenute(percipiente_id);
CREATE INDEX idx_ritenute_anno ON ritenute(anno_cu);

-- CERTIFICAZIONI UNICHE
CREATE TABLE IF NOT EXISTS certificazioni_uniche (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  anno INTEGER NOT NULL,
  percipiente_id UUID REFERENCES percipienti(id),
  -- Dati percipiente
  codice_fiscale_percipiente TEXT,
  cognome TEXT,
  nome TEXT,
  -- Totali anno
  totale_compensi NUMERIC(15,2),
  totale_ritenute NUMERIC(15,2),
  totale_contributi_inps NUMERIC(15,2),
  -- Stato
  stato TEXT DEFAULT 'bozza', -- bozza, generata, inviata
  file_tel_path TEXT,
  data_generazione TIMESTAMPTZ,
  data_invio TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE certificazioni_uniche ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_cu" ON certificazioni_uniche FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 8: LIQUIDAZIONI IVA
-- ═══════════════════════════════════════════

-- LIQUIDAZIONI IVA PERIODICHE
CREATE TABLE IF NOT EXISTS liquidazioni_iva (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  anno INTEGER NOT NULL,
  periodo INTEGER NOT NULL, -- 1-12 per mensile, 1-4 per trimestrale
  tipo_periodo TEXT DEFAULT 'mensile', -- mensile, trimestrale
  -- Totali
  iva_vendite NUMERIC(15,2) DEFAULT 0,
  iva_acquisti NUMERIC(15,2) DEFAULT 0,
  iva_dovuta NUMERIC(15,2) DEFAULT 0,
  iva_credito NUMERIC(15,2) DEFAULT 0,
  credito_periodo_precedente NUMERIC(15,2) DEFAULT 0,
  -- Risultato
  iva_da_versare NUMERIC(15,2) DEFAULT 0,
  credito_da_riportare NUMERIC(15,2) DEFAULT 0,
  -- Stato
  stato TEXT DEFAULT 'bozza', -- bozza, definitiva, versata
  data_versamento DATE,
  -- LIPE
  lipe_generata BOOLEAN DEFAULT false,
  lipe_file_path TEXT,
  lipe_inviata BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, anno, periodo)
);

ALTER TABLE liquidazioni_iva ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_liq_iva" ON liquidazioni_iva FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 9: BULK OPERATIONS E REGOLE AI
-- ═══════════════════════════════════════════

-- OPERAZIONI MASSIVE
CREATE TABLE IF NOT EXISTS bulk_operations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  tipo_operazione TEXT, -- update_conto, update_iva, conferma_tutti
  -- Filtri applicati
  filtri_applicati JSONB,
  -- Modifiche
  campo_modificato TEXT,
  valore_precedente JSONB,
  valore_nuovo JSONB,
  -- Documenti coinvolti
  documenti_ids UUID[],
  num_documenti INTEGER,
  -- Audit
  eseguita_da UUID,
  eseguita_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_bulk" ON bulk_operations FOR ALL USING (true) WITH CHECK (true);

-- REGOLE AUTOMATICHE AI
CREATE TABLE IF NOT EXISTS regole_automatiche (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descrizione TEXT,
  -- Condizioni (AND)
  condizioni JSONB NOT NULL,
  -- es: {"fornitore_piva": "123456", "descrizione_contiene": "hosting"}
  -- Azioni
  azioni JSONB NOT NULL,
  -- es: {"conto_id": "uuid", "causale_iva": "A1IW"}
  -- Priorità
  priorita INTEGER DEFAULT 100,
  -- Stato
  attiva BOOLEAN DEFAULT true,
  -- Stats
  volte_applicata INTEGER DEFAULT 0,
  ultima_applicazione TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE regole_automatiche ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_regole" ON regole_automatiche FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 10: CORRISPETTIVI
-- ═══════════════════════════════════════════

-- CORRISPETTIVI GIORNALIERI
CREATE TABLE IF NOT EXISTS corrispettivi (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  -- Totali
  totale_giornaliero NUMERIC(15,2) DEFAULT 0,
  -- Dettaglio per aliquota
  dettaglio_iva JSONB, -- [{"aliquota": 22, "imponibile": 100, "iva": 22}, ...]
  -- Registrazione
  prima_nota_id UUID REFERENCES prima_nota(id),
  registrato BOOLEAN DEFAULT false,
  -- Note
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, data)
);

ALTER TABLE corrispettivi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_corrispettivi" ON corrispettivi FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- SEZIONE 11: FUNZIONI UTILITY
-- ═══════════════════════════════════════════

-- Funzione per duplicare società
CREATE OR REPLACE FUNCTION duplica_societa(
  p_societa_id UUID,
  p_nuovo_codice TEXT,
  p_nuova_denominazione TEXT
) RETURNS UUID AS $$
DECLARE
  v_nuova_societa_id UUID;
BEGIN
  -- Crea nuova società
  INSERT INTO societa (codice, denominazione, regime_contabile, esercizio_da, esercizio_a)
  SELECT p_nuovo_codice, p_nuova_denominazione, regime_contabile, esercizio_da, esercizio_a
  FROM societa WHERE id = p_societa_id
  RETURNING id INTO v_nuova_societa_id;

  -- Duplica piano dei conti (senza saldi)
  INSERT INTO piano_conti (societa_id, codice, codice_mastro, codice_mastrino, codice_conto, codice_sottoconto, 
    descrizione, tipo, natura, sezione, livello, is_cliente, is_fornitore, is_banca, is_cassa, is_iva, is_professionista,
    anagrafica_tipo, contropartita_id, causale_iva_default)
  SELECT v_nuova_societa_id, codice, codice_mastro, codice_mastrino, codice_conto, codice_sottoconto,
    descrizione, tipo, natura, sezione, livello, is_cliente, is_fornitore, is_banca, is_cassa, is_iva, is_professionista,
    anagrafica_tipo, contropartita_id, causale_iva_default
  FROM piano_conti WHERE societa_id = p_societa_id;

  -- Duplica causali contabili
  INSERT INTO causali_contabili (societa_id, codice, descrizione, tipo, gestione_partite, 
    partitario_tipo, registro_iva, righe_predefinite, genera_scadenza, richiede_documento, richiede_iva, genera_ritenuta)
  SELECT v_nuova_societa_id, codice, descrizione, tipo, gestione_partite,
    partitario_tipo, registro_iva, righe_predefinite, genera_scadenza, richiede_documento, richiede_iva, genera_ritenuta
  FROM causali_contabili WHERE societa_id = p_societa_id;

  -- Duplica causali IVA
  INSERT INTO causali_iva (societa_id, codice, descrizione, aliquota, tipo, regime,
    detraibile, percentuale_detraibilita, codice_natura_fe, include_liquidazione, include_dichiarazione, reverse_charge)
  SELECT v_nuova_societa_id, codice, descrizione, aliquota, tipo, regime,
    detraibile, percentuale_detraibilita, codice_natura_fe, include_liquidazione, include_dichiarazione, reverse_charge
  FROM causali_iva WHERE societa_id = p_societa_id;

  -- Duplica regole automatiche
  INSERT INTO regole_automatiche (societa_id, nome, descrizione, condizioni, azioni, priorita)
  SELECT v_nuova_societa_id, nome, descrizione, condizioni, azioni, priorita
  FROM regole_automatiche WHERE societa_id = p_societa_id;

  RETURN v_nuova_societa_id;
END;
$$ LANGUAGE plpgsql;

-- Funzione per prossimo numero registrazione
CREATE OR REPLACE FUNCTION get_prossimo_numero_registrazione(p_societa_id UUID, p_esercizio INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_ultimo INTEGER;
BEGIN
  SELECT COALESCE(MAX(numero_registrazione), 0) INTO v_ultimo
  FROM prima_nota
  WHERE societa_id = p_societa_id AND esercizio = p_esercizio;
  
  RETURN v_ultimo + 1;
END;
$$ LANGUAGE plpgsql;

-- Funzione per prossimo protocollo IVA
CREATE OR REPLACE FUNCTION get_prossimo_protocollo_iva(p_societa_id UUID, p_registro TEXT, p_anno INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_ultimo INTEGER;
BEGIN
  SELECT COALESCE(MAX(protocollo_iva), 0) INTO v_ultimo
  FROM prima_nota
  WHERE societa_id = p_societa_id 
    AND registro_iva = p_registro 
    AND EXTRACT(YEAR FROM data_registrazione) = p_anno;
  
  RETURN v_ultimo + 1;
END;
$$ LANGUAGE plpgsql;
