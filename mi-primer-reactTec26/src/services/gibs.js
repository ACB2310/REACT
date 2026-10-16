import { pedir } from './http.js'

// NASA GIBS: imágenes de satélite casi en tiempo real. Sin llave y con CORS.
// GOES-East "GeoColor" muestra nubes de día y de noche sobre México cada 10 minutos.
const CAPA_SATELITE = 'GOES-East_ABI_GeoColor'
const BASE = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${CAPA_SATELITE}/default`

// Con la hora "default", GIBS entrega la imagen más reciente y dice su hora real
// en la cabecera Layer-Time-Actual. Se pide con HEAD para no descargar la imagen.
const URL_HORA_SATELITE = `${BASE}/default/GoogleMapsCompatible_Level7/0/0/0.png`

// URL de teselas para MapLibre. WMTS usa el orden {z}/{y}/{x} (fila antes que columna).
export function urlTeselasSatelite(hora) {
  return `${BASE}/${hora}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`
}

// Devuelve { datos: hora de la imagen más reciente (texto ISO), actualizadoEn: la misma hora en ms }
export async function obtenerHoraSatelite({ signal } = {}) {
  const respuesta = await pedir(URL_HORA_SATELITE, { signal, fuente: 'NASA GIBS', metodo: 'HEAD' })
  const hora = respuesta.headers.get('layer-time-actual')
  const ms = hora ? Date.parse(hora) : NaN
  // Sin hora no se puede mostrar la imagen ni decir de cuándo es: no se inventa
  if (Number.isNaN(ms)) {
    throw new Error('Formato inesperado de NASA GIBS')
  }
  return { datos: hora, actualizadoEn: ms }
}
