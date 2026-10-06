export function detectBankStatementFileType(file) {
  const name = String(file?.name || '').toLowerCase()
  const mime = String(file?.type || '').toLowerCase()

  if (!file) return 'unsupported'
  if (name.endsWith('.csv') || mime.includes('csv')) return 'csv_candidate'
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || mime.includes('sheet') || mime.includes('excel')) return 'spreadsheet_candidate'
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) return 'image_candidate'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf_pending_parse'
  return 'unsupported'
}
