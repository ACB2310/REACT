import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRutaRefugio, AVISO_SIN_CONEXION } from './useRutaRefugio.js'
import { useZonasPeligro } from './useZonasPeligro.js'
import { obtenerUbicacionActual } from '../services/ubicacion.js'
import { calcularRutaRefugio } from '../services/rutasOrs.js'
import { obtenerZonas, suscribirseAZonas } from '../services/zonas.js'

vi.mock('../services/ubicacion.js', () => ({ obtenerUbicacionActual: vi.fn() }))
vi.mock('../services/rutasOrs.js', async () => {
  const real = await vi.importActual('../services/rutasOrs.js')
  return { ...real, calcularRutaRefugio: vi.fn() }
})
vi.mock('../services/zonas.js', () => ({ obtenerZonas: vi.fn(), suscribirseAZonas: vi.fn() }))
vi.mock('../services/supabase.js', () => ({
  supabaseConfigurado: true,
  MENSAJE_SIN_CONFIGURAR: 'Supabase no está configurado',
  obtenerCliente: vi.fn(),
}))

const ORIGEN = [-103.35, 20.67]
const RUTA = { estado: 'ruta', destino: { nombre: 'Centro' }, resumen: { duracionS: 600 }, consultadoEn: 1 }

function errorConCodigo(mensaje, codigo) {
  const error = new Error(mensaje)
  error.codigo = codigo
  return error
}

describe('useRutaRefugio', () => {
  let evacuacion
  let asegurarSesion

  beforeEach(() => {
    evacuacion = { buscarRuta: vi.fn(), limpiar: vi.fn(), guardarZonaSinConexion: vi.fn() }
    asegurarSesion = vi.fn().mockResolvedValue({ id: 'u1' })
    obtenerUbicacionActual.mockReset().mockResolvedValue({ coordenadas: ORIGEN, precisionM: 10 })
    calcularRutaRefugio.mockReset().mockResolvedValue(RUTA)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function usar(modo = 'a_pie') {
    return renderHook(() => useRutaRefugio({ modo, evacuacion, asegurarSesion }))
  }

  it('con conexión: ubica, asegura sesión y pide la ruta en línea', async () => {
    const { result } = usar('carro')
    await act(() => result.current.buscar())

    expect(asegurarSesion).toHaveBeenCalled()
    expect(calcularRutaRefugio).toHaveBeenCalledWith(expect.objectContaining({ origen: ORIGEN, modo: 'carro' }))
    expect(result.current.estado).toBe('listo')
    expect(result.current.fuente).toBe('ors')
    expect(result.current.origen).toEqual(ORIGEN)
    expect(evacuacion.buscarRuta).not.toHaveBeenCalled()
  })

  // Etapa 7: así la ruta a pie sirve después sin señal en esta zona
  it.each(['a_pie', 'carro'])('tras la ruta en línea (%s) guarda las calles de la zona', async (modo) => {
    const { result } = usar(modo)
    await act(() => result.current.buscar())
    expect(evacuacion.guardarZonaSinConexion).toHaveBeenCalledWith(ORIGEN)
  })

  it('si la ruta en línea falla no descarga calles aparte', async () => {
    calcularRutaRefugio.mockRejectedValue(errorConCodigo('El servicio de rutas llegó a su límite de hoy.', 'ORS_LIMITE'))
    const { result } = usar('carro')
    await act(() => result.current.buscar())
    expect(evacuacion.guardarZonaSinConexion).not.toHaveBeenCalled()
  })

  it('"sin ruta" de la función queda en estado sin-ruta', async () => {
    calcularRutaRefugio.mockResolvedValue({ estado: 'sin-ruta', motivo: 'bloqueada' })
    const { result } = usar()
    await act(() => result.current.buscar())
    expect(result.current.estado).toBe('sin-ruta')
    expect(result.current.resultado.motivo).toBe('bloqueada')
  })

  it('sin conexión y a pie usa la ruta del teléfono (Dijkstra)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = usar('a_pie')
    await act(() => result.current.buscar())

    expect(evacuacion.buscarRuta).toHaveBeenCalled()
    expect(calcularRutaRefugio).not.toHaveBeenCalled()
    expect(result.current.estado).toBe('respaldo')
    expect(result.current.fuente).toBe('dijkstra')
    expect(result.current.aviso).toBe(AVISO_SIN_CONEXION)
  })

  it('sin conexión y en carro avisa que hace falta internet', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = usar('carro')
    await act(() => result.current.buscar())

    expect(result.current.estado).toBe('sin-conexion-carro')
    expect(evacuacion.buscarRuta).not.toHaveBeenCalled()
  })

  it('si el servicio de rutas llegó a su límite, a pie cae a Dijkstra', async () => {
    calcularRutaRefugio.mockRejectedValue(errorConCodigo('El servicio de rutas llegó a su límite de hoy.', 'ORS_LIMITE'))
    const { result } = usar('a_pie')
    await act(() => result.current.buscar())

    expect(result.current.estado).toBe('respaldo')
    expect(result.current.aviso).toContain('llegó a su límite de hoy')
    expect(evacuacion.buscarRuta).toHaveBeenCalled()
  })

  it('en carro el mismo error se muestra (no hay respaldo en carro)', async () => {
    calcularRutaRefugio.mockRejectedValue(errorConCodigo('El servicio de rutas llegó a su límite de hoy.', 'ORS_LIMITE'))
    const { result } = usar('carro')
    await act(() => result.current.buscar())
    expect(result.current.estado).toBe('error')
    expect(result.current.error).toContain('límite')
  })

  it('el límite por persona no cae a Dijkstra: se explica', async () => {
    calcularRutaRefugio.mockRejectedValue(errorConCodigo('Ya pediste muchas rutas en la última hora.', 'LIMITE_RUTAS'))
    const { result } = usar('a_pie')
    await act(() => result.current.buscar())
    expect(result.current.estado).toBe('error')
    expect(evacuacion.buscarRuta).not.toHaveBeenCalled()
  })

  it('si no hay ubicación lo dice', async () => {
    obtenerUbicacionActual.mockRejectedValue(new Error('Permiso de ubicación denegado'))
    const { result } = usar()
    await act(() => result.current.buscar())
    expect(result.current.estado).toBe('error')
    expect(result.current.error).toBe('Permiso de ubicación denegado')
  })

  it('limpiar borra la ruta y la del teléfono', async () => {
    const { result } = usar()
    await act(() => result.current.buscar())
    act(() => result.current.limpiar())
    expect(result.current.estado).toBe('inactivo')
    expect(evacuacion.limpiar).toHaveBeenCalled()
  })

  it('al salir de la pantalla se ignora una respuesta tardía', async () => {
    let responder
    calcularRutaRefugio.mockReturnValue(new Promise((r) => (responder = r)))
    const { result, unmount } = usar()
    let busqueda
    act(() => {
      busqueda = result.current.buscar()
    })
    await vi.waitFor(() => expect(calcularRutaRefugio).toHaveBeenCalled())
    unmount()
    responder(RUTA)
    await busqueda
    // No hay advertencias de React por actualizar un componente desmontado
    expect(calcularRutaRefugio.mock.calls[0][0].signal.aborted).toBe(true)
  })
})

describe('useZonasPeligro', () => {
  it('entrega las zonas y escucha el tiempo real', async () => {
    const zonas = { type: 'FeatureCollection', features: [] }
    obtenerZonas.mockResolvedValue({ datos: zonas, actualizadoEn: 1 })
    suscribirseAZonas.mockReturnValue(() => {})
    const { result } = renderHook(() => useZonasPeligro())
    await act(async () => {})
    // Se entrega una copia sin las zonas vencidas (etapa 7), con el mismo contenido
    expect(result.current.zonas).toEqual(zonas)
    expect(suscribirseAZonas).toHaveBeenCalled()
  })
})
