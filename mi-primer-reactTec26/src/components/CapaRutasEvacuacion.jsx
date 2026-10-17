import { useEffect, useRef } from 'react'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { cajaDeGeometria } from '../utils/geo.js'

const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Las líneas de una ruta: una Feature (un tramo) o una FeatureCollection (ruta combinada:
// tramo en carro + tramo a pie). Si algún tramo no tiene una línea válida, devuelve null.
function lineasDeLaRuta(ruta) {
  const tramos = ruta?.type === 'FeatureCollection' ? ruta.features : [ruta]
  if (!Array.isArray(tramos) || tramos.length === 0) return null
  const lineas = tramos.map((tramo) => tramo?.geometry?.coordinates)
  return lineas.every((linea) => Array.isArray(linea) && linea.length >= 2) ? lineas : null
}

// Puntos de inicio (la persona), fin (el punto de reunión o refugio) y, en la ruta
// combinada, dónde bajarse del vehículo
function puntosDeLaRuta(origen, destino, transbordo) {
  const punto = (coordenadas, rol) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coordenadas },
    properties: { rol },
  })
  const features = []
  if (origen) features.push(punto(origen, 'origen'))
  if (destino) features.push(punto(destino, 'destino'))
  if (transbordo) features.push(punto(transbordo, 'transbordo'))
  return { type: 'FeatureCollection', features }
}

// Dibuja la ruta de evacuación a pie: una línea gruesa con borde blanco, de color según
// su riesgo, más un punto azul donde está la persona y uno verde en el punto de reunión.
// Va encima de todas las demás capas para que siempre se vea.
// En la ruta combinada (etapa 5) cada tramo trae su `modo`: morado en carro, azul a pie,
// y un punto ámbar donde bajarse (`transbordo`).
function CapaRutasEvacuacion({ mapa, ruta: rutaRecibida, origen, destino, transbordo = null }) {
  // Una ruta sin geometría válida no se dibuja (en lugar de romper la pantalla)
  const lineas = lineasDeLaRuta(rutaRecibida)
  const ruta = lineas ? rutaRecibida : null
  // Los puntos solo se dibujan junto con una ruta: un punto suelto sin ruta confundiría
  const puntos = ruta ? puntosDeLaRuta(origen, destino, transbordo) : COLECCION_VACIA

  useCapasMapa(mapa, {
    fuentes: [
      { id: 'evacuacion-ruta', definicion: () => ({ type: 'geojson', data: ruta ?? COLECCION_VACIA }) },
      { id: 'evacuacion-puntos', definicion: () => ({ type: 'geojson', data: puntos }) },
    ],
    capas: [
      {
        id: 'evacuacion-ruta-borde',
        type: 'line',
        source: 'evacuacion-ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9 },
      },
      {
        id: 'evacuacion-ruta',
        type: 'line',
        source: 'evacuacion-ruta',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // Ruta en línea de OpenRouteService (trae `modo`): azul a pie, morada en carro.
          // Ruta sin conexión (Dijkstra): verde = riesgo bajo, ámbar = medio, rojo = alto;
          // gris si el riesgo no se conoce.
          'line-color': [
            'case',
            ['has', 'modo'],
            ['match', ['get', 'modo'], 'carro', '#7c3aed', '#1d4ed8'],
            ['match', ['get', 'nivelRiesgo'], 'bajo', '#16a34a', 'medio', '#f59e0b', 'alto', '#dc2626', '#6b7280'],
          ],
          'line-width': 5,
        },
      },
      {
        id: 'evacuacion-puntos',
        type: 'circle',
        source: 'evacuacion-puntos',
        paint: {
          'circle-color': ['match', ['get', 'rol'], 'origen', '#2563eb', 'destino', '#16a34a', 'transbordo', '#f59e0b', '#6b7280'],
          // El punto de reunión es más grande (y el de transbordo, intermedio): así se
          // distinguen aunque no se vean bien los colores
          'circle-radius': ['match', ['get', 'rol'], 'destino', 12, 'transbordo', 10, 8],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      },
    ],
  })

  // Cuando cambian la ruta o los puntos, se actualizan los datos de las fuentes
  const clavePuntos = JSON.stringify(puntos)
  useEffect(() => {
    if (!mapa) return
    mapa.getSource('evacuacion-ruta')?.setData(ruta ?? COLECCION_VACIA)
    mapa.getSource('evacuacion-puntos')?.setData(JSON.parse(clavePuntos))
  }, [mapa, ruta, clavePuntos])

  // Al llegar una ruta NUEVA (otro trazo) se encuadra el mapa para verla completa.
  // Si solo se recalculó (por ejemplo, al actualizarse los sismos) y el trazo es el mismo,
  // no se mueve el mapa: la persona podría estar mirándolo.
  const ultimoTrazoRef = useRef(null)
  useEffect(() => {
    if (!mapa || !ruta) {
      ultimoTrazoRef.current = null
      return
    }
    const trazo = JSON.stringify([lineas, origen, destino])
    if (trazo === ultimoTrazoRef.current) return
    ultimoTrazoRef.current = trazo

    const [oeste, sur, este, norte] = cajaDeGeometria({
      type: 'MultiPoint',
      coordinates: [...lineas.flat(), ...(origen ? [origen] : []), ...(destino ? [destino] : [])],
    })
    try {
      mapa.fitBounds([[oeste, sur], [este, norte]], { padding: 48, maxZoom: 17 })
    } catch {
      // Si el mapa está oculto o es muy pequeño no se puede encuadrar; la ruta igual se dibuja
    }
  }, [mapa, ruta, lineas, origen, destino])

  return null
}

export default CapaRutasEvacuacion
