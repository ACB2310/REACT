import { obtenerJson } from './http.js'
import { dentroDeCaja } from '../utils/geo.js'
import { BBOX_CICLONES } from '../utils/ciclones.js'

// GDACS (Sistema Global de Alertas y Coordinación de Desastres, ONU/UE).
// Lista de ciclones tropicales con su nivel de alerta. Sí permite CORS.
export const URL_GDACS_CICLONES =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC'

// GDACS manda las fechas sin zona horaria, pero están en UTC
function leerFechaUtc(texto) {
  if (typeof texto !== 'string' || texto === '') return null
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(texto) ? texto : `${texto}Z`)
  return Number.isNaN(ms) ? null : ms
}

// MapLibre convierte en texto las propiedades anidadas (como `url.report`),
// así que se dejan solo propiedades planas con lo que usa la app
function aplanarEvento(evento) {
  const p = evento.properties
  const reporte = p.url?.report
  return {
    type: 'Feature',
    geometry: evento.geometry,
    properties: {
      eventid: p.eventid,
      eventname: p.eventname,
      alertlevel: p.alertlevel,
      episodealertlevel: p.episodealertlevel,
      fechaModificacion: leerFechaUtc(p.datemodified),
      urlReporte: typeof reporte === 'string' && reporte.startsWith('https://') ? reporte : null,
    },
  }
}

// Descarga los ciclones de GDACS y deja solo los actuales cerca de México.
// Devuelve { eventos: FeatureCollection, actualizadoEn }.
export async function obtenerCiclonesGdacs({ signal } = {}) {
  const datos = await obtenerJson(URL_GDACS_CICLONES, { signal, fuente: 'GDACS' })
  if (!Array.isArray(datos?.features)) {
    throw new Error('Formato inesperado de GDACS')
  }

  const features = datos.features
    .filter((e) => e.properties?.iscurrent === 'true' && dentroDeCaja(e.geometry?.coordinates, BBOX_CICLONES))
    .map(aplanarEvento)

  // La hora del dato es la última modificación de TODA la lista de GDACS, no solo de los
  // ciclones cercanos: así un día sin ciclones también dice desde cuándo es la información
  const fechas = datos.features.map((e) => leerFechaUtc(e.properties?.datemodified)).filter((f) => f !== null)
  return {
    eventos: { type: 'FeatureCollection', features },
    actualizadoEn: fechas.length > 0 ? Math.max(...fechas) : null,
  }
}
