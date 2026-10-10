import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Bind to IPv4 explicitly: Vite's default `localhost` resolves to ::1 on
// Windows, which makes http://127.0.0.1:5173 fail on a demo laptop.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Same-origin proxy keeps the frontend working unchanged on localhost,
      // a LAN IP, or behind a demo machine's firewall.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})