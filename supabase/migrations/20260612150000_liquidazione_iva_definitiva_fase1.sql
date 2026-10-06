-- Migration additiva per Liquidazione IVA Definitiva Studio-Grade - Fase 1
-- Timestamp: 20260612150000

-- Estensione della tabella canonica public.liquidazione_iva
ALTER TABLE public.liquidazione_iva
  ADD COLUMN IF NOT EXISTS stato text NOT NULL DEFAULT 'provvisoria' CONSTRAINT liquidazione_iva_stato_check CHECK (stato IN ('provvisoria', 'definitiva', 'riaperta')),
  ADD COLUMN IF NOT EXISTS periodo_tipo text CONSTRAINT liquidazione_iva_periodo_tipo_check CHECK (periodo_tipo IN ('mensile', 'trimestrale')),
  ADD COLUMN IF NOT EXISTS periodo_anno int,
  ADD COLUMN IF NOT EXISTS periodo_numero int,
  ADD COLUMN IF NOT EXISTS iva_vendite_lorda numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_split_esclusa numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_debito_effettiva numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_acquisti_detraibile numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_acquisti_indetraibile numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_reverse_debito numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_reverse_credito numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_per_cassa_differita numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_per_cassa_rilasciata numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_periodo_precedente numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_anno_precedente numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_compensato_f24 numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acconto_iva_versato numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interessi_trimestrali numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debito_periodo numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debito_da_versare numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_periodo numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_da_riportare numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calcolata_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS definitiva_at timestamptz,
  ADD COLUMN IF NOT EXISTS riaperta_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_riapertura text,
  ADD COLUMN IF NOT EXISTS operatore_studio_id uuid REFERENCES public.utenti_studio(id) ON DELETE SET NULL;

-- Estensione della tabella public.liquidazioni_iva_righe
ALTER TABLE public.liquidazioni_iva_righe
  ADD COLUMN IF NOT EXISTS registro_iva_id uuid REFERENCES public.registri_iva(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prima_nota_id uuid REFERENCES public.prima_nota(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_riga text,
  ADD COLUMN IF NOT EXISTS registro_tipo text,
  ADD COLUMN IF NOT EXISTS iva_indetraibile numeric(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS split_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS esigibilita text,
  ADD COLUMN IF NOT EXISTS inclusa_in_liquidazione boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_esclusione text,
  ADD COLUMN IF NOT EXISTS iva numeric(15, 2) NOT NULL DEFAULT 0;

-- Aggiunta vincolo FK su liquidazione_id in public.liquidazioni_iva_righe se non esiste già
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'liquidazioni_iva_righe' AND constraint_name = 'fk_liquidazioni_iva_righe_liq'
  ) THEN
    ALTER TABLE public.liquidazioni_iva_righe
      ADD CONSTRAINT fk_liquidazioni_iva_righe_liq FOREIGN KEY (liquidazione_id) REFERENCES public.liquidazione_iva(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Aggiunta indici per ottimizzazione e unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidazione_iva_unique_periodo_societa
  ON public.liquidazione_iva (societa_id, periodo_tipo, periodo_anno, periodo_numero)
  WHERE societa_id IS NOT NULL AND periodo_tipo IS NOT NULL AND periodo_anno IS NOT NULL AND periodo_numero IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_liquidazione_iva_stato_societa
  ON public.liquidazione_iva (societa_id, stato);

CREATE INDEX IF NOT EXISTS idx_liquidazioni_iva_righe_liq_id
  ON public.liquidazioni_iva_righe (liquidazione_id);

-- Configurazione RLS su public.liquidazioni_iva_righe
ALTER TABLE public.liquidazioni_iva_righe ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'liquidazioni_iva_righe' AND policyname = 'liquidazioni_iva_righe_policy'
  ) THEN
    CREATE POLICY liquidazioni_iva_righe_policy ON public.liquidazioni_iva_righe
      FOR ALL
      USING (public.user_has_societa_access(societa_id))
      WITH CHECK (public.user_has_societa_access(societa_id));
  END IF;
END $$;
