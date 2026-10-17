import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { opcionesWorkbox } from './pwa.config.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Alerta México',
        short_name: 'Alerta México',
        description: 'Mapa informativo de sismos, ciclones, refugios y bloqueos en México.',
        lang: 'es-MX',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#1d4ed8',
        background_color: '#f3f4f6',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icono-alerta.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      // Qué se guarda para usar la app sin conexión (ver pwa.config.js)
      workbox: opcionesWorkbox,
      devOptions: {
        enabled: false,
      },
    }),
  ],
  // Configuración de Vitest: simula un navegador con jsdom
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
