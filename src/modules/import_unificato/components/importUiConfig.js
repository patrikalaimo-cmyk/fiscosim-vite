export const TIPI_DOCUMENTO = [
  { id: 'fattura_passiva', label: '📥 Fattura Passiva', color: '#4e8ef7' },
  { id: 'fattura_attiva', label: '📤 Fattura Attiva', color: '#34c27a' },
  { id: 'f24', label: '📋 F24', color: '#e05252' },
  { id: 'avviso_ade', label: '⚡ Avviso ADE', color: '#f59e0b' },
  { id: 'cu', label: '📜 CU', color: '#a78bfa' },
  { id: 'altro', label: '📄 Altro', color: '#7d8590' },
]

export const ALIQUOTE_IVA = [
  { val: '22', label: '22% — Ordinaria' },
  { val: '10', label: '10% — Ridotta' },
  { val: '5', label: '5% — Ridotta speciale' },
  { val: '4', label: '4% — Super ridotta' },
  { val: '0-esente', label: '0% — Esente art. 10' },
  { val: '0-escl', label: '0% — Escluso art. 15' },
  { val: '0-fc', label: '0% — Fuori campo IVA' },
  { val: '0-ns', label: '0% — Non soggetto' },
  { val: '0-rev', label: '0% — Reverse charge' },
]

export const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—'
