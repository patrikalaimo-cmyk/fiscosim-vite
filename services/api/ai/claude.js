export async function claudeHandler({ body }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { status: 200, json: { error: 'ANTHROPIC_API_KEY non configurata sul server', configured: false } }
  }

  try {
    // Non passare il campo "action" ad Anthropic.
    const { action: _action, ...payload } = body || {}

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        status: response.status,
        json: { error: data.error?.message || 'Errore Anthropic', detail: data },
      }
    }

    return { status: 200, json: data }
  } catch (err) {
    return { status: 500, json: { error: err.message } }
  }
}
