import { describe, it, expect, vi, afterEach } from 'vitest'
import { consultaOverpass, obtenerCallesYPuntosReunion, URL_OVERPASS } from './overpass.js'

const CONSULTA_CDMX =
  '[out:json][timeout:60];' +
  'way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|footway|pedestrian|path|steps|cycleway)$"](around:1500,19.4326,-99.1332);' +
  'out body geom qt;' +
  'node["emergency"="assembly_point"](around:2500,19.4326,-99.1332);' +
  'out qt;'

function responder(cuerpo, { ok = true, status = 200 } = {}) {
  const fetchFalso = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(cuerpo) })
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

describe('consultaOverpass', () => {
  // Overpass usa around:radio,LATITUD,LONGITUD (al revés que GeoJSON)
  it('arma la consulta con around:radio,lat,lon', () => {
    expect(consultaOverpass([-99.1332, 19.4326])).toBe(CONSULTA_CDMX)
  })
})

describe('obtenerCallesYPuntosReunion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // Overpass responde 406 a cualquier GET (verificado el 2026-10-16); se usa POST
  // con un formulario simple, que el navegador envía sin pedir permiso previo (CORS)
  it('pide con POST y la consulta en el cuerpo del formulario', async () => {
    const fetchFalso = responder({ elements: [] })
    await obtenerCallesYPuntosReunion([-99.1332, 19.4326])

    const [url, opciones] = fetchFalso.mock.calls[0]
    expect(url).toBe('https://overpass-api.de/api/interpreter')
    expect(URL_OVERPASS).toBe(url)
    expect(opciones.method).toBe('POST')
    expect(opciones.body).toBeInstanceOf(URLSearchParams)
    expect(opciones.body.get('data')).toBe(CONSULTA_CDMX)
  })

  it('devuelve los elementos y la hora de descarga', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 16, 22))
    const elementos = [{ type: 'way', id: 1, nodes: [10, 11], geometry: [] }]
    responder({ version: 0.6, elements: elementos })

    const resultado = await obtenerCallesYPuntosReunion([-99.1332, 19.4326])
    expect(resultado).toEqual({ elementos, descargadoEn: Date.UTC(2026, 9, 16, 22) })
  })

  it('usa 60 segundos de tiempo límite', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((url, { signal }) => new Promise((resolver, rechazar) => {
        signal.addEventListener('abort', () => rechazar(new DOMException('Cancelado', 'AbortError')))
      })),
    )
    let termino = false
    const promesa = obtenerCallesYPuntosReunion([-99.1332, 19.4326])
    promesa.catch(() => {}).finally(() => {
      termino = true
    })

    await vi.advanceTimersByTimeAsync(59000)
    expect(termino).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promesa).rejects.toThrow('OpenStreetMap tardó demasiado en responder')
  })

  it('429 da un error claro', async () => {
    responder({}, { ok: false, status: 429 })
    await expect(obtenerCallesYPuntosReunion([-99.1332, 19.4326])).rejects.toThrow('OpenStreetMap respondió 429')
  })

  it('falla si cambia el formato', async () => {
    responder({ remark: 'runtime error: Query timed out' })
    await expect(obtenerCallesYPuntosReunion([-99.1332, 19.4326])).rejects.toThrow(
      'Formato inesperado de OpenStreetMap',
    )
  })

  // Overpass a veces responde 200 con un aviso de que se acabó el tiempo y una lista incompleta
  it('falla si Overpass avisa que la consulta no terminó', async () => {
    responder({ elements: [{ type: 'way', id: 1 }], remark: 'runtime error: Query timed out in "query" at line 1 after 61 seconds.' })
    await expect(obtenerCallesYPuntosReunion([-99.1332, 19.4326])).rejects.toThrow(
      'OpenStreetMap no terminó la consulta',
    )
  })

  it('rechaza coordenadas inválidas sin consultar', async () => {
    const fetchFalso = responder({ elements: [] })
    await expect(obtenerCallesYPuntosReunion([NaN, 19.4])).rejects.toThrow('Ubicación inválida')
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
