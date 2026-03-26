import { useState } from "react";

export default function AIChat() {
  const [aiOpen, setAiOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  function sendMessage() {
  if (!input.trim()) return;

  const userMessage = input;

  setMessages(prev => [
    ...prev,
    { role: "user", content: userMessage }
  ]);

  setInput("");

  fetch("/api/ai-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: userMessage,
      context: window.fiscosimContext || {}
    })
  })
    .then(res => res.json())
    .then(data => {
      setMessages(prev => [
        ...prev,
        { role: "ai", content: data.reply }
      ]);
    });


  return (
    <>
      {/* BOTTONE */}
      <button
        onClick={() => setAiOpen(true)}
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          padding: "8px 14px",
          borderRadius: "999px",
          background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
          color: "white",
          border: "none",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        🤖 AI
      </button>

      {/* CHAT */}
      {aiOpen && (
        <div
          style={{
            position: "fixed",
            top: "60px",
            right: "20px",
            width: "350px",
            height: "400px",
            background: "#0f172a",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            zIndex: 1000
          }}
        >
          {/* HEADER */}
          <div style={{
            padding: "10px",
            background: "#1e293b",
            color: "white",
            display: "flex",
            justifyContent: "space-between"
          }}>
            <span>🤖 AI FiscoSim</span>
            <span style={{ cursor: "pointer" }} onClick={() => setAiOpen(false)}>✕</span>
          </div>

          {/* MESSAGES */}
          <div style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: "8px"
                }}
              >
                <div
                  style={{
                    background: m.role === "user" ? "#0ea5e9" : "#334155",
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: "12px",
                    maxWidth: "80%"
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>

          {/* INPUT */}
          <div style={{ padding: "8px", borderTop: "1px solid #334155" }}>
            <div style={{
              display: "flex",
              background: "#1e293b",
              borderRadius: "999px",
              padding: "6px"
            }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Chiedimi qualcosa..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "white"
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <button onClick={sendMessage} style={{
                background: "#0ea5e9",
                border: "none",
                borderRadius: "50%",
                width: "30px",
                height: "30px",
                color: "white"
              }}>
                ➤
              </button>
            </div>
          </div>

        </div>
      )}
    </>
  );
}