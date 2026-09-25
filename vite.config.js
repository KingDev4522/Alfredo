import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // dedupe Three — @react-three/fiber, drei and @splinetool/runtime each
  // bundle their own copy otherwise, which triggers "Multiple instances of
  // Three.js" and doubles WebGL memory
  resolve: {
    dedupe: ['three'],
  },
  optimizeDeps: {
    include: ['three'],
  },
  // Localhost frontend: `npm run dev` → http://localhost:5173/
  // Backend stays on http://localhost:8000 (see .env.local VITE_*).
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    open: false,
    proxy: {
      // Lets the app call same-origin `/api/*` + `/ws/*` in dev and have
      // Vite forward to FastAPI, avoiding CORS surprises.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: false,
  },
})
