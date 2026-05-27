import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Format: "YYYY-MM-DD HH:MM" in Israel time (Asia/Jerusalem) at build time,
// regardless of where the app is built (a CI box may be on UTC). The sv-SE
// locale yields an ISO-like "YYYY-MM-DD HH:MM" shape. Surfaced via
// __BUILD_TIMESTAMP__ — Layout.tsx shows it under the user card.
const __BUILD_TIMESTAMP__ = JSON.stringify(
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
)

// In dev, the frontend talks to Django via a relative `/api` baseURL so the
// same code works in production (where Caddy reverse-proxies same-origin).
// Locally, Vite needs to forward those calls to the Django dev server.
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIMESTAMP__,
  },
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
