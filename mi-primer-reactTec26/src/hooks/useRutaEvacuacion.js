import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import booleanIntersects from '@turf/boolean-intersects'
import { lineString, point } from '@turf/helpers'
import { obtenerUbicacionActual } from '../services/ubicacion.js'
import { obtenerCallesYPuntosReunion } from '../services/overpass.js'
import { construirZonaEvacuacion, nodoMasCercano, nodoMasCercanoConectado } from '../utils/grafoOsm.js'
import { guardarZona, leerZona } from '../utils/almacenZona.js'
import { filtrarSismosActivos } from '../utils/riesgoSismico.js'
import { calcularRutaEvacuacion, tramoBloqueadoAPie } from '../utils/dijkstraEvacuacion.js'
import { distanciaMetros } from '../utils/geo.js'

// Si el teléfono reporta un margen de error mayor, la ubicación es aproximada (Wi-Fi o
// antenas) y una ruta calculada desde ahí podría empezar en otro lugar
export const PRECISION_MAXIMA_M = 200

// Los refugios a más de esta distancia del centro de la zona descargada no pueden quedar a
// ≤ 300 m de sus calles (se descargan 1500 m alrededor): se descartan sin más cálculos
const RADIO_REFUGIOS_EN_ZONA_M = 2000

// Radio para avisar cuántos bloqueos sin confirmar hay cerca de la persona
const RADIO_AVISO_BLOQUEOS_M = 2500

// Se usa como valor por defecto para no crear un arreglo nuevo en cada render
const SIN_BLOQUEOS = []
const SIN_ZONAS = []
const SIN_SISMOS = []

// Zonas de peligro que la ruta evita (severidad 1; la 2 solo es precaución), con la forma
// de un bloqueo total: un polígono que cierra las calles que lo tocan (o pasan a ≤ 20 m)
function zonasComoBloqueos(zonas) {
  return (zonas?.features ?? [])
    .filter((zona) => zona?.properties?.severidad === 1)
    .map((zona) => ({ type: 'Feature', geometry: zona.geometry, properties: { tipo: 'total', zonaId: zona.properties.id } }))
}

// ¿El tramo [a, b] toca de verdad la zona? Sin el margen de 20 m de los bloqueos.
// Con a == b dice si un punto está dentro de la zona (o en su borde).
function tocaZonaSinMargen(a, b, zonaBloqueo) {
  const forma = a[0] === b[0] && a[1] === b[1] ? point(a) : lineString([a, b])
  return booleanIntersects(forma, zonaBloqueo.geometry)
}

const INICIAL = { fase: 'inactivo', error: null, zona: null, origen: null, precisionM: null, ubicadoEn: null }

// Calcula la ruta con la zona (calles y puntos de reunión), la ubicación de la persona (`origen`)
// y el nodo de calle más cercano a ella. Devuelve { estado, motivo, resultado, error } y nunca
// lanza: cualquier problema es un estado.
//
// Dijkstra solo ve la red de calles. Aquí se revisa lo que queda fuera de ella:
// - el tramo de la persona a la primera esquina (hasta 300 m),
// - la posición real de cada punto de reunión y su tramo desde la última esquina.
// Cualquiera de esos tramos dentro de un bloqueo total, de una zona de peligro o del radio
// crítico de un sismo fuerte se descarta, igual que una calle.
//
// Zonas de peligro (igual que la ruta en línea): la zona donde está la persona NO se evita,
// porque si no, no podría salir; la ruta la saca y la pantalla lo avisa (origenEnZona).
// Pero ningún destino puede quedar dentro de una zona, tampoco de esa.
// "Estar dentro" es estar DE VERDAD dentro (sin margen). Si la persona está a unos metros
// fuera del borde, la zona sigue cerrando sus calles; solo su primer tramo a la calle se
// revisa sin margen (si no, el margen de 20 m le impediría salir de donde está).
function calcularConZona(zona, destinos, hayCalleCerca, origen, sismos, bloqueos, zonasEvitar) {
  try {
    if (destinos.length === 0) return { estado: 'sin-puntos' }
    if (!hayCalleCerca) return { estado: 'lejos-de-calles' }

    const sismosActivos = filtrarSismosActivos(sismos, Date.now())
    const dentroDe = (punto, lista) => tramoBloqueadoAPie(punto, punto, SIN_SISMOS, { bloqueos: lista })
    const zonasDondeEstoy = zonasEvitar.filter((z) => tocaZonaSinMargen(origen, origen, z))
    const zonasJuntoAMi = zonasEvitar.filter((z) => !zonasDondeEstoy.includes(z) && dentroDe(origen, [z]))
    const bloqueosRuta = [...bloqueos, ...zonasEvitar.filter((z) => !zonasDondeEstoy.includes(z))]
    const bloqueado = (a, b) => tramoBloqueadoAPie(a, b, sismosActivos, { bloqueos: bloqueosRuta })
    // Desde donde está la persona: las zonas junto a ella se revisan sin margen
    const bloqueosDesdeOrigen = bloqueosRuta.filter((b) => !zonasJuntoAMi.includes(b))
    const bloqueadoDesdeOrigen = (a, b) =>
      tramoBloqueadoAPie(a, b, sismosActivos, { bloqueos: bloqueosDesdeOrigen }) ||
      zonasJuntoAMi.some((z) => tocaZonaSinMargen(a, b, z))
    const coordenadasNodo = (id) => zona.grafo.nodos[id].coordenadas

    // ¿La persona misma está en un bloqueo total o cerca del epicentro de un sismo fuerte?
    if (bloqueadoDesdeOrigen(origen, origen)) return { estado: 'sin-ruta', motivo: 'origen-en-zona-de-peligro' }

    // Se revisa cada punto por su posición real, no solo por la esquina a la que se pegó
    const puntosSeguros = destinos.filter(
      (p) =>
        !bloqueado(p.coordenadas, p.coordenadas) &&
        !bloqueado(coordenadasNodo(p.nodoId), p.coordenadas) &&
        !dentroDe(p.coordenadas, zonasEvitar),
    )
    if (puntosSeguros.length === 0) return { estado: 'sin-ruta', motivo: 'refugios-inalcanzables' }

    // La esquina donde empieza la ruta: la más cercana a la persona que SÍ está conectada
    // con algún destino SEGURO (no un andador suelto ni uno cuyo único destino es peligroso)
    const nodoOrigen = nodoMasCercanoConectado(zona.grafo, origen, puntosSeguros.map((p) => p.nodoId))
    // Hay calles cerca, pero ninguna conectada con un punto de reunión o refugio seguro
    if (nodoOrigen === null) return { estado: 'sin-ruta', motivo: 'origen-aislado' }
    // ¿El camino de la persona a esa primera calle cruza un peligro?
    if (bloqueadoDesdeOrigen(origen, coordenadasNodo(nodoOrigen))) {
      return { estado: 'sin-ruta', motivo: 'origen-en-zona-de-peligro' }
    }

    const ruta = calcularRutaEvacuacion(
      zona.grafo,
      nodoOrigen,
      puntosSeguros.map((p) => p.nodoId),
      sismosActivos,
      { bloqueos: bloqueosRuta },
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
        // La persona está dentro de una zona de peligro: la ruta la saca de ahí
        origenEnZona: zonasDondeEstoy.length > 0,
        distanciaM,
        distanciaKm: Math.round(distanciaM / 100) / 10,
        ruta: lineaCompleta,
        puntoReunion: {
          nombre: punto.nombre,
          coordenadas: punto.coordenadas,
          tipo: punto.tipo,
          // Para los refugios: hora del estado (abierto) según la lista oficial
          ...(punto.actualizadoEn != null && { actualizadoEn: punto.actualizadoEn }),
        },
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
// - zonas: FeatureCollection de zonas de peligro (Supabase). Las de severidad 1 se evitan.
//   null = no se pudieron cargar (la pantalla lo avisa con sinDatosZonas).
//
// La ruta se vuelve a calcular sola si cambian los sismos o los bloqueos, usando la
// zona ya descargada: así una ruta vieja nunca queda en pantalla pasando por un peligro nuevo.
export function useRutaEvacuacion({ sismos, bloqueos = SIN_BLOQUEOS, refugios = null, zonas = null }) {
  const [busqueda, setBusqueda] = useState(INICIAL)
  const zonasEvitar = useMemo(() => (zonas ? zonasComoBloqueos(zonas) : SIN_ZONAS), [zonas])

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
        // Solo se guarda una zona con calles: si vino vacía se vuelve a intentar la próxima
        // vez en lugar de quedarse así 7 días. Una zona con calles sirve aunque no tenga
        // puntos de reunión de OSM, porque también se usan los refugios oficiales.
        // Si no se puede guardar (almacenamiento lleno o bloqueado), la ruta se calcula igual.
        if (zona.grafo.aristas.length > 0) guardarZona(zona)
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
      // La lista trae refugios de todo el país: los que quedan fuera de la zona descargada
      // se descartan con una sola medida, antes de buscar su calle (eso es lo lento)
      if (distanciaMetros(busqueda.zona.centro, [longitud, latitud]) > RADIO_REFUGIOS_EN_ZONA_M) continue
      const nodoId = nodoMasCercano(busqueda.zona.grafo, [longitud, latitud])
      if (nodoId === null) continue
      refugiosAbiertos.push({
        id: `refugio-${refugio.properties.id ?? refugio.id}`,
        nombre: refugio.properties.nombre ?? 'Refugio',
        coordenadas: [longitud, latitud],
        nodoId,
        tipo: 'refugio',
        actualizadoEn: refugio.properties.actualizadoEn ?? null,
      })
    }
    return [...puntos, ...refugiosAbiertos]
  }, [busqueda, refugios])

  // ¿Hay alguna calle a ≤ 300 m de la persona? Solo cambia con otra búsqueda
  const hayCalleCerca = useMemo(() => {
    if (busqueda.fase !== 'zona-lista') return false
    try {
      return nodoMasCercano(busqueda.zona.grafo, busqueda.origen) !== null
    } catch {
      return false
    }
  }, [busqueda])

  // La ruta depende de la zona, del origen, de los destinos y de los sismos, bloqueos y
  // zonas de peligro ACTUALES
  const calculo = useMemo(() => {
    if (busqueda.fase !== 'zona-lista') return null
    return calcularConZona(busqueda.zona, destinos, hayCalleCerca, busqueda.origen, sismos, bloqueos, zonasEvitar)
  }, [busqueda, destinos, hayCalleCerca, sismos, bloqueos, zonasEvitar])

  // Los bloqueos 'total' sin confirmar SÍ bloquean la ruta (ante la duda, no se pasa).
  // Si por eso no hay ruta, la pantalla puede decir cuántos hay cerca sin confirmar.
  const bloqueosSinConfirmarCerca = useMemo(() => {
    if (!busqueda.origen) return 0
    return (bloqueos ?? []).filter((b) => {
      const p = b?.properties ?? {}
      const coordenadas = b?.geometry?.type === 'Point' ? b.geometry.coordinates : null
      return (
        p.tipo !== 'solo_vehiculos' &&
        p.confirmado !== true &&
        coordenadas &&
        distanciaMetros(busqueda.origen, coordenadas) <= RADIO_AVISO_BLOQUEOS_M
      )
    }).length
  }, [busqueda.origen, bloqueos])

  return {
    estado: calculo ? calculo.estado : busqueda.fase,
    bloqueosSinConfirmarCerca,
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
    // Sin datos de zonas de peligro la ruta no las puede evitar: la pantalla debe avisarlo
    sinDatosZonas: zonas == null,
    buscarRuta,
    limpiar,
  }
}
