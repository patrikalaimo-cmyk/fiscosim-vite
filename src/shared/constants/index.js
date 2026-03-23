// ─── COSTANTI CONDIVISE ─────────────────────────────────────────
// Usate da più moduli — NON comunicare moduli direttamente,
// passare sempre per core/workflow.js

export const TIPO_CLIENTE = ['forfettario', 'ordinario', 'srl', 'snc', 'occasionale']

export const TIPO_LABEL = {
  forfettario: 'Forfettario',
  ordinario:   'Ordinario',
  srl:         'S.r.l.',
  snc:         'SNC/SAS',
  occasionale: 'Occasionale'
}

export const TIPO_COLOR = {
  forfettario: 'bdg-gold',
  ordinario:   'bdg-blue',
  srl:         'bdg-pu',
  snc:         'bdg-green',
  occasionale: 'bdg-red'
}

export const ALLEGATO_LABEL = {
  nessuno: 'Solo testo',
  pdf_app: 'PDF generato',
  pdf_f24: 'PDF F24'
}

export const CICLICITA_LABEL = {
  unica:        'Una tantum',
  annuale:      'Annuale',
  trimestrale:  'Trimestrale',
  mensile:      'Mensile'
}

export const MESI = [
  '', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

export const RUOLO_LABEL = {
  owner:         'Owner',
  admin:         'Admin',
  collaboratore: 'Collaboratore'
}

export const RUOLO_COLOR = {
  owner:         'bdg-gold',
  admin:         'bdg-blue',
  collaboratore: 'bdg-gray'
}

export const F24_STATO_LABEL = {
  da_pagare: 'Da pagare',
  pagato:    'Pagato',
  annullato: 'Annullato'
}

export const F24_STATO_COLOR = {
  da_pagare: 'bdg-red',
  pagato:    'bdg-green',
  annullato: 'bdg-gray'
}

// Document Hub
export const TIPO_DOC_LABEL = {
  fattura_acquisto:  'Fattura Acquisto',
  fattura_vendita:   'Fattura Vendita',
  f24:               'F24',
  avviso_ade:        'Avviso ADE',
  cassetto_fiscale:  'Cassetto Fiscale',
  contratto:         'Contratto',
  nes:               'NES',
  cu:                'CU',
  busta_paga:        'Busta Paga',
  estratto_conto:    'Estratto Conto',
  altro:             'Altro'
}

export const TIPO_DOC_COLOR = {
  fattura_acquisto:  'bdg-blue',
  fattura_vendita:   'bdg-green',
  f24:               'bdg-red',
  avviso_ade:        'bdg-gold',
  cassetto_fiscale:  'bdg-pu',
  contratto:         'bdg-cy',
  nes:               'bdg-blue',
  cu:                'bdg-green',
  busta_paga:        'bdg-gray',
  estratto_conto:    'bdg-gray',
  altro:             'bdg-gray'
}

export const MODULO_DEST_LABEL = {
  clienti:       '👤 Clienti',
  iva:           'IVA',
  f24:           'F24',
  agecon:        'AgeCon',
  contabilita:   'Contabilità',
  fatture:       'Fatture',
  varie:         'Varie'
}

export const STATO_DOC_LABEL = {
  pending:        'In attesa AI',
  manual_pending: '⏳ Da classificare',
  classified:     'Classificato',
  assigned:       'Assegnato',
  processed:      'Elaborato',
  error:          'Errore'
}

export const STATO_DOC_COLOR = {
  pending:        'bdg-gold',
  manual_pending: 'bdg-orange',
  classified:     'bdg-blue',
  assigned:       'bdg-cy',
  processed:      'bdg-green',
  error:          'bdg-red'
}

// Navigazione app
export const NAV = [
  {
    section: 'STUDIO',
    items: [
      { id: 'dashboard',    ico: '🏠', label: 'Dashboard' },
      { id: 'clienti',      ico: '👥', label: 'Clienti' },
      { id: 'import',       ico: '📤', label: 'Import Excel' },
      { id: 'utenti',       ico: '👤', label: 'Utenti Studio' },
      { id: 'impostazioni', ico: '⚙️', label: 'Impostazioni Studio' },
      { id: 'deleghe',      ico: '🔑', label: 'Deleghe Uniche' }
    ]
  },
  {
    section: 'DOCUMENT HUB',
    items: [
      { id: 'import_documenti',    ico: '📁', label: 'Import Documenti' },
      { id: 'export_dati',         ico: '📤', label: 'Export Dati' },
      { id: 'fatture_ade',         ico: '📥', label: 'Fatture Massive ADE' },
      { id: 'lettura_mail',        ico: '📧', label: 'Lettura Mail' },
      { id: 'richieste_fatture',   ico: '📡', label: 'Richieste Fatture ADE' }
    ]
  },
  {
    section: 'CONTABILITÀ',
    items: [
      { id: 'contabilita', ico: '📒', label: 'Prima Nota' },
      { id: 'piano_conti', ico: '🗂️', label: 'Piano dei Conti' },
      { id: 'partitario',  ico: '💳', label: 'Partitario' },
      { id: 'bilancio',    ico: '📊', label: 'Bilancio' }
    ]
  },
  {
    section: 'STRUMENTI',
    items: [
      { id: 'iva',          ico: '💧', label: 'Liquidazione IVA' },
      { id: 'f24',          ico: '📋', label: 'Gestione F24' },
      { id: 'simulatore',   ico: '📊', label: 'Simulatore Fiscale' },
      { id: 'ammortamenti', ico: '🏢', label: 'Ammortamenti' },
      { id: 'cu',           ico: '📜', label: 'Certificazioni Uniche' }
    ]
  },
  {
    section: 'COMUNICAZIONI',
    items: [
      { id: 'adempimenti', ico: '📬', label: 'Adempimenti' },
      { id: 'agenda',      ico: '📅', label: 'Agenda Invii' }
    ]
  }
]

// Permessi moduli per collaboratori
export const PERMESSI_MODULI = [
  { id: 'clienti',          label: 'Clienti',              ico: '👥', hasSoloAssegnati: true },
  { id: 'f24',              label: 'Gestione F24',         ico: '📋', hasSoloAssegnati: false },
  { id: 'iva',              label: 'Liquidazione IVA',     ico: '💧', hasSoloAssegnati: false },
  { id: 'ammortamenti',     label: 'Ammortamenti',         ico: '🏢', hasSoloAssegnati: false },
  { id: 'adempimenti',      label: 'Adempimenti',          ico: '📬', hasSoloAssegnati: false },
  { id: 'agenda',           label: 'Agenda Invii',         ico: '📅', hasSoloAssegnati: false },
  { id: 'simulatore',       label: 'Simulatore',           ico: '📊', hasSoloAssegnati: false },
  { id: 'import',           label: 'Import Excel',         ico: '📤', hasSoloAssegnati: false },
  { id: 'import_documenti', label: 'Import Documenti',     ico: '📁', hasSoloAssegnati: false },
  { id: 'dashboard',        label: 'Dashboard',            ico: '🏠', hasSoloAssegnati: false },
  { id: 'cu',               label: 'Certificazioni Uniche',ico: '📜', hasSoloAssegnati: false },
  { id: 'deleghe',          label: 'Deleghe Uniche',       ico: '🔑', hasSoloAssegnati: false },
  { id: 'richieste_fatture',label: 'Richieste Fatture',    ico: '📡', hasSoloAssegnati: false },
  { id: 'impostazioni',     label: 'Impostazioni Studio',  ico: '⚙️', hasSoloAssegnati: false }
]

export const PERMESSI_DEFAULT = Object.fromEntries(
  PERMESSI_MODULI.map(m => [m.id, { leggi: true, modifica: false, elimina: false, solo_assegnati: false }])
)

export const RUOLI_INFO = {
  owner:        { label: 'Owner',        color: 'bdg-gold', desc: 'Accesso totale · Gestione utenti e ruoli · Unico account amministratore' },
  admin:        { label: 'Admin',        color: 'bdg-blue', desc: 'Accesso totale a tutti i moduli · Non può gestire utenti studio' },
  collaboratore:{ label: 'Collaboratore',color: 'bdg-gray', desc: 'Permessi configurabili per ogni collaboratore' }
}

// Moduli attivabili per singolo cliente
export const MODULI_DISPONIBILI = [
  { id: 'iva',          ico: '💧', label: 'Liquidazione IVA' },
  { id: 'f24',          ico: '📋', label: 'Gestione F24' },
  { id: 'ammortamenti', ico: '🏢', label: 'Ammortamenti' },
  { id: 'adempimenti',  ico: '📬', label: 'Adempimenti' },
  { id: 'simulatore',   ico: '📊', label: 'Simulatore' },
]

export const MODULI_DEFAULT = ['iva', 'f24', 'ammortamenti', 'adempimenti', 'simulatore']
