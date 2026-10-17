// Textos de la ruta al refugio en línea (etapa 4)

export const MODOS = {
  a_pie: { etiqueta: 'A pie', enTexto: 'a pie', google: 'walking' },
  carro: { etiqueta: 'En carro', enTexto: 'en carro', google: 'driving' },
}

const SIGUE_A_PROTECCION_CIVIL = 'Sigue las indicaciones de Protección Civil.'

export const TEXTOS_SIN_RUTA_ORS = {
  'sin-refugios': `No hay refugios abiertos a 30 km o menos de ti. ${SIGUE_A_PROTECCION_CIVIL}`,
  'sin-acceso': `No hay camino a ningún refugio abierto cercano. ${SIGUE_A_PROTECCION_CIVIL}`,
  bloqueada: `Los bloqueos y las zonas de peligro cierran el paso a los refugios cercanos. ${SIGUE_A_PROTECCION_CIVIL}`,
}
export const TEXTO_SIN_RUTA_ORS = `No encontramos una ruta segura a un refugio. ${SIGUE_A_PROTECCION_CIVIL}`

// "12 min" o "1 h 05 min"
export function textoDuracion(segundos) {
  const minutos = Math.max(1, Math.round((segundos ?? 0) / 60))
  if (minutos < 60) return `${minutos} min`
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}

// "850 m" o "4.3 km"
export function textoMetros(metros) {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1)} km`
}

// "Evita 2 bloqueos y 1 zona de peligro" (o null si no evitó nada)
export function textoEvitados({ bloqueos = 0, zonas = 0 } = {}) {
  const partes = []
  if (bloqueos > 0) partes.push(bloqueos === 1 ? '1 bloqueo' : `${bloqueos} bloqueos`)
  if (zonas > 0) partes.push(zonas === 1 ? '1 zona de peligro' : `${zonas} zonas de peligro`)
  return partes.length > 0 ? `Evita ${partes.join(' y ')}` : null
}

// Enlace para seguir la ruta en la app de mapas del teléfono.
// OJO: Google Maps pide latitud,longitud (al revés que GeoJSON).
export function enlaceRutaEnMapas(origen, destino, modo) {
  const [lngO, latO] = origen
  const [lngD, latD] = destino
  const viaje = MODOS[modo]?.google ?? 'walking'
  return `https://www.google.com/maps/dir/?api=1&origin=${latO},${lngO}&destination=${latD},${lngD}&travelmode=${viaje}`
}
