-- ============================================
-- MODULO CONTABILITÀ - SCHEMA DATABASE
-- FiscoSim v3.0
-- ============================================

-- SOCIETÀ/AZIENDE (per duplicazione)
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
  regime_contabile TEXT DEFAULT 'ordinaria', -- ordinaria, semplificata, professionisti, iva_cassa
  esercizio_da DATE,
  esercizio_a DATE,
  attiva BOOLEAN DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE societa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_societa" ON societa FOR ALL USING (true) WITH CHECK (true);

-- PIANO DEI CONTI
CREATE TABLE IF NOT EXISTS piano_conti (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  codice TEXT NOT NULL, -- es. "01 10 0101"
  codice_mastro TEXT, -- es. "01"
  codice_conto TEXT, -- es. "01 10"
  codice_sottoconto TEXT, -- es. "01 10 0101"
  descrizione TEXT NOT NULL,
  tipo TEXT NOT NULL, -- patrimoniale, economico
  natura TEXT, -- attivo, passivo, costo, ricavo
  sezione TEXT, -- dare, avere
  livello INTEGER DEFAULT 1, -- 1=mastro, 2=conto, 3=sottoconto
  parent_id UUID REFERENCES piano_conti(id),
  -- Flags speciali
  is_cliente BOOLEAN DEFAULT false,
  is_fornitore BOOLEAN DEFAULT false,
  is_banca BOOLEAN DEFAULT false,
  is_cassa BOOLEAN DEFAULT false,
  is_iva BOOLEAN DEFAULT false,
  -- Anagrafica collegata (per clienti/fornitori)
  anagrafica_tipo TEXT, -- cliente_italia, cliente_estero, fornitore_italia, fornitore_estero, professionista
  anagrafica_cf TEXT,
  anagrafica_piva TEXT,
  -- Contabilità
  saldo_iniziale NUMERIC(15,2) DEFAULT 0,
  saldo_dare NUMERIC(15,2) DEFAULT 0,
  saldo_avere NUMERIC(15,2) DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, codice)
);

ALTER TABLE piano_conti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_piano_conti" ON piano_conti FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_piano_conti_societa ON piano_conti(societa_id);
CREATE INDEX IF NOT EXISTS idx_piano_conti_codice ON piano_conti(codice);
CREATE INDEX IF NOT EXISTS idx_piano_conti_tipo ON piano_conti(tipo);

-- CAUSALI CONTABILI
CREATE TABLE IF NOT EXISTS causali_contabili (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  codice TEXT NOT NULL, -- es. "FF", "FC", "PF"
  descrizione TEXT NOT NULL,
  tipo TEXT NOT NULL, -- fattura_fornitore, fattura_cliente, pagamento, incasso, giroconto, apertura, chiusura
  -- Gestione partite
  gestione_partite TEXT DEFAULT 'ignora', -- ignora, apre, chiude
  partitario_tipo TEXT, -- cliente, fornitore, null
  -- Righe predefinite (JSON array)
  righe_predefinite JSONB, -- [{conto_dare, conto_avere, descrizione}]
  -- Flags
  genera_scadenza BOOLEAN DEFAULT false,
  richiede_documento BOOLEAN DEFAULT false,
  richiede_iva BOOLEAN DEFAULT false,
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
  codice TEXT NOT NULL, -- es. "A1IW", "B3", "C1"
  descrizione TEXT NOT NULL,
  aliquota NUMERIC(5,2) DEFAULT 0, -- es. 22.00
  -- Classificazione
  tipo TEXT, -- imponibile, non_imponibile, esente, escluso
  regime TEXT DEFAULT 'normale', -- normale, acquisto_cee, esente, escluso
  -- Detraibilità
  detraibile BOOLEAN DEFAULT true,
  percentuale_detraibilita NUMERIC(5,2) DEFAULT 100,
  -- Per fattura elettronica
  codice_natura_fe TEXT, -- N1, N2, N3, N4, N5, N6, N7
  -- Flags
  include_liquidazione BOOLEAN DEFAULT true,
  include_dichiarazione BOOLEAN DEFAULT true,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societa_id, codice)
);

ALTER TABLE causali_iva ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_causali_iva" ON causali_iva FOR ALL USING (true) WITH CHECK (true);

-- PRIMA NOTA - TESTATA
CREATE TABLE IF NOT EXISTS prima_nota (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  numero_registrazione SERIAL,
  data_registrazione DATE NOT NULL,
  data_documento DATE,
  numero_documento TEXT,
  causale_id UUID REFERENCES causali_contabili(id),
  causale_codice TEXT,
  descrizione TEXT,
  -- Riferimenti
  cliente_fornitore_id UUID REFERENCES piano_conti(id),
  cliente_fornitore_nome TEXT,
  -- Totali
  totale_dare NUMERIC(15,2) DEFAULT 0,
  totale_avere NUMERIC(15,2) DEFAULT 0,
  -- Stato
  stato TEXT DEFAULT 'provvisoria', -- provvisoria, definitiva, annullata
  -- Import fatture
  fattura_xml_id UUID,
  documento_import_id UUID,
  -- Audit
  created_by UUID REFERENCES utenti_studio(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prima_nota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_prima_nota" ON prima_nota FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prima_nota_societa ON prima_nota(societa_id);
CREATE INDEX IF NOT EXISTS idx_prima_nota_data ON prima_nota(data_registrazione);
CREATE INDEX IF NOT EXISTS idx_prima_nota_stato ON prima_nota(stato);

-- PRIMA NOTA - RIGHE
CREATE TABLE IF NOT EXISTS prima_nota_righe (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prima_nota_id UUID REFERENCES prima_nota(id) ON DELETE CASCADE,
  riga_numero INTEGER NOT NULL,
  conto_id UUID REFERENCES piano_conti(id),
  conto_codice TEXT,
  conto_descrizione TEXT,
  descrizione_riga TEXT,
  -- Importi
  importo_dare NUMERIC(15,2) DEFAULT 0,
  importo_avere NUMERIC(15,2) DEFAULT 0,
  -- IVA
  causale_iva_id UUID REFERENCES causali_iva(id),
  causale_iva_codice TEXT,
  imponibile NUMERIC(15,2) DEFAULT 0,
  iva NUMERIC(15,2) DEFAULT 0,
  -- Partitario
  partita_aperta BOOLEAN DEFAULT false,
  partita_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prima_nota_righe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_prima_nota_righe" ON prima_nota_righe FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prima_nota_righe_pn ON prima_nota_righe(prima_nota_id);
CREATE INDEX IF NOT EXISTS idx_prima_nota_righe_conto ON prima_nota_righe(conto_id);

-- PARTITARIO (SCADENZE CLIENTI/FORNITORI)
CREATE TABLE IF NOT EXISTS partitario (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- cliente, fornitore
  conto_id UUID REFERENCES piano_conti(id),
  conto_codice TEXT,
  conto_descrizione TEXT,
  -- Documento
  prima_nota_id UUID REFERENCES prima_nota(id),
  numero_documento TEXT,
  data_documento DATE,
  data_scadenza DATE,
  -- Importi
  importo_originale NUMERIC(15,2) NOT NULL,
  importo_pagato NUMERIC(15,2) DEFAULT 0,
  importo_residuo NUMERIC(15,2),
  -- Stato
  stato TEXT DEFAULT 'aperta', -- aperta, parziale, chiusa
  -- Collegamento incasso/pagamento
  chiusa_da_prima_nota_id UUID REFERENCES prima_nota(id),
  data_chiusura DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE partitario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_partitario" ON partitario FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_partitario_societa ON partitario(societa_id);
CREATE INDEX IF NOT EXISTS idx_partitario_conto ON partitario(conto_id);
CREATE INDEX IF NOT EXISTS idx_partitario_stato ON partitario(stato);
CREATE INDEX IF NOT EXISTS idx_partitario_scadenza ON partitario(data_scadenza);

-- CODA IMPORT FATTURE (per workflow conferma operatore)
CREATE TABLE IF NOT EXISTS coda_import_fatture (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  -- Origine
  fattura_xml_id UUID,
  documento_import_id UUID,
  filename TEXT,
  -- Dati estratti
  tipo_fattura TEXT, -- attiva, passiva
  numero_documento TEXT,
  data_documento DATE,
  cedente_denominazione TEXT,
  cedente_piva TEXT,
  cessionario_denominazione TEXT,
  cessionario_piva TEXT,
  cessionario_cf TEXT,
  importo_totale NUMERIC(15,2),
  imponibile NUMERIC(15,2),
  iva NUMERIC(15,2),
  -- Proposte AI
  conto_cliente_fornitore_id UUID REFERENCES piano_conti(id),
  conto_cliente_fornitore_proposto TEXT,
  causale_proposta TEXT,
  causale_iva_proposta TEXT,
  conto_costo_ricavo_proposto TEXT,
  scrittura_proposta JSONB, -- JSON con righe proposte
  -- Stato workflow
  stato TEXT DEFAULT 'in_attesa', -- in_attesa, in_lavorazione, confermata, sospesa, registrata, annullata
  -- Operatore
  confermata_da UUID REFERENCES utenti_studio(id),
  confermata_at TIMESTAMPTZ,
  note_operatore TEXT,
  -- Prima nota generata
  prima_nota_id UUID REFERENCES prima_nota(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coda_import_fatture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_coda_import" ON coda_import_fatture FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_coda_import_societa ON coda_import_fatture(societa_id);
CREATE INDEX IF NOT EXISTS idx_coda_import_stato ON coda_import_fatture(stato);

-- FUNZIONE per duplicare società
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

  -- Duplica piano dei conti
  INSERT INTO piano_conti (societa_id, codice, codice_mastro, codice_conto, codice_sottoconto, 
    descrizione, tipo, natura, sezione, livello, is_cliente, is_fornitore, is_banca, is_cassa, is_iva,
    anagrafica_tipo)
  SELECT v_nuova_societa_id, codice, codice_mastro, codice_conto, codice_sottoconto,
    descrizione, tipo, natura, sezione, livello, is_cliente, is_fornitore, is_banca, is_cassa, is_iva,
    anagrafica_tipo
  FROM piano_conti WHERE societa_id = p_societa_id;

  -- Duplica causali contabili
  INSERT INTO causali_contabili (societa_id, codice, descrizione, tipo, gestione_partite, 
    partitario_tipo, righe_predefinite, genera_scadenza, richiede_documento, richiede_iva)
  SELECT v_nuova_societa_id, codice, descrizione, tipo, gestione_partite,
    partitario_tipo, righe_predefinite, genera_scadenza, richiede_documento, richiede_iva
  FROM causali_contabili WHERE societa_id = p_societa_id;

  -- Duplica causali IVA
  INSERT INTO causali_iva (societa_id, codice, descrizione, aliquota, tipo, regime,
    detraibile, percentuale_detraibilita, codice_natura_fe, include_liquidazione, include_dichiarazione)
  SELECT v_nuova_societa_id, codice, descrizione, aliquota, tipo, regime,
    detraibile, percentuale_detraibilita, codice_natura_fe, include_liquidazione, include_dichiarazione
  FROM causali_iva WHERE societa_id = p_societa_id;

  RETURN v_nuova_societa_id;
END;
$$ LANGUAGE plpgsql;
