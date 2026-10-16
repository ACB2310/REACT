// Utilidades para los ciclones tropicales que llegan de NHC (vía NOAA) y de GDACS.

// Zona de interés para ciclones: [oeste, sur, este, norte]. Cubre el Pacífico
// y el Atlántico cercanos a México, porque una tormenta lejos hoy puede llegar mañana.
export const BBOX_CICLONES = [-130, 5, -70, 35]

// El NHC da el viento en nudos; en México se usa km/h
export function nudosAKmh(nudos) {
  if (typeof nudos !== 'number' || Number.isNaN(nudos)) return null
  return Math.round(nudos * 1.852)
}

const TIPOS_CICLON = {
  HU: 'Huracán',
  MH: 'Huracán mayor',
  TS: 'Tormenta tropical',
  TD: 'Depresión tropical',
  STS: 'Tormenta subtropical',
  STD: 'Depresión subtropical',
  PTC: 'Ciclón tropical potencial',
  PT: 'Ciclón postropical',
}

// Traduce el código de tipo del NHC ("HU", "TS"...) al español
export function nombreTipoCiclon(codigo) {
  return TIPOS_CICLON[codigo] ?? 'Ciclón tropical'
}

const ALERTAS_GDACS = { Green: 'verde', Orange: 'naranja', Red: 'roja' }

// Traduce el nivel de alerta de GDACS ("Green", "Orange", "Red") al español
export function nombreAlertaGdacs(nivel) {
  return ALERTAS_GDACS[nivel] ?? null
}

// Tipos que el NHC pone antes del nombre ("Hurricane Trudy", "Tropical Depression Twenty-One")
const PREFIJOS_NHC =
  /^(major hurricane|hurricane|tropical storm|tropical depression|subtropical storm|subtropical depression|potential tropical cyclone|post-tropical cyclone|remnants of)\s+/i

// Saca el nombre propio:
// "Hurricane Trudy" → "Trudy"; "SIMON-26" → "Simon";
// "Tropical Depression Twenty-One" → "Twenty-One" (el guion del nombre se conserva)
export function nombreCorto(texto) {
  // GDACS agrega el año al final ("-26")
  const sinAnio = String(texto ?? '').trim().replace(/-\d{2}$/, '')
  const sinTipo = sinAnio.replace(PREFIJOS_NHC, '')
  // Mayúscula al inicio de cada palabra o de cada parte separada por guion
  return sinTipo.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, separador, letra) => separador + letra.toUpperCase())
}

// Clave para comparar nombres de NHC y GDACS: "Twenty-One" y "TWENTYONE-26" dan "TWENTYONE"
function claveNombre(texto) {
  return nombreCorto(texto).toUpperCase().replace(/[^\p{L}\d]/gu, '')
}

// Posición actual de cada tormenta del NHC (los puntos con tau 0)
function posicionesActualesNhc(puntosNhc) {
  return (puntosNhc?.features ?? []).filter((punto) => punto.properties.tau === 0)
}

function nombresNhc(puntosNhc) {
  return new Set(posicionesActualesNhc(puntosNhc).map((p) => claveNombre(p.properties.stormname)))
}

// Junta las tormentas de NHC y GDACS en una sola lista sin duplicar.
// NHC tiene más detalle (viento, categoría); GDACS agrega el nivel de alerta
// y las tormentas que NHC todavía no publica en sus capas.
export function combinarCiclones(puntosNhc, eventosGdacs) {
  const eventos = eventosGdacs?.features ?? []
  const alertaPorNombre = new Map(
    eventos.map((e) => [claveNombre(e.properties.eventname), nombreAlertaGdacs(e.properties.episodealertlevel)]),
  )

  const deNhc = posicionesActualesNhc(puntosNhc).map((punto) => {
    const p = punto.properties
    return {
      id: `nhc-${p.binnumber}`,
      nombre: nombreCorto(p.stormname),
      tipo: nombreTipoCiclon(p.stormtype),
      vientoKmh: nudosAKmh(p.maxwind),
      categoria: p.ssnum > 0 ? p.ssnum : null,
      posicion: punto.geometry.coordinates.slice(0, 2),
      fuente: 'NHC',
      alertaGdacs: alertaPorNombre.get(claveNombre(p.stormname)) ?? null,
    }
  })

  const yaEnNhc = nombresNhc(puntosNhc)
  const deGdacs = eventos
    .filter((e) => !yaEnNhc.has(claveNombre(e.properties.eventname)))
    .map((e) => ({
      id: `gdacs-${e.properties.eventid}`,
      nombre: nombreCorto(e.properties.eventname),
      tipo: null,
      vientoKmh: null,
      categoria: null,
      posicion: e.geometry.coordinates.slice(0, 2),
      fuente: 'GDACS',
      alertaGdacs: nombreAlertaGdacs(e.properties.episodealertlevel),
    }))

  // Los más fuertes primero; los que no tienen dato de viento, al final
  return [...deNhc, ...deGdacs].sort((a, b) => (b.vientoKmh ?? -1) - (a.vientoKmh ?? -1))
}

// Avisos y vigilancias en la costa, con los colores que usa el NHC
export const AVISOS_COSTA = [
  { codigo: 'HWR', color: '#dc2626', etiqueta: 'Aviso de huracán' },
  { codigo: 'HWA', color: '#f472b6', etiqueta: 'Vigilancia de huracán' },
  { codigo: 'TWR', color: '#2563eb', etiqueta: 'Aviso de tormenta tropical' },
  { codigo: 'TWA', color: '#facc15', etiqueta: 'Vigilancia de tormenta tropical' },
]

// Colores de los niveles de alerta de GDACS
export const COLORES_ALERTA_GDACS = [
  { nivel: 'Green', color: '#16a34a', etiqueta: 'Alerta GDACS verde' },
  { nivel: 'Orange', color: '#f97316', etiqueta: 'Alerta GDACS naranja' },
  { nivel: 'Red', color: '#dc2626', etiqueta: 'Alerta GDACS roja' },
]

// Color para cualquier código que no esté en las listas de arriba
export const COLOR_DESCONOCIDO = '#6b7280'

// Eventos de GDACS que NHC no tiene, para dibujarlos como puntos en el mapa
export function eventosGdacsSinNhc(puntosNhc, eventosGdacs) {
  const yaEnNhc = nombresNhc(puntosNhc)
  return {
    type: 'FeatureCollection',
    features: (eventosGdacs?.features ?? []).filter((e) => !yaEnNhc.has(claveNombre(e.properties.eventname))),
  }
}
