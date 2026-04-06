-- Supabase / PostgreSQL: causali_iva — default per aliquota (fonte unica per resolveIva)
-- Eseguire una volta sul progetto Supabase (SQL Editor).

ALTER TABLE causali_iva
  ADD COLUMN IF NOT EXISTS is_default_per_aliquota boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN causali_iva.is_default_per_aliquota IS
  'Una sola causale true per aliquota tra 0,4,5,10,22 — usata da Impostazioni Procedure / resolveIva';

-- Opzionale: indice per letture rapide (non unico: vincolo applicativo in app)
CREATE INDEX IF NOT EXISTS idx_causali_iva_aliquota_default
  ON causali_iva (aliquota)
  WHERE is_default_per_aliquota = true;
