import { getSupabaseAdmin } from '../../lib/db.js'

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
}

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const societaId = String(req.query?.societaId || '').trim()
  if (!societaId) {
    return res.status(400).json({ error: 'societaId mancante' })
  }

  try {
    const db = await getSupabaseAdmin()
    const { data, error } = await db
      .from('piano_conti')
      .select('*')
      .eq('societa_id', societaId)
      .eq('attivo', true)
      .order('codice')

    if (error) {
      return res.status(500).json({ error: error.message || String(error) })
    }

    return res.status(200).json({
      data: Array.isArray(data) ? data : [],
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) })
  }
}
