import { sb } from '../../lib/supabase'

export async function getContoFornitore({ societaId, soggettoDenominazione }) {
  try {
    const den = String(soggettoDenominazione || '').trim()
    if (!societaId || !den) return ''

    const { data, error } = await sb
      .from('prima_nota_righe')
      .select('conto_id, prima_nota!inner(id, societa_id, data_registrazione, cliente_fornitore_nome)')
      .eq('prima_nota.societa_id', societaId)
      .eq('prima_nota.cliente_fornitore_nome', den)
      .not('conto_id', 'is', null)
      .order('data_registrazione', { ascending: false, foreignTable: 'prima_nota' })
      .limit(1)

    if (error) throw error
    const contoId = data?.[0]?.conto_id
    return contoId || ''
  } catch (e) {
    console.error('[getContoFornitore] error', e)
    return ''
  }
}

