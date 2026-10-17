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

// Caja donde se aceptan reportes de bloqueos y ubicaciones de refugios: [oeste, sur, este, norte].
// Debe ser IGUAL a la función SQL dentro_de_mexico() (supabase/migrations/…_refugios.sql).
// Es más ajustada que BBOX_MEXICO de utils/sismos.js, que incluye "alrededores".
export const BBOX_REPORTES_MEXICO = [-118.6, 14.3, -86.5, 32.8]

// Distancia entre dos puntos [longitud, latitud], en metros (Turf usa la fórmula haversine)
export function distanciaMetros(a, b) {
  return distance(point(a), point(b), { units: 'meters' })
}

// Distancia más corta de un punto a un tramo recto [a → b], en kilómetros.
// Si el punto queda "más allá" de un extremo, se mide hasta ese extremo.
export function distanciaPuntoSegmentoKm(punto, a, b) {
  return pointToLineDistance(point(punto), lineString([a, b]), { units: 'kilometers' })
}

// Caja [oeste, sur, este, norte] que encierra cualquier geometría GeoJSON
// (Point, LineString, Polygon, Multi*). Sirve para descartar rápido lo que está lejos.
export function cajaDeGeometria(geometria) {
  const caja = [Infinity, Infinity, -Infinity, -Infinity]
  const recorrer = (coordenadas) => {
    if (typeof coordenadas?.[0] === 'number') {
      const [longitud, latitud] = coordenadas
      caja[0] = Math.min(caja[0], longitud)
      caja[1] = Math.min(caja[1], latitud)
      caja[2] = Math.max(caja[2], longitud)
      caja[3] = Math.max(caja[3], latitud)
    } else {
      for (const parte of coordenadas ?? []) recorrer(parte)
    }
  }
  if (geometria?.type === 'GeometryCollection') geometria.geometries?.forEach((g) => recorrer(g?.coordinates))
  else recorrer(geometria?.coordinates)
  return caja
}

// Agranda una caja `km` kilómetros hacia cada lado, con 10 % de margen para no
// descartar nunca algo que sí está cerca. Cerca de los polos devuelve el mundo entero.
export function agrandarCaja([oeste, sur, este, norte], km) {
  const latitudMaxima = Math.max(Math.abs(sur), Math.abs(norte))
  const coseno = Math.cos((latitudMaxima * Math.PI) / 180)
  if (!Number.isFinite(km) || !(coseno > 0.01)) return [-180, -90, 180, 90]
  const gradosLatitud = (km / 110.574) * 1.1
  const gradosLongitud = (km / (111.32 * coseno)) * 1.1
  return [oeste - gradosLongitud, sur - gradosLatitud, este + gradosLongitud, norte + gradosLatitud]
}

// ¿Se tocan dos cajas?
export function cajasSeTocan(a, b) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}
