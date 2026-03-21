export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ error: 'No API key', env: Object.keys(process.env).filter(k => k.includes('ANTHROP')) });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Rispondi solo: OK' }]
      })
    });
    const data = await r.json();
    return res.json({ 
      status: r.status, 
      ok: r.ok,
      key_prefix: key.substring(0, 15) + '...',
      response: data.content?.[0]?.text || data.error || data
    });
  } catch(e) {
    return res.json({ error: e.message });
  }
}
