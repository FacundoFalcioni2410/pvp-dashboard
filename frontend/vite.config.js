import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const silentError = (err, req, res) => {
  res.writeHead(503)
  res.end()
}

export default defineConfig({
  plugins: [react()],
  server: {
    // React Fast Refresh injects an inline preamble that conflicts with strict
    // browser CSP policies. Full reloads are more reliable for local dev.
    hmr: false,
    headers: {
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 120000,
        timeout: 120000,
        onError: silentError,
      },
    },
  },
})
