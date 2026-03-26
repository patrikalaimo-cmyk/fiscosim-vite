export default async function handler(req, res) {
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

const message = body.message;
const context = body.context || {};

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
       messages: [
  {
    role: "system",
    content: `
Sei l'assistente di FiscoSim.

CONTESTO:
- Modulo: currentModule,
- Cliente: selectedClient?.name

Rispondi in modo operativo e concreto.
`
  },
  {
    role: "user",
    content: message
  }
]
      })
    });

    // 🔥 CONTROLLO CRITICO
    if (!response.ok) {
  const text = await response.text();
  console.error("OpenAI error:", text);

  return res.status(200).json({
    reply: text
  });
}

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content;

    let reply = "Nessuna risposta";

    if (typeof content === "string") {
      reply = content;
    } else if (Array.isArray(content)) {
      reply = content.map(c => c.text).join("");
    }

    res.status(200).json({ reply });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    res.status(200).json({
      reply: "Errore interno AI"
    });
  }
}