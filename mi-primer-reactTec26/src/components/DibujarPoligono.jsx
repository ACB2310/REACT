import { useEffect, useRef } from 'react'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { cerrarAnillo } from '../utils/zonas.js'

const ID_FUENTE = 'dibujo-zona'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Lo que se ve mientras se dibuja: los puntos, la línea que los une y, desde 3 puntos,
// el polígono relleno (cerrado de vuelta al primer punto)
function dibujo(puntos) {
  const features = puntos.map((punto, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: punto },
    properties: { orden: i + 1 },
  }))
  const anillo = cerrarAnillo(puntos)
  if (anillo) {
    features.unshift({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [anillo] }, properties: {} })
  } else if (puntos.length === 2) {
    features.unshift({ type: 'Feature', geometry: { type: 'LineString', coordinates: puntos }, properties: {} })
  }
  return { type: 'FeatureCollection', features }
}

// Dibujar una zona tocando el mapa: cada toque agrega un vértice [longitud, latitud].
// `puntos` y `alCambiar(puntos)` los maneja la página (para Deshacer y Borrar).
function DibujarPoligono({ mapa, puntos, alCambiar }) {
  const puntosRef = useRef(puntos)
  const alCambiarRef = useRef(alCambiar)
  useEffect(() => {
    puntosRef.current = puntos
    alCambiarRef.current = alCambiar
  }, [puntos, alCambiar])

  // Cada toque en el mapa agrega un punto
  useEffect(() => {
    if (!mapa) return
    function alTocar(evento) {
      alCambiarRef.current?.([...puntosRef.current, [evento.lngLat.lng, evento.lngLat.lat]])
    }
    mapa.on('click', alTocar)
    return () => mapa.off('click', alTocar)
  }, [mapa])

  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: dibujo(puntosRef.current) }) }],
    capas: [
      {
        id: 'dibujo-zona-relleno',
        type: 'fill',
        source: ID_FUENTE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#dc2626', 'fill-opacity': 0.25 },
      },
      {
        id: 'dibujo-zona-borde',
        type: 'line',
        source: ID_FUENTE,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
        paint: { 'line-color': '#dc2626', 'line-width': 3 },
      },
      {
        id: 'dibujo-zona-puntos',
        type: 'circle',
        source: ID_FUENTE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': '#dc2626', 'circle-stroke-width': 3 },
      },
    ],
  })

  useEffect(() => {
    mapa?.getSource(ID_FUENTE)?.setData(puntos.length > 0 ? dibujo(puntos) : COLECCION_VACIA)
  }, [mapa, puntos])

  return null
}

export default DibujarPoligono
