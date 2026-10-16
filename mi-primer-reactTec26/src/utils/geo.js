import distance from '@turf/distance'
import pointToLineDistance from '@turf/point-to-line-distance'
import { lineString, point } from '@turf/helpers'

// Funciones geográficas sencillas. Las coordenadas siempre van en [longitud, latitud].

// ¿El punto está dentro de la caja [oeste, sur, este, norte]? Los bordes cuentan como dentro.
export function dentroDeCaja(coordenadas, [oeste, sur, este, norte]) {
  const [longitud, latitud] = coordenadas ?? []
  if (typeof longitud !== 'number' || typeof latitud !== 'number') return false
  return longitud >= oeste && longitud <= este && latitud >= sur && latitud <= norte
}

// Distancia entre dos puntos [longitud, latitud], en metros (Turf usa la fórmula haversine)
export function distanciaMetros(a, b) {
  return distance(point(a), point(b), { units: 'meters' })
}

// Distancia más corta de un punto a un tramo recto [a → b], en kilómetros.
// Si el punto queda "más allá" de un extremo, se mide hasta ese extremo.
export function distanciaPuntoSegmentoKm(punto, a, b) {
  return pointToLineDistance(point(punto), lineString([a, b]), { units: 'kilometers' })
}
