import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the frontend talks to Django via a relative `/api` baseURL so the
// same code works in production (where Caddy reverse-proxies same-origin).
// Locally, Vite needs to forward those calls to the Django dev server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
        // Keep cookies same-origin so session + csrftoken are set on :5173
        // and sent back on subsequent requests.
      },
    },
  },
})
