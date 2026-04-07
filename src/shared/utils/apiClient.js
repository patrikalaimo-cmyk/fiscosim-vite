export async function callAPI(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Errore')
  return data
}

export async function callSendEmail(payload) {
  return callAPI('/api/send-email', payload)
}

