import { obtenerJson } from './http.js'
import { agregarProfundidad, filtrarSismosMexico } from '../utils/sismos.js'

// Feed público de USGS: sismos de magnitud 2.5 o más en los últimos 7 días.
// No necesita llave. Formato: GeoJSON con coordenadas [longitud, latitud, profundidad].
export const URL_SISMOS_USGS =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'

// Descarga los sismos y deja solo los de México y alrededores.
// `signal` permite cancelar la petición (por ejemplo, al cerrar la pantalla).
// Devuelve { coleccion, generadoEn }, donde generadoEn es la hora en que USGS generó el feed.
export async function obtenerSismos({ signal } = {}) {
  const datos = await obtenerJson(URL_SISMOS_USGS, { signal, fuente: 'USGS' })
  if (!Array.isArray(datos?.features)) {
    throw new Error('Formato inesperado de USGS')
  }

  return {
    coleccion: agregarProfundidad(filtrarSismosMexico(datos)),
    generadoEn: datos.metadata?.generated ?? null,
  }
}
