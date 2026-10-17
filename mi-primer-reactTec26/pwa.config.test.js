// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { opcionesWorkbox } from './pwa.config.js'

// Etapa 7: qué guarda el service worker para que la app sirva sin conexión
const regla = (url) => opcionesWorkbox.runtimeCaching.find((r) => r.urlPattern({ url: new URL(url) }))

describe('opcionesWorkbox', () => {
  it('guarda la app completa, incluido el worker .mjs de MapLibre', () => {
    expect(opcionesWorkbox.globPatterns).toEqual(['**/*.{js,mjs,css,html,svg,png,ico,webmanifest}'])
    // El JavaScript principal pesa ~1.7 MB: el límite por defecto (2 MiB) queda muy justo
    expect(opcionesWorkbox.maximumFileSizeToCacheInBytes).toBe(4 * 1024 * 1024)
  })

  it('el estilo del mapa y su TileJSON se revisan al tener señal (cambian cada semana)', () => {
    for (const url of ['https://tiles.openfreemap.org/styles/liberty', 'https://tiles.openfreemap.org/planet']) {
      expect(regla(url)).toMatchObject({ handler: 'StaleWhileRevalidate', options: { cacheName: 'mapa-estilos' } })
    }
  })

  it('teselas, letras e íconos del mapa se guardan hasta 14 días', () => {
    for (const url of [
      'https://tiles.openfreemap.org/planet/20261015_001001_pt/12/870/1782.pbf',
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json',
    ]) {
      expect(regla(url)).toMatchObject({
        handler: 'CacheFirst',
        options: { cacheName: 'mapa-teselas', expiration: { maxEntries: 3000, maxAgeSeconds: 14 * 86400 } },
      })
    }
  })

  // Workbox copia cada urlPattern al service worker COMO TEXTO, sin lo que hay alrededor:
  // si una regla usa una constante o función de afuera, en el teléfono falla (ReferenceError)
  it('cada regla funciona sola, como queda copiada en el service worker', () => {
    for (const { urlPattern } of opcionesWorkbox.runtimeCaching) {
      const copiada = new Function(`return (${urlPattern.toString()})`)()
      expect(() => copiada({ url: new URL('https://tiles.openfreemap.org/planet/1/2/3.pbf') })).not.toThrow()
      expect(copiada({ url: new URL('https://tiles.openfreemap.org/planet/1/2/3.pbf') })).toBe(
        urlPattern({ url: new URL('https://tiles.openfreemap.org/planet/1/2/3.pbf') }),
      )
    }
  })

  // Supabase y las fuentes de datos los guarda la app (useDatosPeriodicos): llevan sesión
  // o deben mostrar su hora; el service worker no debe guardar respuestas viejas a escondidas
  it('no guarda Supabase, USGS ni Overpass', () => {
    for (const url of [
      'https://abcdefghijklmnopqrst.supabase.co/rest/v1/bloqueos_vista?select=*',
      'https://abcdefghijklmnopqrst.supabase.co/functions/v1/rutas',
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
      'https://overpass-api.de/api/interpreter',
    ]) {
      expect(regla(url)).toBeUndefined()
    }
  })
})
