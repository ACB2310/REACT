import { describe, it, expect, vi, afterEach } from 'vitest'
import { obtenerHoraSatelite, urlTeselasSatelite } from './gibs.js'

function responderConCabeceras(cabeceras) {
  const fetchFalso = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(cabeceras) })
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

describe('urlTeselasSatelite', () => {
  it('arma la URL de teselas con la hora y {z}/{y}/{x}', () => {
    expect(urlTeselasSatelite('2026-10-16T21:30:00Z')).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/2026-10-16T21:30:00Z/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    )
  })
})

describe('obtenerHoraSatelite', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lee la hora de Layer-Time-Actual con un HEAD', async () => {
    const fetchFalso = responderConCabeceras({ 'Layer-Time-Actual': '2026-10-16T21:30:00Z' })

    const resultado = await obtenerHoraSatelite()

    expect(resultado).toEqual({ datos: '2026-10-16T21:30:00Z', actualizadoEn: Date.UTC(2026, 9, 16, 21, 30) })
    expect(fetchFalso.mock.calls[0][0]).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/0/0/0.png',
    )
    expect(fetchFalso.mock.calls[0][1].method).toBe('HEAD')
  })

  it('falla si no viene la cabecera en lugar de inventar la hora', async () => {
    responderConCabeceras({})
    await expect(obtenerHoraSatelite()).rejects.toThrow('Formato inesperado de NASA GIBS')
  })

  it('falla si la cabecera no es una fecha', async () => {
    responderConCabeceras({ 'Layer-Time-Actual': 'default' })
    await expect(obtenerHoraSatelite()).rejects.toThrow('Formato inesperado de NASA GIBS')
  })
})
