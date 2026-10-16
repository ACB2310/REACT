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

// Saca el nombre propio: "Hurricane Trudy" → "Trudy"; "SIMON-26" → "Simon"
export function nombreCorto(texto) {
  const sinAnio = String(texto ?? '').split('-')[0].trim()
  const ultimaPalabra = sinAnio.split(/\s+/).at(-1) ?? ''
  return ultimaPalabra.charAt(0).toUpperCase() + ultimaPalabra.slice(1).toLowerCase()
}

// Posición actual de cada tormenta del NHC (los puntos con tau 0)
function posicionesActualesNhc(puntosNhc) {
  return (puntosNhc?.features ?? []).filter((punto) => punto.properties.tau === 0)
}

function nombresNhc(puntosNhc) {
  return new Set(posicionesActualesNhc(puntosNhc).map((p) => nombreCorto(p.properties.stormname)))
}

// Junta las tormentas de NHC y GDACS en una sola lista sin duplicar.
// NHC tiene más detalle (viento, categoría); GDACS agrega el nivel de alerta
// y las tormentas que NHC todavía no publica en sus capas.
export function combinarCiclones(puntosNhc, eventosGdacs) {
  const eventos = eventosGdacs?.features ?? []
  const alertaPorNombre = new Map(
    eventos.map((e) => [nombreCorto(e.properties.eventname), nombreAlertaGdacs(e.properties.episodealertlevel)]),
  )

  const deNhc = posicionesActualesNhc(puntosNhc).map((punto) => {
    const p = punto.properties
    const nombre = nombreCorto(p.stormname)
    return {
      id: `nhc-${p.binnumber}`,
      nombre,
      tipo: nombreTipoCiclon(p.stormtype),
      vientoKmh: nudosAKmh(p.maxwind),
      categoria: p.ssnum > 0 ? p.ssnum : null,
      posicion: punto.geometry.coordinates.slice(0, 2),
      fuente: 'NHC',
      alertaGdacs: alertaPorNombre.get(nombre) ?? null,
    }
  })

  const yaEnNhc = new Set(deNhc.map((c) => c.nombre))
  const deGdacs = eventos
    .filter((e) => !yaEnNhc.has(nombreCorto(e.properties.eventname)))
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

// Eventos de GDACS que NHC no tiene, para dibujarlos como puntos en el mapa
export function eventosGdacsSinNhc(puntosNhc, eventosGdacs) {
  const yaEnNhc = nombresNhc(puntosNhc)
  return {
    type: 'FeatureCollection',
    features: (eventosGdacs?.features ?? []).filter((e) => !yaEnNhc.has(nombreCorto(e.properties.eventname))),
  }
}
