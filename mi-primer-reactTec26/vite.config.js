import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Configuración de Vitest: simula un navegador con jsdom
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
