import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    outDir: 'dist',
    // Aumenta il limite di warning per il bundle grande
    chunkSizeWarningLimit: 2000,
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  }
})
