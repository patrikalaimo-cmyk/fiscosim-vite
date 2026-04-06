import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Frontend dev server port (keep it different from backend API port).
    port: 5173,
    proxy: {
      // Ollama diretto (Import unificato / Mistral): non passa da dev-api → meno 502 se :3001 non gira.
      // Richiede `ollama serve` su 11434 (o OLLAMA_PROXY_TARGET).
      '/ollama-proxy': {
        target: process.env.OLLAMA_PROXY_TARGET || 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama-proxy/, ''),
        // Se vedi 500/502: avvia `ollama serve`, `ollama pull <modello>`, allinea VITE_OLLAMA_MODEL / OLLAMA_MODEL
      },
      // Dev note:
      // - Vite serves the frontend on :5173
      // - Run your local API server on :3001 (e.g. `npm run dev:api`)
      // - Then Vite will forward /api/* calls to that backend.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // POST /prima-nota/bulk-update (stesso backend di dev-api)
      '/prima-nota': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  }
})
