import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerSismos, URL_SISMOS_USGS } from './usgs.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

function respuesta({ ok = true, status = 200, cuerpo = {} } = {}) {
  return { ok, status, json: () => Promise.resolve(cuerpo) }
}

describe('obtenerSismos', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('devuelve solo sismos de México y la hora de generación', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuesta({ cuerpo: sismosEjemplo }))
    vi.stubGlobal('fetch', fetchFalso)
    const { signal } = new AbortController()

    const resultado = await obtenerSismos({ signal })

    expect(resultado.coleccion.features.map((f) => f.id)).toEqual(['oax1', 'gro1', 'bc1'])
    expect(resultado.generadoEn).toBe(1700000000000)
    expect(resultado.coleccion.features.map((f) => f.properties.profundidadKm)).toEqual([30, 20, 5])
    expect(fetchFalso.mock.calls[0][0]).toBe(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    )
    expect(URL_SISMOS_USGS).toBe('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson')
  })

  it('lanza error con el código HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ ok: false, status: 503 })))
    await expect(obtenerSismos()).rejects.toThrow('USGS respondió 503')
  })

  it('lanza error si cambia el formato', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ cuerpo: {} })))
    await expect(obtenerSismos()).rejects.toThrow('Formato inesperado de USGS')
  })
})

describe('obtenerSismos con respuesta que no es JSON', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lanza el mismo error de formato en lugar de un SyntaxError', async () => {
    const noJson = { ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(noJson))
    await expect(obtenerSismos()).rejects.toThrow('Formato inesperado de USGS')
  })
})

// fetch falso que, como el real, se rechaza con AbortError cuando cancelan su señal
function fetchQueNuncaResponde() {
  return vi.fn((url, { signal }) => new Promise((resolver, rechazar) => {
    signal.addEventListener('abort', () => rechazar(new DOMException('Cancelado', 'AbortError')))
  }))
}

describe('obtenerSismos con mala señal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('se rinde a los 15 segundos con un mensaje claro', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchQueNuncaResponde())
    const promesa = obtenerSismos()
    const verificacion = expect(promesa).rejects.toThrow('USGS tardó demasiado en responder')

    await vi.advanceTimersByTimeAsync(15000)
    await verificacion
  })

  it('no se rinde antes de los 15 segundos', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchQueNuncaResponde())
    let termino = false
    obtenerSismos().catch(() => {}).finally(() => { termino = true })

    await vi.advanceTimersByTimeAsync(14999)
    expect(termino).toBe(false)
  })

  it('respeta la cancelación de quien llama como AbortError', async () => {
    vi.stubGlobal('fetch', fetchQueNuncaResponde())
    const controlador = new AbortController()
    const promesa = obtenerSismos({ signal: controlador.signal })

    controlador.abort()
    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('traduce el fallo de red del navegador a español', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(obtenerSismos()).rejects.toThrow('No se pudo conectar con USGS')
  })
})
