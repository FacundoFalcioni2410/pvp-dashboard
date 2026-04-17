import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/upload-thresholds': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/datasets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/data': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/init': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/compare': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
