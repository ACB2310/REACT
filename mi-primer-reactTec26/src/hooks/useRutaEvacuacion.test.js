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

  // Sin señal, USGS puede no haber cargado nunca: "sin datos" NO es lo mismo que "sin sismos"
  it('avisa que no hay datos de sismos en lugar de suponer que no hubo', async () => {
    const { result, rerender } = renderHook(({ sismos }) => useRutaEvacuacion({ sismos }), {
      initialProps: { sismos: null },
    })
    await buscar(result)
    expect(result.current.estado).toBe('listo')
    expect(result.current.sinDatosSismos).toBe(true)

    rerender({ sismos: VACIA })
    expect(result.current.sinDatosSismos).toBe(false)
  })

  it('dice desde cuándo es la ubicación usada', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 16, 22, 5))
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)
    expect(result.current.ubicadoEn).toBe(Date.UTC(2026, 9, 16, 22, 5))
  })

  it('no guarda una zona sin puntos de reunión: la próxima vez vuelve a descargar', async () => {
    obtenerCallesYPuntosReunion.mockResolvedValueOnce({ elementos: [], descargadoEn: Date.now() })
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)
    expect(result.current.estado).toBe('sin-puntos')
    expect(localStorage.getItem(CLAVE_ZONA)).toBeNull()

    await buscar(result)
    expect(obtenerCallesYPuntosReunion).toHaveBeenCalledTimes(2)
    expect(result.current.estado).toBe('listo')
  })

  it('limpiar durante una descarga nunca termina mostrando una ruta', async () => {
    let terminarDescarga
    obtenerCallesYPuntosReunion.mockImplementationOnce(
      () => new Promise((resolver) => {
        terminarDescarga = () => resolver({ elementos: elementosOverpassEjemplo, descargadoEn: Date.now() })
      }),
    )
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    act(() => {
      result.current.buscarRuta()
    })
    await act(async () => {})
    expect(result.current.estado).toBe('descargando')

    act(() => {
      result.current.limpiar()
    })
    await act(async () => {
      terminarDescarga()
    })
    expect(result.current.estado).toBe('inactivo')
    expect(result.current.resultado).toBeNull()
  })

  it('una búsqueda nueva oculta de inmediato la ruta anterior', async () => {
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    await buscar(result)
    expect(result.current.resultado).not.toBeNull()

    obtenerUbicacionActual.mockReturnValueOnce(new Promise(() => {}))
    act(() => {
      result.current.buscarRuta()
    })
    expect(result.current.estado).toBe('ubicando')
    expect(result.current.resultado).toBeNull()
  })

  it('si se busca otra vez mientras se ubica, se ignora la ubicación vieja', async () => {
    let entregarVieja
    obtenerUbicacionActual.mockReturnValueOnce(
      new Promise((resolver) => {
        entregarVieja = () => resolver({ coordenadas: [-100.28, 25.69], precisionM: 10 })
      }),
    )
    const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
    act(() => {
      result.current.buscarRuta()
    })
    await buscar(result)
    expect(result.current.estado).toBe('listo')

    await act(async () => {
      entregarVieja()
    })
    expect(result.current.estado).toBe('listo')
    expect(result.current.origen).toEqual(AQUI)
  })

  // Revisión final: el punto de reunión se revisaba por la esquina de calle a la que se
  // pegó (hasta 300 m), no por su posición real. Una plaza derrumbada no se debe ofrecer.
  describe('puntos de reunión y origen fuera de la red de calles', () => {
    // A ~100 m al este del nodo 3; se pega al nodo 3 igual que "Plaza Hidalgo"
    const PLAZA_DERRUMBE = [-100.299, 25.6705]
    const cuadroAlrededor = ([lon, lat], d) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] },
      properties: { tipo: 'total' },
    })
    const BLOQUEO_PLAZA = [cuadroAlrededor(PLAZA_DERRUMBE, 0.00015)]
    const conPlaza = (soloEsa) => [
      ...elementosOverpassEjemplo.filter((e) => e.type === 'way' || (!soloEsa && e.id === 900)),
      { type: 'node', id: 950, lat: PLAZA_DERRUMBE[1], lon: PLAZA_DERRUMBE[0], tags: { emergency: 'assembly_point', name: 'Plaza en derrumbe' } },
    ]

    it('no ofrece un punto de reunión dentro de un bloqueo total aunque su calle esté libre', async () => {
      obtenerCallesYPuntosReunion.mockResolvedValue({ elementos: conPlaza(true), descargadoEn: Date.now() })
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, bloqueos: BLOQUEO_PLAZA }))
      await buscar(result)

      expect(result.current.estado).toBe('sin-ruta')
      expect(result.current.motivo).toBe('refugios-inalcanzables')
      expect(result.current.resultado).toBeNull()
    })

    it('si otro punto pegado a la misma calle está libre, ofrece ese', async () => {
      obtenerCallesYPuntosReunion.mockResolvedValue({ elementos: conPlaza(false), descargadoEn: Date.now() })
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, bloqueos: BLOQUEO_PLAZA }))
      await buscar(result)

      expect(result.current.estado).toBe('listo')
      expect(result.current.resultado.puntoReunion.nombre).toBe('Plaza Hidalgo')
    })

    it('si la persona está dentro de un bloqueo total no calcula y lo dice', async () => {
      const { result } = renderHook(() =>
        useRutaEvacuacion({ sismos: VACIA, bloqueos: [cuadroAlrededor(AQUI, 0.00003)] }),
      )
      await buscar(result)

      expect(result.current.estado).toBe('sin-ruta')
      expect(result.current.motivo).toBe('origen-en-zona-de-peligro')
    })

    it('si la persona está en el radio crítico de un sismo fuerte lo dice', async () => {
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: sismoFuerte(0) }))
      await buscar(result)

      expect(result.current.estado).toBe('sin-ruta')
      expect(result.current.motivo).toBe('origen-en-zona-de-peligro')
    })

    it('la línea va de la persona al punto de reunión y la distancia cuenta esos tramos', async () => {
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
      await buscar(result)

      const { ruta, distanciaM } = result.current.resultado
      expect(ruta.geometry.coordinates[0]).toEqual(AQUI)
      expect(ruta.geometry.coordinates.at(-1)).toEqual([-100.3001, 25.6702])
      // 1002 m por calles + ~14 m de la persona a la esquina + ~24 m de la esquina a la plaza
      expect(Math.abs(distanciaM - 1040)).toBeLessThanOrEqual(5)
      expect(ruta.properties.distanciaM).toBe(distanciaM)
      expect(result.current.resultado.distanciaKm).toBe(1.0)
    })

    it('un bloqueo con formato desconocido se muestra como error, nunca como ruta', async () => {
      const filaSinConvertir = { id: 7, tipo: 'total', geometria: 'WKB...' }
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, bloqueos: [filaSinConvertir] }))
      await buscar(result)

      expect(result.current.estado).toBe('error')
      expect(result.current.error).toBe('Hay un bloqueo con formato desconocido')
      expect(result.current.resultado).toBeNull()
    })
  })

  // Tarea 10: los refugios oficiales (Supabase) también son destinos
  describe('refugios de Supabase como destinos', () => {
    // A ~10 m del nodo 2: más cerca de la persona que "Plaza Hidalgo" (nodo 3)
    const refugio = (estado, coordenadas = [-100.3051, 25.6701]) => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 1,
          geometry: { type: 'Point', coordinates: coordenadas },
          properties: { id: 1, nombre: 'Refugio Escuela Juárez', estado, capacidad: 120, ocupacion: 40 },
        },
      ],
    })

    it('suma los refugios abiertos como destinos y elige el de menor costo', async () => {
      const refugios = refugio('abierto')
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, refugios }))
      await buscar(result)

      expect(result.current.estado).toBe('listo')
      expect(result.current.resultado.puntoReunion).toEqual({
        nombre: 'Refugio Escuela Juárez',
        coordenadas: [-100.3051, 25.6701],
        tipo: 'refugio',
      })
    })

    it('los puntos de reunión de OSM dicen su tipo', async () => {
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA }))
      await buscar(result)
      expect(result.current.resultado.puntoReunion.tipo).toBe('punto-reunion')
    })

    it('descarta refugios llenos o cerrados', async () => {
      for (const estado of ['lleno', 'cerrado']) {
        const refugios = refugio(estado)
        const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, refugios }))
        await buscar(result)
        expect(result.current.resultado.puntoReunion.nombre).toBe('Plaza Hidalgo')
      }
    })

    it('un refugio lejos de las calles descargadas no se usa', async () => {
      const refugios = refugio('abierto', [-100.25, 25.7])
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, refugios }))
      await buscar(result)
      expect(result.current.resultado.puntoReunion.nombre).toBe('Plaza Hidalgo')
    })

    it('con solo un refugio abierto y sin puntos de reunión de OSM igual hay ruta', async () => {
      const soloCalles = elementosOverpassEjemplo.filter((e) => e.type === 'way')
      obtenerCallesYPuntosReunion.mockResolvedValue({ elementos: soloCalles, descargadoEn: Date.now() })
      const refugios = refugio('abierto')
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, refugios }))
      await buscar(result)

      expect(result.current.estado).toBe('listo')
      expect(result.current.resultado.puntoReunion.tipo).toBe('refugio')
    })

    it('un refugio dentro de un bloqueo total no se ofrece', async () => {
      const refugios = refugio('abierto')
      const bloqueoSobreRefugio = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-100.3051, 25.6701] },
        properties: { tipo: 'total' },
      }
      const { result } = renderHook(() =>
        useRutaEvacuacion({ sismos: VACIA, refugios, bloqueos: [bloqueoSobreRefugio] }),
      )
      await buscar(result)
      expect(result.current.resultado?.puntoReunion.nombre).not.toBe('Refugio Escuela Juárez')
    })
  })

  // Decisión del usuario: los bloqueos 'total' sin confirmar SÍ bloquean, pero si por
  // eso no hay ruta, la pantalla debe poder decir cuántos hay cerca sin confirmar
  describe('bloqueos sin confirmar cerca', () => {
    const punto = (coordenadas, propiedades) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coordenadas },
      properties: { tipo: 'total', confirmado: false, ...propiedades },
    })

    it('cuenta los bloqueos total sin confirmar a 2.5 km o menos de la persona', async () => {
      const bloqueos = [
        punto([-100.305, 25.67]),
        punto([-100.3, 25.675]),
        punto([-100.305, 25.6701], { confirmado: true }),
        punto([-100.306, 25.6701], { tipo: 'solo_vehiculos' }),
        // ~10 km: no cuenta
        punto([-100.2, 25.67]),
      ]
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, bloqueos }))
      await buscar(result)

      expect(result.current.bloqueosSinConfirmarCerca).toBe(2)
    })

    it('antes de buscar es 0', () => {
      const { result } = renderHook(() => useRutaEvacuacion({ sismos: VACIA, bloqueos: [punto([-100.305, 25.67])] }))
      expect(result.current.bloqueosSinConfirmarCerca).toBe(0)
    })
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
