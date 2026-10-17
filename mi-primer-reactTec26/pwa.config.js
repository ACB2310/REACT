// Qué guarda el service worker de la PWA (etapa 7) para que la app sirva sin conexión.
// Está aparte de vite.config.js para poder probarlo (pwa.config.test.js).
//
// - La app misma (HTML, JS, CSS, íconos y el worker .mjs de MapLibre) se guarda completa.
// - El mapa: estilo, teselas, letras e íconos de OpenFreeMap que ya se vieron.
// - Los DATOS (sismos, refugios, bloqueos…) NO los guarda el service worker: los guarda la app
//   (useDatosPeriodicos) para poder decir de qué hora son. Supabase lleva la sesión.

// OJO: Workbox copia estas dos funciones al service worker COMO TEXTO, sin nada de lo que
// hay alrededor. Por eso cada una se escribe completa, sin usar constantes ni otras funciones.

// El estilo y el TileJSON (/planet) cambian cuando OpenFreeMap publica teselas nuevas
// (cada semana); el TileJSON dice qué versión de teselas pedir
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
      // Con señal (3 s como máximo) se usa el nuevo y las teselas de esa versión se guardan
      // en la misma visita; sin señal, el último guardado, que apunta a las teselas guardadas.
      // (Con "usar lo guardado y revisar después", tras una actualización semanal se pedirían
      // sin señal teselas nuevas que nunca se guardaron: el mapa saldría vacío.)
      // Sin límite de días: el mapa debe servir aunque la app se abriera hace meses.
      urlPattern: esEstiloDelMapa,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'mapa-estilos',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 20 },
      },
    },
    {
      urlPattern: esArchivoDelMapa,
      handler: 'CacheFirst',
      options: {
        cacheName: 'mapa-teselas',
        // ~3000 teselas son unas cuantas ciudades a varios acercamientos (decenas de MB).
        // No vencen por tiempo (la ruta trae la versión). Si el teléfono se queda sin
        // espacio, se borra esta caché antes que fallar.
        expiration: { maxEntries: 3000, purgeOnQuotaError: true },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
}
