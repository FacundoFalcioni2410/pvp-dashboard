import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 120000,
        timeout: 120000,
      },
      '/upload-thresholds': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 120000,
        timeout: 120000,
      },
      '/datasets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 30000,
        timeout: 30000,
      },
      '/data': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000,
      },
      '/init': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 10000,
        timeout: 10000,
      },
      '/compare': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000,
      },
    },
  },
})
