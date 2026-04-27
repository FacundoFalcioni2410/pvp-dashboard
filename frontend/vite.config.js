import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const silentError = (err, req, res) => {
  res.writeHead(503);
  res.end();
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
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
