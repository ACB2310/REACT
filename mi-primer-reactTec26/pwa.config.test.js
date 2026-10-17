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

  // El TileJSON dice qué versión de teselas pedir. Con señal se usa el nuevo (y sus teselas
  // se guardan en esa misma visita); sin señal, el último guardado, que apunta a las teselas
  // que SÍ están guardadas. Sin límite de días: el mapa debe servir aunque la app se haya
  // abierto por última vez hace meses.
  it('estilo y TileJSON: primero la red (3 s) y si no, lo guardado, sin vencimiento', () => {
    for (const url of ['https://tiles.openfreemap.org/styles/liberty', 'https://tiles.openfreemap.org/planet']) {
      const encontrada = regla(url)
      expect(encontrada).toMatchObject({
        handler: 'NetworkFirst',
        options: { cacheName: 'mapa-estilos', networkTimeoutSeconds: 3, expiration: { maxEntries: 20 } },
      })
      expect(encontrada.options.expiration.maxAgeSeconds).toBeUndefined()
    }
  })

  // La ruta de cada tesela trae su versión: nunca cambia, así que no vence por tiempo
  it('teselas, letras e íconos del mapa se guardan sin vencimiento (máximo 3000)', () => {
    for (const url of [
      'https://tiles.openfreemap.org/planet/20261015_001001_pt/12/870/1782.pbf',
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
      'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json',
    ]) {
      const encontrada = regla(url)
      expect(encontrada).toMatchObject({
        handler: 'CacheFirst',
        options: { cacheName: 'mapa-teselas', expiration: { maxEntries: 3000, purgeOnQuotaError: true } },
      })
      expect(encontrada.options.expiration.maxAgeSeconds).toBeUndefined()
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
