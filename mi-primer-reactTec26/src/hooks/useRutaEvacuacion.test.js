import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRutaEvacuacion } from './useRutaEvacuacion.js'
import { obtenerUbicacionActual } from '../services/ubicacion.js'
import { obtenerCallesYPuntosReunion } from '../services/overpass.js'
import { elementosOverpassEjemplo } from '../mocks/overpassEjemplo.js'
import { CLAVE_ZONA } from '../utils/almacenZona.js'

vi.mock('../services/ubicacion.js', () => ({ obtenerUbicacionActual: vi.fn() }))
vi.mock('../services/overpass.js', () => ({ obtenerCallesYPuntosReunion: vi.fn() }))

// A ~10 m del nodo 1 del ejemplo de Overpass (Monterrey)
const AQUI = [-100.3099, 25.6701]
const VACIA = { type: 'FeatureCollection', features: [] }

// Un sismo M 7 encima de las calles del ejemplo: su radio crítico (25 km) bloquea todo
function sismoFuerte(horasAtras) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-100.305, 25.67, 10] },
        properties: { mag: 7, time: Date.now() - horasAtras * 3600000 },
      },
    ],
  }
}

// Un bloqueo total que cubre todas las calles del ejemplo
const BLOQUEO_TOTAL = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[-100.32, 25.66], [-100.29, 25.66], [-100.29, 25.68], [-100.32, 25.68], [-100.32, 25.66]]] },
  properties: { tipo: 'total' },
}

async function buscar(result) {
  await act(async () => {
    await result.current.buscarRuta()
  })
}

describe('useRutaEvacuacion', () => {
  beforeEach(() => {
    localStorage.clear()
    obtenerUbicacionActual.mockReset().mockResolvedValue({ coordenadas: AQUI, precisionM: 10 })
    obtenerCallesYPuntosReunion
      .mockReset()
      .mockResolvedValue({ elementos: elementosOverpassEjemplo, descargadoEn: Date.UTC(2026, 9, 16, 22) })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('empieza inactivo', () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    expect(result.current.estado).toBe('inactivo')
    expect(result.current.resultado).toBeNull()
  })

  it('calcula y guarda la zona la primera vez', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('listo')
    expect(result.current.resultado).toMatchObject({
      estado: 'ok',
      refugioId: '3',
      puntoReunion: { nombre: 'Plaza Hidalgo', coordenadas: [-100.3001, 25.6702] },
    })
    expect(result.current.origen).toEqual(AQUI)
    expect(result.current.zona.descargadoEn).toBe(Date.UTC(2026, 9, 16, 22))
    expect(obtenerCallesYPuntosReunion).toHaveBeenCalledWith(AQUI, expect.objectContaining({ signal: expect.anything() }))
    expect(localStorage.getItem(CLAVE_ZONA)).not.toBeNull()
  })

  it('la segunda vez usa la zona guardada sin descargar', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)
    await buscar(result)

    expect(obtenerCallesYPuntosReunion).toHaveBeenCalledTimes(1)
    expect(result.current.estado).toBe('listo')
  })

  it('sin conexión y sin zona guardada avisa sin-zona-offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('sin-zona-offline')
    expect(obtenerCallesYPuntosReunion).not.toHaveBeenCalled()
  })

  it('sin conexión pero con zona guardada calcula la ruta', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await buscar(result)

    expect(result.current.estado).toBe('listo')
    expect(obtenerCallesYPuntosReunion).toHaveBeenCalledTimes(1)
  })

  it('si localStorage está bloqueado igual calcula la ruta', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Lleno', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Bloqueado', 'SecurityError')
    })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('listo')
  })

  it('error de Overpass sin zona da estado error con el mensaje', async () => {
    obtenerCallesYPuntosReunion.mockRejectedValue(new Error('OpenStreetMap respondió 429'))
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('error')
    expect(result.current.error).toBe('OpenStreetMap respondió 429')
    expect(result.current.resultado).toBeNull()
  })

  it('error de ubicación da estado error con el mensaje', async () => {
    obtenerUbicacionActual.mockRejectedValue(new Error('Permiso de ubicación denegado'))
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('error')
    expect(result.current.error).toBe('Permiso de ubicación denegado')
  })

  it('no calcula desde una ubicación imprecisa (más de 200 m)', async () => {
    obtenerUbicacionActual.mockResolvedValue({ coordenadas: AQUI, precisionM: 1500 })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('ubicacion-imprecisa')
    expect(result.current.precisionM).toBe(1500)
    expect(obtenerCallesYPuntosReunion).not.toHaveBeenCalled()
  })

  it('origen lejos de calles', async () => {
    obtenerUbicacionActual.mockResolvedValue({ coordenadas: [-100.28, 25.69], precisionM: 10 })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('lejos-de-calles')
  })

  it('sin puntos de reunión', async () => {
    const soloCalles = elementosOverpassEjemplo.filter((e) => e.type === 'way')
    obtenerCallesYPuntosReunion.mockResolvedValue({ elementos: soloCalles, descargadoEn: Date.now() })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('sin-puntos')
  })

  it('una zona sin calles ni puntos nunca es un éxito', async () => {
    obtenerCallesYPuntosReunion.mockResolvedValue({ elementos: [], descargadoEn: Date.now() })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    expect(result.current.estado).toBe('sin-puntos')
    expect(result.current.resultado).toBeNull()
  })

  it('sin-ruta cuando todo queda bloqueado', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, bloqueos: [BLOQUEO_TOTAL] }))
    await buscar(result)

    expect(result.current.estado).toBe('sin-ruta')
    expect(result.current.resultado).toBeNull()
  })

  it('ignora sismos de hace más de 72 h', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: sismoFuerte(100) }))
    await buscar(result)
    expect(result.current.estado).toBe('listo')
  })

  it('un sismo fuerte de hace 1 h sí bloquea', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: sismoFuerte(1) }))
    await buscar(result)
    expect(result.current.estado).toBe('sin-ruta')
  })

  // Una ruta vieja no debe quedar en pantalla si ahora pasa por una zona de peligro
  it('recalcula con la zona guardada si llega un sismo fuerte nuevo', async () => {
    const { result, rerender } = renderHook(({ sismos }) => useRutaEvacuacion({ sismos }), {
      initialProps: { sismos: VACIA },
    })
    await buscar(result)
    expect(result.current.estado).toBe('listo')

    await act(async () => {
      rerender({ sismos: sismoFuerte(0) })
    })
    expect(result.current.estado).toBe('sin-ruta')
    expect(result.current.resultado).toBeNull()
    expect(obtenerCallesYPuntosReunion).toHaveBeenCalledTimes(1)
  })

  it('recalcula si llega un bloqueo nuevo', async () => {
    const { result, rerender } = renderHook(({ bloqueos }) => useRutaEvacuacion({ sismos: VACIA, bloqueos }), {
      initialProps: { bloqueos: [] },
    })
    await buscar(result)

    await act(async () => {
      rerender({ bloqueos: [BLOQUEO_TOTAL] })
    })
    expect(result.current.estado).toBe('sin-ruta')
  })

  it('limpiar vuelve a inactivo y quita la ruta', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)

    act(() => {
      result.current.limpiar()
    })
    expect(result.current.estado).toBe('inactivo')
    expect(result.current.resultado).toBeNull()
  })

  it('una búsqueda nueva cancela la descarga anterior', async () => {
    let senalPrimera
    obtenerCallesYPuntosReunion.mockImplementationOnce((coordenadas, { signal }) => {
      senalPrimera = signal
      return new Promise(() => {})
    })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))

    act(() => {
      result.current.buscarRuta()
    })
    await act(async () => {})
    await buscar(result)

    expect(senalPrimera.aborted).toBe(true)
    expect(result.current.estado).toBe('listo')
  })

  it('al desmontar cancela la descarga en curso', async () => {
    let senal
    obtenerCallesYPuntosReunion.mockImplementation((coordenadas, opciones) => {
      senal = opciones.signal
      return new Promise(() => {})
    })
    const { result, unmount } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    act(() => {
      result.current.buscarRuta()
    })
    await act(async () => {})

    unmount()
    expect(senal.aborted).toBe(true)
  })
})
