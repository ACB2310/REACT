// Qué guarda el service worker de la PWA (etapa 7) para que la app sirva sin conexión.
// Está aparte de vite.config.js para poder probarlo (pwa.config.test.js).
//
// - La app misma (HTML, JS, CSS, íconos y el worker .mjs de MapLibre) se guarda completa.
// - El mapa: estilo, teselas, letras e íconos de OpenFreeMap que ya se vieron.
// - Los DATOS (sismos, refugios, bloqueos…) NO los guarda el service worker: los guarda la app
//   (useDatosPeriodicos) para poder decir de qué hora son. Supabase lleva la sesión.

const DIAS = 86400

// OJO: Workbox copia estas dos funciones al service worker COMO TEXTO, sin nada de lo que
// hay alrededor. Por eso cada una se escribe completa, sin usar constantes ni otras funciones.

// El estilo y el TileJSON (/planet) cambian cuando OpenFreeMap publica teselas nuevas
// (cada semana): se usa lo guardado y, si hay señal, se revisa en segundo plano
function esEstiloDelMapa({ url }) {
  return (
    url.origin === 'https://tiles.openfreemap.org' &&
    (url.pathname.startsWith('/styles/') || url.pathname === '/planet')
  )
}

// Teselas, letras e íconos: no cambian (la ruta trae la fecha de publicación)
function esArchivoDelMapa({ url }) {
  return (
    url.origin === 'https://tiles.openfreemap.org' &&
    !url.pathname.startsWith('/styles/') &&
    url.pathname !== '/planet'
  )
}

export const opcionesWorkbox = {
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
  globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest}'],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  runtimeCaching: [
    {
      urlPattern: esEstiloDelMapa,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'mapa-estilos',
        expiration: { maxEntries: 20, maxAgeSeconds: 14 * DIAS },
      },
    },
    {
      urlPattern: esArchivoDelMapa,
      handler: 'CacheFirst',
      options: {
        cacheName: 'mapa-teselas',
        // ~3000 teselas son unas cuantas ciudades a varios acercamientos (decenas de MB).
        // Si el teléfono se queda sin espacio, se borra esta caché antes que fallar.
        expiration: { maxEntries: 3000, maxAgeSeconds: 14 * DIAS, purgeOnQuotaError: true },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
}
