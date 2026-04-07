export async function aiChatHandler({ body }) {
  try {
    const message = body?.message
    const context = body?.context || {}

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `
Sei l'assistente di FiscoSim.

CONTESTO:
- Modulo: currentModule,
- Cliente: selectedClient?.name

Rispondi in modo operativo e concreto.
`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    })

    // Il vecchio endpoint rispondeva comunque 200 anche su response non-ok.
    if (!response.ok) {
      const text = await response.text()
      console.error('OpenAI error:', text, { context })
      return { status: 200, json: { reply: text } }
    }

    const data = await response.json()

    const content = data.choices?.[0]?.message?.content

    let reply = 'Nessuna risposta'
    if (typeof content === 'string') {
      reply = content
    } else if (Array.isArray(content)) {
      reply = content.map((c) => c.text).join('')
    }

    return { status: 200, json: { reply } }
  } catch (err) {
    console.error('SERVER ERROR:', err)
    return { status: 200, json: { reply: 'Errore interno AI' } }
  }
}

