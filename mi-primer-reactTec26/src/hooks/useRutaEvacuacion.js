import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { obtenerUbicacionActual } from '../services/ubicacion.js'
import { obtenerCallesYPuntosReunion } from '../services/overpass.js'
import { construirZonaEvacuacion, nodoMasCercano } from '../utils/grafoOsm.js'
import { guardarZona, leerZona } from '../utils/almacenZona.js'
import { filtrarSismosActivos } from '../utils/riesgoSismico.js'
import { calcularRutaEvacuacion } from '../utils/dijkstraEvacuacion.js'

// Si el teléfono reporta un margen de error mayor, la ubicación es aproximada (Wi-Fi o
// antenas) y una ruta calculada desde ahí podría empezar en otro lugar
export const PRECISION_MAXIMA_M = 200

// Se usa como valor por defecto para no crear un arreglo nuevo en cada render
const SIN_BLOQUEOS = []

const INICIAL = { fase: 'inactivo', error: null, zona: null, origen: null, precisionM: null }

// Calcula la ruta con la zona (calles y puntos de reunión) y la ubicación de la persona.
// Devuelve { estado, resultado, error } y nunca lanza: cualquier problema es un estado.
function calcularConZona(zona, origen, sismos, bloqueos) {
  try {
    if (zona.puntosReunion.length === 0) return { estado: 'sin-puntos' }
    const nodoOrigen = nodoMasCercano(zona.grafo, origen)
    if (nodoOrigen === null) return { estado: 'lejos-de-calles' }

    const ruta = calcularRutaEvacuacion(
      zona.grafo,
      nodoOrigen,
      zona.puntosReunion.map((p) => p.nodoId),
      filtrarSismosActivos(sismos, Date.now()),
      { bloqueos },
    )
    if (ruta.estado !== 'ok') return { estado: 'sin-ruta', motivo: ruta.motivo }

    const punto = zona.puntosReunion.find((p) => p.nodoId === ruta.refugioId)
    return {
      estado: 'listo',
      resultado: { ...ruta, puntoReunion: { nombre: punto.nombre, coordenadas: punto.coordenadas } },
    }
  } catch (e) {
    // Datos inesperados: se avisa en lugar de mostrar una ruta que podría estar mal
    return { estado: 'error', error: e?.message || 'Error desconocido' }
  }
}

// Busca la ruta a pie más segura hacia un punto de reunión.
// - sismos: FeatureCollection de USGS (se usan solo los de las últimas 72 h)
// - bloqueos: Features de bloqueos (por ahora ninguno; llegarán con Supabase)
//
// La ruta se vuelve a calcular sola si cambian los sismos o los bloqueos, usando la
// zona ya descargada: así una ruta vieja nunca queda en pantalla pasando por un peligro nuevo.
export function useRutaEvacuacion({ sismos, bloqueos = SIN_BLOQUEOS }) {
  const [busqueda, setBusqueda] = useState(INICIAL)

  // Cada búsqueda tiene su número; si empieza otra, la anterior se ignora y se cancela
  const numeroBusquedaRef = useRef(0)
  const controladorRef = useRef(null)

  // Al salir de la pantalla se cancela cualquier descarga en curso
  useEffect(() => () => controladorRef.current?.abort(), [])

  const buscarRuta = useCallback(async () => {
    controladorRef.current?.abort()
    const controlador = new AbortController()
    controladorRef.current = controlador
    const numero = ++numeroBusquedaRef.current
    const sigueVigente = () => numero === numeroBusquedaRef.current

    setBusqueda({ ...INICIAL, fase: 'ubicando' })
    try {
      // 1. ¿Dónde está la persona?
      const { coordenadas, precisionM } = await obtenerUbicacionActual()
      if (!sigueVigente()) return
      if (precisionM !== null && precisionM > PRECISION_MAXIMA_M) {
        setBusqueda({ ...INICIAL, fase: 'ubicacion-imprecisa', origen: coordenadas, precisionM })
        return
      }

      // 2. ¿Ya tenemos guardadas las calles de esta zona?
      let zona = leerZona(coordenadas, Date.now())
      if (!zona) {
        // 3. Si no, se descargan (solo si hay señal) y se guardan para la próxima vez
        if (navigator.onLine === false) {
          setBusqueda({ ...INICIAL, fase: 'sin-zona-offline', origen: coordenadas, precisionM })
          return
        }
        setBusqueda({ ...INICIAL, fase: 'descargando', origen: coordenadas, precisionM })
        const { elementos, descargadoEn } = await obtenerCallesYPuntosReunion(coordenadas, {
          signal: controlador.signal,
        })
        if (!sigueVigente()) return
        zona = { centro: coordenadas, descargadoEn, ...construirZonaEvacuacion(elementos) }
        // Si no se puede guardar (almacenamiento lleno o bloqueado), la ruta se calcula igual
        guardarZona(zona)
      }

      // 4. Con la zona lista, la ruta se calcula abajo (useMemo)
      setBusqueda({ ...INICIAL, fase: 'zona-lista', zona, origen: coordenadas, precisionM })
    } catch (e) {
      if (!sigueVigente() || e?.name === 'AbortError') return
      setBusqueda({ ...INICIAL, fase: 'error', error: e?.message || 'Error desconocido' })
    }
  }, [])

  const limpiar = useCallback(() => {
    numeroBusquedaRef.current++
    controladorRef.current?.abort()
    setBusqueda(INICIAL)
  }, [])

  // La ruta depende de la zona, del origen y de los sismos y bloqueos ACTUALES
  const calculo = useMemo(() => {
    if (busqueda.fase !== 'zona-lista') return null
    return calcularConZona(busqueda.zona, busqueda.origen, sismos, bloqueos)
  }, [busqueda, sismos, bloqueos])

  return {
    estado: calculo ? calculo.estado : busqueda.fase,
    error: calculo ? (calculo.error ?? null) : busqueda.error,
    resultado: calculo?.resultado ?? null,
    zona: busqueda.zona,
    origen: busqueda.origen,
    precisionM: busqueda.precisionM,
    buscarRuta,
    limpiar,
  }
}
