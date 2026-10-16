import { filtrarSismosMexico } from '../utils/sismos.js'

// Feed público de USGS: sismos de magnitud 2.5 o más en los últimos 7 días.
// No necesita llave. Formato: GeoJSON con coordenadas [longitud, latitud, profundidad].
export const URL_SISMOS_USGS =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'

// Descarga los sismos y deja solo los de México y alrededores.
// `signal` permite cancelar la petición (por ejemplo, al cerrar la pantalla).
// Devuelve { coleccion, generadoEn }, donde generadoEn es la hora en que USGS generó el feed.
export async function obtenerSismos({ signal } = {}) {
  const respuesta = await fetch(URL_SISMOS_USGS, { signal })
  if (!respuesta.ok) {
    throw new Error(`USGS respondió ${respuesta.status}`)
  }

  let datos
  try {
    datos = await respuesta.json()
  } catch (error) {
    // Si cancelaron la petición mientras se leía, se respeta la cancelación
    if (error.name === 'AbortError') throw error
    throw new Error('Formato inesperado de USGS', { cause: error })
  }
  if (!Array.isArray(datos?.features)) {
    throw new Error('Formato inesperado de USGS')
  }

  return {
    coleccion: filtrarSismosMexico(datos),
    generadoEn: datos.metadata?.generated ?? null,
  }
}
