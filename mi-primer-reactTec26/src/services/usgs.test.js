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
    expect(fetchFalso).toHaveBeenCalledWith(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
      { signal },
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
