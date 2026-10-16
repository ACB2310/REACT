import { obtenerJson } from './http.js'
import { dentroDeCaja } from '../utils/geo.js'
import { BBOX_CICLONES, nombreCorto, nombreTipoCiclon } from '../utils/ciclones.js'

// Servicio oficial de NOAA que republica los productos GIS del NHC (Centro
// Nacional de Huracanes de EE. UU.) en GeoJSON. A diferencia de CurrentStorms.json,
// este servicio sí permite pedirse desde el navegador (CORS).
// El servicio "summary" junta en cada capa a todas las tormentas activas.
export const URL_NHC_BASE =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer'

// Número de cada capa dentro del servicio
export const CAPAS_NHC = { puntos: 5, trayectorias: 6, conos: 7, avisos: 8 }

function urlCapa(numero) {
  return `${URL_NHC_BASE}/${numero}/query?where=1%3D1&outFields=*&f=geojson`
}

async function obtenerCapa(numero, signal) {
  const datos = await obtenerJson(urlCapa(numero), { signal, fuente: 'NOAA' })
  // Cuando ArcGIS falla responde 200 con { error: ... }: eso no es "cero tormentas"
  if (!Array.isArray(datos?.features)) {
    throw new Error('Formato inesperado de NOAA')
  }
  return datos
}

function soloDeLasTormentas(coleccion, bins) {
  return { ...coleccion, features: coleccion.features.filter((f) => bins.has(f.properties?.binnumber)) }
}

// Descarga las 4 capas en paralelo y deja solo las tormentas cerca de México.
// Devuelve { puntos, trayectorias, conos, avisos, actualizadoEn }.
export async function obtenerCiclonesNhc({ signal } = {}) {
  const [puntos, trayectorias, conos, avisos] = await Promise.all([
    obtenerCapa(CAPAS_NHC.puntos, signal),
    obtenerCapa(CAPAS_NHC.trayectorias, signal),
    obtenerCapa(CAPAS_NHC.conos, signal),
    obtenerCapa(CAPAS_NHC.avisos, signal),
  ])

  // Una tormenta está "cerca" si su posición actual (tau 0) cae en la zona de interés.
  // Cada tormenta se identifica por su "bin" (EP1, AT2...), que comparten todas sus capas.
  const bins = new Set(
    puntos.features
      .filter((p) => p.properties?.tau === 0 && dentroDeCaja(p.geometry?.coordinates, BBOX_CICLONES))
      .map((p) => p.properties.binnumber),
  )

  // NOAA manda el nombre en inglés ("Hurricane Trudy"); para la etiqueta del mapa
  // se agrega uno en español ("Huracán Trudy")
  const puntosCercanos = soloDeLasTormentas(puntos, bins)
  const puntosConEtiqueta = {
    ...puntosCercanos,
    features: puntosCercanos.features.map((punto) => ({
      ...punto,
      properties: {
        ...punto.properties,
        nombreEtiqueta: `${nombreTipoCiclon(punto.properties.stormtype)} ${nombreCorto(punto.properties.stormname)}`,
      },
    })),
  }

  const resultado = {
    puntos: puntosConEtiqueta,
    trayectorias: soloDeLasTormentas(trayectorias, bins),
    conos: soloDeLasTormentas(conos, bins),
    avisos: soloDeLasTormentas(avisos, bins),
  }

  // La hora del dato es la del archivo más reciente que publicó NOAA
  const fechas = Object.values(resultado)
    .flatMap((c) => c.features.map((f) => f.properties.idp_filedate))
    .filter((fecha) => typeof fecha === 'number')

  return { ...resultado, actualizadoEn: fechas.length > 0 ? Math.max(...fechas) : null }
}
