import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs separately (uvicorn on :8000); proxy /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
    },
  },
})
