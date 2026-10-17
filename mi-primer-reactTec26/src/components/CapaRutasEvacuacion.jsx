import { useEffect, useRef } from 'react'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { cajaDeGeometria } from '../utils/geo.js'

const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Puntos de inicio (la persona) y fin (el punto de reunión) de la ruta
function puntosDeLaRuta(origen, destino) {
  const punto = (coordenadas, rol) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coordenadas },
    properties: { rol },
  })
  const features = []
  if (origen) features.push(punto(origen, 'origen'))
  if (destino) features.push(punto(destino, 'destino'))
  return { type: 'FeatureCollection', features }
}

// Dibuja la ruta de evacuación a pie: una línea gruesa con borde blanco, de color según
// su riesgo, más un punto azul donde está la persona y uno verde en el punto de reunión.
// Va encima de todas las demás capas para que siempre se vea.
function CapaRutasEvacuacion({ mapa, ruta: rutaRecibida, origen, destino }) {
  // Una ruta sin geometría válida no se dibuja (en lugar de romper la pantalla)
  const ruta = rutaRecibida?.geometry?.coordinates?.length >= 2 ? rutaRecibida : null
  // Los puntos solo se dibujan junto con una ruta: un punto suelto sin ruta confundiría
  const puntos = ruta ? puntosDeLaRuta(origen, destino) : COLECCION_VACIA

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
          'circle-color': ['match', ['get', 'rol'], 'origen', '#2563eb', 'destino', '#16a34a', '#6b7280'],
          // El punto de reunión es más grande: así se distingue aunque no se vean bien los colores
          'circle-radius': ['match', ['get', 'rol'], 'destino', 12, 8],
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
    const trazo = JSON.stringify([ruta.geometry.coordinates, origen, destino])
    if (trazo === ultimoTrazoRef.current) return
    ultimoTrazoRef.current = trazo

    const [oeste, sur, este, norte] = cajaDeGeometria({
      type: 'MultiPoint',
      coordinates: [...ruta.geometry.coordinates, ...(origen ? [origen] : []), ...(destino ? [destino] : [])],
    })
    try {
      mapa.fitBounds([[oeste, sur], [este, norte]], { padding: 48, maxZoom: 17 })
    } catch {
      // Si el mapa está oculto o es muy pequeño no se puede encuadrar; la ruta igual se dibuja
    }
  }, [mapa, ruta, origen, destino])

  return null
}

export default CapaRutasEvacuacion
