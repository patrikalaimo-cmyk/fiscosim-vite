export const REG_PAGE_STYLE = {
  background: 'linear-gradient(180deg, rgba(8,21,37,.98), rgba(7,18,31,.995))',
  backgroundColor: 'rgba(7,18,31,.995)',
  minHeight: '100vh',
  height: '100%',
  paddingBottom: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
}

export const REG_CONTAINER_STYLE = {
  maxWidth: 1620,
  margin: '0 auto',
  padding: '0 1rem',
  width: '100%',
  flex: 1,
  minHeight: '100%',
  background: 'linear-gradient(180deg, rgba(8,21,37,.98), rgba(7,18,31,.995))',
  backgroundColor: 'rgba(7,18,31,.995)',
  display: 'flex',
  flexDirection: 'column',
}

export const REG_CARD_STYLE = {
  borderRadius: 16,
  border: '1px solid rgba(136,169,204,.09)',
  background: 'linear-gradient(180deg, rgba(14,34,52,.8), rgba(10,24,39,.9))',
  boxShadow: '0 10px 24px rgba(0,0,0,.12)',
  backdropFilter: 'blur(6px)',
}

export const REG_SUBCARD_STYLE = {
  borderRadius: 14,
  border: '1px solid rgba(136,169,204,.08)',
  background: 'linear-gradient(180deg, rgba(13,31,48,.72), rgba(10,24,39,.86))',
  boxShadow: '0 6px 18px rgba(0,0,0,.1)',
  backdropFilter: 'blur(6px)',
}

export const REG_INPUT_STYLE = {
  fontSize: '.8rem',
  padding: '.42rem .54rem',
  minHeight: 36,
  borderRadius: 12,
}

export const REG_SMALL_INPUT_STYLE = {
  fontSize: '.76rem',
  padding: '.34rem .48rem',
  minHeight: 32,
}

export const REG_BUTTON_PRIMARY_STYLE = {
  background: 'linear-gradient(180deg, #1f8f4d, #147640)',
  border: '1px solid rgba(95,230,141,.2)',
  color: '#effff1',
  boxShadow: '0 10px 18px rgba(11,86,42,.22)',
}

export const REG_BUTTON_DARK_STYLE = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(136,169,204,.18)',
  color: 'var(--tx)',
}

export const REG_SECTION_TITLE_STYLE = {
  fontSize: '.72rem',
  textTransform: 'uppercase',
  letterSpacing: '.12em',
  color: 'rgba(188,204,226,.78)',
  fontWeight: 700,
}

export const REG_LABEL_STYLE = {
  marginBottom: '.08rem',
  fontSize: '.52rem',
  letterSpacing: '.08em',
  whiteSpace: 'nowrap',
  lineHeight: 1,
}

export const REG_HINT_STYLE = {
  marginTop: '.18rem',
  fontSize: '.56rem',
  color: 'rgba(188,204,226,.68)',
  whiteSpace: 'nowrap',
}

export const REG_INLINE_BADGE_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '.28rem',
  padding: '.16rem .46rem',
  borderRadius: 999,
  fontSize: '.62rem',
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
}

export function formatMoney(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatShortDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('it-IT')
}

export function resolveSocietaLabel(societaAttiva) {
  if (!societaAttiva || typeof societaAttiva !== 'object') return '—'
  return (
    societaAttiva.ragione_sociale ||
    societaAttiva.denominazione ||
    societaAttiva.nome ||
    societaAttiva.label ||
    societaAttiva.descrizione ||
    societaAttiva.partita_iva ||
    societaAttiva.id ||
    '—'
  )
}

export function resolveCausaleLabel(item) {
  if (!item || typeof item !== 'object') return '—'
  const code = String(item.codice || item.code || item.sigla || item.id || '').trim()
  const descr = String(item.descrizione || item.description || item.denominazione || item.nome || '').trim()
  if (!code && !descr) return '—'
  if (!code) return descr
  if (!descr || descr === code) return code
  return `${code} - ${descr}`
}

export function resolveContoLabel(item) {
  if (!item || typeof item !== 'object') return '—'
  const code = String(item.conto_codice || item.codice || item.code || item.sigla || '').trim()
  const descr = String(item.conto_descrizione || item.descrizione || item.description || item.denominazione || item.nome || '').trim()
  if (!code && !descr) return '—'
  if (!code) return descr
  if (!descr || descr === code) return code
  return `${code} - ${descr}`
}
