import { useCallback, useEffect, useRef, useState } from 'react'
import { obtenerUbicacionActual } from '../services/ubicacion.js'
import { calcularRutaRefugio, CODIGOS_PARA_RESPALDO } from '../services/rutasOrs.js'

// Un solo botón "Ruta a refugio" (decisión del 2026-10-17):
// - Con conexión: ruta en línea con OpenRouteService (a pie o en carro).
// - Sin conexión, o si el servicio de rutas falla, A PIE se usa la ruta sin conexión
//   (Dijkstra, useRutaEvacuacion). EN CARRO se avisa que hace falta internet.
//
// `evacuacion`: lo que devuelve useRutaEvacuacion (buscarRuta, limpiar, …).
// `asegurarSesion`: de useSesion; la función en línea pide sesión (también anónima).
//
// Estados: 'inactivo' | 'ubicando' | 'calculando' | 'listo' | 'sin-ruta' | 'error'
//          | 'sin-conexion-carro' | 'respaldo' (la ruta la muestra PanelEvacuacion)

const INICIAL = { estado: 'inactivo', resultado: null, origen: null, error: null, aviso: null }

export const AVISO_SIN_CONEXION = 'Sin conexión: ruta a pie calculada en tu teléfono.'

export function useRutaRefugio({ modo, evacuacion, asegurarSesion }) {
  const [busqueda, setBusqueda] = useState(INICIAL)

  // Cada búsqueda tiene su número; si empieza otra (o se sale de la pantalla), se ignora
  const numeroRef = useRef(0)
  const controladorRef = useRef(null)
  useEffect(
    () => () => {
      numeroRef.current++
      controladorRef.current?.abort()
    },
    [],
  )

  // Siempre la versión más reciente de evacuacion (sus funciones cambian con su estado)
  const evacuacionRef = useRef(evacuacion)
  useEffect(() => {
    evacuacionRef.current = evacuacion
  }, [evacuacion])

  const usarRespaldo = useCallback((aviso) => {
    setBusqueda({ ...INICIAL, estado: 'respaldo', aviso })
    evacuacionRef.current?.buscarRuta()
  }, [])

  const buscar = useCallback(async () => {
    controladorRef.current?.abort()
    const controlador = new AbortController()
    controladorRef.current = controlador
    const numero = ++numeroRef.current
    const sigueVigente = () => numero === numeroRef.current
    evacuacionRef.current?.limpiar?.()

    // Sin conexión no hay ruta en línea
    if (navigator.onLine === false) {
      if (modo === 'a_pie') usarRespaldo(AVISO_SIN_CONEXION)
      else setBusqueda({ ...INICIAL, estado: 'sin-conexion-carro' })
      return
    }

    setBusqueda({ ...INICIAL, estado: 'ubicando' })
    let origen
    try {
      origen = (await obtenerUbicacionActual()).coordenadas
    } catch (e) {
      if (!sigueVigente()) return
      setBusqueda({ ...INICIAL, estado: 'error', error: e.message })
      return
    }
    if (!sigueVigente()) return

    setBusqueda({ ...INICIAL, estado: 'calculando', origen })
    try {
      await asegurarSesion()
      const resultado = await calcularRutaRefugio({ origen, modo, signal: controlador.signal })
      if (!sigueVigente()) return
      setBusqueda({
        ...INICIAL,
        origen,
        resultado,
        estado: resultado.estado === 'ruta' ? 'listo' : 'sin-ruta',
      })
      // Etapa 7: con señal se guardan también las calles de aquí (en segundo plano), para
      // que la ruta a pie funcione después sin conexión
      evacuacionRef.current?.guardarZonaSinConexion?.(origen)
    } catch (e) {
      if (!sigueVigente() || e?.name === 'AbortError') return
      // Si el servicio de rutas falla (sin red, cuota, sin configurar), a pie hay respaldo
      if (modo === 'a_pie' && CODIGOS_PARA_RESPALDO.includes(e.codigo)) {
        usarRespaldo(`${e.message} Ruta a pie calculada en tu teléfono.`)
        return
      }
      setBusqueda({ ...INICIAL, origen, estado: 'error', error: e.message })
    }
  }, [modo, asegurarSesion, usarRespaldo])

  const limpiar = useCallback(() => {
    numeroRef.current++
    controladorRef.current?.abort()
    evacuacionRef.current?.limpiar?.()
    setBusqueda(INICIAL)
  }, [])

  return {
    ...busqueda,
    // De dónde salió la ruta: en línea (ORS) o en el teléfono (Dijkstra)
    fuente: busqueda.estado === 'respaldo' ? 'dijkstra' : busqueda.resultado ? 'ors' : null,
    buscar,
    limpiar,
  }
}
