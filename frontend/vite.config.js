import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const silentError = (err, req, res) => {
  res.writeHead(503);
  res.end();
};

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 10000,
        timeout: 10000,
        onError: silentError,
      },
      '/upload': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 120000,
        timeout: 120000,
        onError: silentError,
      },
      '/upload-thresholds': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 120000,
        timeout: 120000,
        onError: silentError,
      },
      '/datasets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 30000,
        timeout: 30000,
        onError: silentError,
      },
      '/data': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000,
        onError: silentError,
      },
      '/init': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000,
        onError: silentError,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 10000,
        timeout: 10000,
        onError: silentError,
      },
      '/compare': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000,
        onError: silentError,
      },
      '/score-config': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 10000,
        timeout: 10000,
        onError: silentError,
      },
    },
  },
})
