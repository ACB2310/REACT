import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { obtenerUbicacionActual } from '../services/ubicacion.js'
import { obtenerCallesYPuntosReunion } from '../services/overpass.js'
import { construirZonaEvacuacion, nodoMasCercano } from '../utils/grafoOsm.js'
import { guardarZona, leerZona } from '../utils/almacenZona.js'
import { filtrarSismosActivos } from '../utils/riesgoSismico.js'
import { calcularRutaEvacuacion, tramoBloqueadoAPie } from '../utils/dijkstraEvacuacion.js'
import { distanciaMetros } from '../utils/geo.js'

// Si el teléfono reporta un margen de error mayor, la ubicación es aproximada (Wi-Fi o
// antenas) y una ruta calculada desde ahí podría empezar en otro lugar
export const PRECISION_MAXIMA_M = 200

// Se usa como valor por defecto para no crear un arreglo nuevo en cada render
const SIN_BLOQUEOS = []

const INICIAL = { fase: 'inactivo', error: null, zona: null, origen: null, precisionM: null, ubicadoEn: null }

// Calcula la ruta con la zona (calles y puntos de reunión), la ubicación de la persona (`origen`)
// y el nodo de calle más cercano a ella. Devuelve { estado, motivo, resultado, error } y nunca
// lanza: cualquier problema es un estado.
//
// Dijkstra solo ve la red de calles. Aquí se revisa lo que queda fuera de ella:
// - el tramo de la persona a la primera esquina (hasta 300 m),
// - la posición real de cada punto de reunión y su tramo desde la última esquina.
// Cualquiera de esos tramos dentro de un bloqueo total o del radio crítico de un sismo fuerte
// se descarta, igual que una calle.
function calcularConZona(zona, destinos, nodoOrigen, origen, sismos, bloqueos) {
  try {
    if (destinos.length === 0) return { estado: 'sin-puntos' }
    if (nodoOrigen === null) return { estado: 'lejos-de-calles' }

    const sismosActivos = filtrarSismosActivos(sismos, Date.now())
    const bloqueado = (a, b) => tramoBloqueadoAPie(a, b, sismosActivos, { bloqueos })
    const coordenadasNodo = (id) => zona.grafo.nodos[id].coordenadas

    // ¿La persona misma está en una zona de peligro, o su camino a la primera calle lo cruza?
    if (bloqueado(origen, origen) || bloqueado(origen, coordenadasNodo(nodoOrigen))) {
      return { estado: 'sin-ruta', motivo: 'origen-en-zona-de-peligro' }
    }

    // Se revisa cada punto por su posición real, no solo por la esquina a la que se pegó
    const puntosSeguros = destinos.filter(
      (p) => !bloqueado(p.coordenadas, p.coordenadas) && !bloqueado(coordenadasNodo(p.nodoId), p.coordenadas),
    )
    if (puntosSeguros.length === 0) return { estado: 'sin-ruta', motivo: 'refugios-inalcanzables' }

    const ruta = calcularRutaEvacuacion(
      zona.grafo,
      nodoOrigen,
      puntosSeguros.map((p) => p.nodoId),
      sismosActivos,
      { bloqueos },
    )
    if (ruta.estado !== 'ok') return { estado: 'sin-ruta', motivo: ruta.motivo }

    // Si varios puntos seguros quedan en la misma esquina, se elige el más cercano a ella
    const esquina = coordenadasNodo(ruta.refugioId)
    const punto = puntosSeguros
      .filter((p) => p.nodoId === ruta.refugioId)
      .reduce((mejor, p) => (distanciaMetros(esquina, p.coordenadas) < distanciaMetros(esquina, mejor.coordenadas) ? p : mejor))

    // La línea y la distancia van de la persona hasta el punto de reunión (no solo de esquina a esquina)
    const distanciaM = Math.round(
      ruta.distanciaM + distanciaMetros(origen, coordenadasNodo(nodoOrigen)) + distanciaMetros(esquina, punto.coordenadas),
    )
    const lineaCompleta = {
      ...ruta.ruta,
      geometry: { type: 'LineString', coordinates: [origen, ...ruta.ruta.geometry.coordinates, punto.coordenadas] },
      properties: { ...ruta.ruta.properties, distanciaM },
    }
    return {
      estado: 'listo',
      resultado: {
        ...ruta,
        distanciaM,
        distanciaKm: Math.round(distanciaM / 100) / 10,
        ruta: lineaCompleta,
        puntoReunion: { nombre: punto.nombre, coordenadas: punto.coordenadas, tipo: punto.tipo },
      },
    }
  } catch (e) {
    // Datos inesperados: se avisa en lugar de mostrar una ruta que podría estar mal
    return { estado: 'error', error: e?.message || 'Error desconocido' }
  }
}

// Busca la ruta a pie más segura hacia un punto de reunión.
// - sismos: FeatureCollection de USGS (se usan solo los de las últimas 72 h)
// - refugios: FeatureCollection de refugios oficiales (Supabase); los "abierto" se suman
//   como destinos junto con los puntos de reunión de OpenStreetMap
// - bloqueos: Features de bloqueos (Supabase), con properties.tipo 'total' o 'solo_vehiculos'.
//   Debe ser un arreglo ESTABLE (guardado en estado o con useMemo): si se crea uno nuevo
//   en cada render, la ruta se recalcula en cada render y la pantalla se vuelve lenta.
//
// La ruta se vuelve a calcular sola si cambian los sismos o los bloqueos, usando la
// zona ya descargada: así una ruta vieja nunca queda en pantalla pasando por un peligro nuevo.
export function useRutaEvacuacion({ sismos, bloqueos = SIN_BLOQUEOS, refugios = null }) {
  const [busqueda, setBusqueda] = useState(INICIAL)

  // Cada búsqueda tiene su número; si empieza otra, la anterior se ignora y se cancela
  const numeroBusquedaRef = useRef(0)
  const controladorRef = useRef(null)

  // Al salir de la pantalla se cancela cualquier descarga en curso y se descarta su resultado
  useEffect(
    () => () => {
      numeroBusquedaRef.current++
      controladorRef.current?.abort()
    },
    [],
  )

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
      // Datos de la ubicación que acompañan a cada estado siguiente
      const ubicacion = { origen: coordenadas, precisionM, ubicadoEn: Date.now() }
      if (precisionM !== null && precisionM > PRECISION_MAXIMA_M) {
        setBusqueda({ ...INICIAL, ...ubicacion, fase: 'ubicacion-imprecisa' })
        return
      }

      // 2. ¿Ya tenemos guardadas las calles de esta zona?
      let zona = leerZona(coordenadas, Date.now())
      if (!zona) {
        // 3. Si no, se descargan (solo si hay señal) y se guardan para la próxima vez
        if (navigator.onLine === false) {
          setBusqueda({ ...INICIAL, ...ubicacion, fase: 'sin-zona-offline' })
          return
        }
        setBusqueda({ ...INICIAL, ...ubicacion, fase: 'descargando' })
        const { elementos, descargadoEn } = await obtenerCallesYPuntosReunion(coordenadas, {
          signal: controlador.signal,
        })
        if (!sigueVigente()) return
        zona = { centro: coordenadas, descargadoEn, ...construirZonaEvacuacion(elementos) }
        // Solo se guarda una zona útil: si vino vacía (sin calles o sin puntos de reunión)
        // se vuelve a intentar la próxima vez en lugar de quedarse así 7 días.
        // Si no se puede guardar (almacenamiento lleno o bloqueado), la ruta se calcula igual.
        if (zona.puntosReunion.length > 0 && zona.grafo.aristas.length > 0) guardarZona(zona)
      }

      // 4. Con la zona lista, la ruta se calcula abajo (useMemo)
      setBusqueda({ ...INICIAL, ...ubicacion, fase: 'zona-lista', zona })
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

  // El nodo de calle más cercano a la persona solo cambia con una búsqueda nueva
  const nodoOrigen = useMemo(() => {
    if (busqueda.fase !== 'zona-lista') return null
    try {
      return nodoMasCercano(busqueda.zona.grafo, busqueda.origen)
    } catch {
      return null
    }
  }, [busqueda])

  // Destinos posibles: puntos de reunión de OSM y refugios oficiales ABIERTOS que queden
  // a ≤ 300 m de una calle descargada (los llenos o cerrados no sirven para llegar)
  const destinos = useMemo(() => {
    if (busqueda.fase !== 'zona-lista') return null
    const puntos = busqueda.zona.puntosReunion.map((p) => ({ ...p, tipo: 'punto-reunion' }))
    const refugiosAbiertos = []
    for (const refugio of refugios?.features ?? []) {
      if (refugio?.properties?.estado !== 'abierto') continue
      const [longitud, latitud] = refugio.geometry?.coordinates ?? []
      if (!Number.isFinite(longitud) || !Number.isFinite(latitud)) continue
      const nodoId = nodoMasCercano(busqueda.zona.grafo, [longitud, latitud])
      if (nodoId === null) continue
      refugiosAbiertos.push({
        id: `refugio-${refugio.properties.id ?? refugio.id}`,
        nombre: refugio.properties.nombre ?? 'Refugio',
        coordenadas: [longitud, latitud],
        nodoId,
        tipo: 'refugio',
      })
    }
    return [...puntos, ...refugiosAbiertos]
  }, [busqueda, refugios])

  // La ruta depende de la zona, del origen, de los destinos y de los sismos y bloqueos ACTUALES
  const calculo = useMemo(() => {
    if (busqueda.fase !== 'zona-lista') return null
    return calcularConZona(busqueda.zona, destinos, nodoOrigen, busqueda.origen, sismos, bloqueos)
  }, [busqueda, destinos, nodoOrigen, sismos, bloqueos])

  return {
    estado: calculo ? calculo.estado : busqueda.fase,
    error: calculo ? (calculo.error ?? null) : busqueda.error,
    // Por qué no hay ruta (solo con estado 'sin-ruta'), para que la pantalla lo explique
    motivo: calculo?.motivo ?? null,
    resultado: calculo?.resultado ?? null,
    zona: busqueda.zona,
    origen: busqueda.origen,
    precisionM: busqueda.precisionM,
    ubicadoEn: busqueda.ubicadoEn,
    // Sin datos de USGS (por ejemplo, sin señal desde que se abrió la app) el riesgo
    // sísmico es DESCONOCIDO: la pantalla debe avisarlo y no decir "riesgo bajo"
    sinDatosSismos: sismos == null,
    buscarRuta,
    limpiar,
  }
}
