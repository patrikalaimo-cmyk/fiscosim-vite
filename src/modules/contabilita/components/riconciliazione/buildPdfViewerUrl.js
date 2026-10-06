export function buildPdfViewerUrl(fileUrl, { page = 1, zoomMode = 'fit', zoomPercent = 100 } = {}) {
  if (!fileUrl) return ''
  const safePage = Number(page) > 0 ? Math.floor(Number(page)) : 1
  if (zoomMode === 'fit') {
    return `${fileUrl}#page=${safePage}&zoom=page-width`
  }
  const safeZoom = Number.isFinite(Number(zoomPercent)) ? Math.max(25, Math.min(400, Math.round(Number(zoomPercent)))) : 100
  return `${fileUrl}#page=${safePage}&zoom=${safeZoom}`
}
