import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'production' ? {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api')
  } : {},
  server: {
    port: 5173,
    proxy: {
      '/images': 'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/crm':    'http://localhost:8000',
      '/api':    'http://localhost:8000',
    }
  },
}))
