-- ============================================
-- MODULO BANCHE PSD2 - SCHEMA DATABASE
-- FiscoSim v3.0
-- ============================================

-- CONTI BANCARI COLLEGATI
CREATE TABLE IF NOT EXISTS conti_bancari (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  -- GoCardless IDs
  requisition_id TEXT,
  account_id TEXT UNIQUE,
  agreement_id TEXT,
  -- Dati conto
  nome TEXT NOT NULL,
  iban TEXT,
  bic TEXT,
  banca_nome TEXT,
  banca_logo TEXT,
  banca_id TEXT, -- institution_id
  -- Saldi
  saldo_disponibile NUMERIC(15,2),
  saldo_contabile NUMERIC(15,2),
  data_ultimo_sync TIMESTAMPTZ,
  -- Conto contabile collegato
  conto_piano_conti_id UUID REFERENCES piano_conti(id),
  -- Stato
  stato TEXT DEFAULT 'pending', -- pending, linked, expired, error
  data_scadenza_link DATE,
  errore TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conti_bancari ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_conti_bancari" ON conti_bancari FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_conti_bancari_societa ON conti_bancari(societa_id);

-- MOVIMENTI BANCARI
CREATE TABLE IF NOT EXISTS movimenti_bancari (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conto_bancario_id UUID REFERENCES conti_bancari(id) ON DELETE CASCADE,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  -- ID transazione banca
  transaction_id TEXT,
  -- Dati movimento
  data_operazione DATE NOT NULL,
  data_valuta DATE,
  importo NUMERIC(15,2) NOT NULL,
  valuta TEXT DEFAULT 'EUR',
  segno TEXT, -- dare, avere
  -- Descrizione
  descrizione TEXT,
  causale TEXT,
  riferimento TEXT, -- end-to-end ID
  -- Controparte
  controparte_nome TEXT,
  controparte_iban TEXT,
  -- Riconciliazione
  stato_riconciliazione TEXT DEFAULT 'da_riconciliare', -- da_riconciliare, proposto, confermato, ignorato
  -- Match automatico
  match_score INTEGER,
  match_confidence TEXT, -- high, medium, low
  -- Documento collegato
  documento_id UUID REFERENCES documenti_contabilita(id),
  partita_id UUID REFERENCES partitario(id),
  prima_nota_id UUID REFERENCES prima_nota(id),
  -- Riconciliazione manuale
  riconciliato_da UUID,
  riconciliato_at TIMESTAMPTZ,
  note TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conto_bancario_id, transaction_id)
);

ALTER TABLE movimenti_bancari ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_movimenti_bancari" ON movimenti_bancari FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_mov_bancari_conto ON movimenti_bancari(conto_bancario_id);
CREATE INDEX idx_mov_bancari_societa ON movimenti_bancari(societa_id);
CREATE INDEX idx_mov_bancari_data ON movimenti_bancari(data_operazione);
CREATE INDEX idx_mov_bancari_stato ON movimenti_bancari(stato_riconciliazione);

-- LOG SYNC BANCARI
CREATE TABLE IF NOT EXISTS log_sync_bancari (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conto_bancario_id UUID REFERENCES conti_bancari(id) ON DELETE CASCADE,
  data_sync TIMESTAMPTZ DEFAULT NOW(),
  -- Risultato
  successo BOOLEAN,
  movimenti_scaricati INTEGER DEFAULT 0,
  movimenti_nuovi INTEGER DEFAULT 0,
  errore TEXT,
  -- Date range
  data_da DATE,
  data_a DATE
);

ALTER TABLE log_sync_bancari ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_log_sync" ON log_sync_bancari FOR ALL USING (true) WITH CHECK (true);
