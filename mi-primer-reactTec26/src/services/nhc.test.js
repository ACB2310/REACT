import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerCiclonesNhc } from './nhc.js'
import { nhcEjemplo } from '../mocks/ciclonesEjemplo.js'

const BASE =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer'
const VACIA = { type: 'FeatureCollection', features: [] }

// fetch falso que responde según la capa pedida en la URL (/5/query, /6/query...)
function fetchPorCapa(respuestas) {
  return vi.fn((url) => {
    const capa = url.match(/MapServer\/(\d+)\/query/)?.[1]
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respuestas[capa] ?? VACIA) })
  })
}

const respuestasTrudy = {
  5: nhcEjemplo.puntos,
  6: nhcEjemplo.trayectorias,
  7: nhcEjemplo.conos,
  8: nhcEjemplo.avisos,
}

// Una tormenta del Pacífico occidental (lejos de México) en su propia "bin" WP1
function conTormentaLejana(coleccion, geometria) {
  const lejana = {
    type: 'Feature',
    geometry: geometria,
    properties: { ...coleccion.features[0].properties, binnumber: 'WP1', stormname: 'Lejana', tau: 0 },
  }
  return { ...coleccion, features: [...coleccion.features, lejana] }
}

describe('obtenerCiclonesNhc', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pide las 4 capas del servicio de resumen en GeoJSON', async () => {
    const fetchFalso = fetchPorCapa(respuestasTrudy)
    vi.stubGlobal('fetch', fetchFalso)

    await obtenerCiclonesNhc()

    const urls = fetchFalso.mock.calls.map(([url]) => url).sort()
    expect(urls).toEqual(
      [5, 6, 7, 8].map((capa) => `${BASE}/${capa}/query?where=1%3D1&outFields=*&f=geojson`),
    )
  })

  it('devuelve puntos, trayectorias, conos y avisos', async () => {
    vi.stubGlobal('fetch', fetchPorCapa(respuestasTrudy))

    const resultado = await obtenerCiclonesNhc()

    expect(resultado.puntos.features).toHaveLength(2)
    expect(resultado.trayectorias.features).toHaveLength(1)
    expect(resultado.conos.features).toHaveLength(1)
    expect(resultado.avisos.features[0].properties.tcww).toBe('TWA')
  })

  it('falla si NOAA responde con error de ArcGIS', async () => {
    vi.stubGlobal(
      'fetch',
      fetchPorCapa({ ...respuestasTrudy, 7: { error: { code: 400, message: 'Invalid or missing input parameters.' } } }),
    )
    await expect(obtenerCiclonesNhc()).rejects.toThrow('Formato inesperado de NOAA')
  })

  it('quita tormentas fuera de la zona y sus conos', async () => {
    vi.stubGlobal(
      'fetch',
      fetchPorCapa({
        ...respuestasTrudy,
        5: conTormentaLejana(nhcEjemplo.puntos, { type: 'Point', coordinates: [150, 12] }),
        7: conTormentaLejana(nhcEjemplo.conos, {
          type: 'Polygon',
          coordinates: [[[149, 11], [151, 11], [151, 13], [149, 11]]],
        }),
      }),
    )

    const resultado = await obtenerCiclonesNhc()

    const bins = [resultado.puntos, resultado.conos].flatMap((c) => c.features.map((f) => f.properties.binnumber))
    expect(bins).not.toContain('WP1')
    expect(resultado.conos.features).toHaveLength(1)
  })

  it('actualizadoEn es el idp_filedate más reciente', async () => {
    const conosMasNuevos = {
      ...nhcEjemplo.conos,
      features: [{ ...nhcEjemplo.conos.features[0], properties: { ...nhcEjemplo.conos.features[0].properties, idp_filedate: 1792190000000 } }],
    }
    vi.stubGlobal('fetch', fetchPorCapa({ ...respuestasTrudy, 7: conosMasNuevos }))

    const resultado = await obtenerCiclonesNhc()
    expect(resultado.actualizadoEn).toBe(1792190000000)
  })

  it('sin tormentas actualizadoEn es null', async () => {
    vi.stubGlobal('fetch', fetchPorCapa({}))

    const resultado = await obtenerCiclonesNhc()
    expect(resultado.puntos.features).toEqual([])
    expect(resultado.actualizadoEn).toBeNull()
  })
})
