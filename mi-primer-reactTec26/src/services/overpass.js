import { obtenerJson } from './http.js'

// API Overpass de OpenStreetMap: calles y puntos de reunión reales. Sin llave y con CORS.
// Es un servicio gratuito y a veces lento (~40 s medidos): solo se consulta cuando la
// persona lo pide, nunca de forma automática, para respetar su política de uso justo.
export const URL_OVERPASS = 'https://overpass-api.de/api/interpreter'

// Distancias de búsqueda alrededor de la persona
const RADIO_CALLES_M = 1500
const RADIO_PUNTOS_REUNION_M = 2500
const TIEMPO_LIMITE_OVERPASS_MS = 60000

// Tipos de calle por donde se puede caminar
const TIPOS_CALLE =
  'primary|secondary|tertiary|unclassified|residential|living_street|service|footway|pedestrian|path|steps|cycleway'

// Arma la consulta en el lenguaje de Overpass.
// OJO: Overpass usa "around:radio,LATITUD,LONGITUD", al revés que GeoJSON [longitud, latitud].
export function consultaOverpass([longitud, latitud]) {
  const alrededor = (radio) => `(around:${radio},${latitud},${longitud})`
  return (
    '[out:json][timeout:60];' +
    `way["highway"~"^(${TIPOS_CALLE})$"]${alrededor(RADIO_CALLES_M)};` +
    // "out body geom" trae, por cada calle, los ids de sus nodos y sus coordenadas
    'out body geom qt;' +
    // Solo puntos de reunión oficiales; "amenity=shelter" en OSM suele ser una parada de autobús
    `node["emergency"="assembly_point"]${alrededor(RADIO_PUNTOS_REUNION_M)};` +
    'out qt;'
  )
}

// Descarga las calles y los puntos de reunión alrededor de [longitud, latitud].
// Devuelve { elementos (la lista cruda de OSM), descargadoEn (hora de la descarga en ms) }.
export async function obtenerCallesYPuntosReunion(coordenadas, { signal } = {}) {
  const [longitud, latitud] = coordenadas ?? []
  if (!Number.isFinite(longitud) || !Number.isFinite(latitud)) {
    throw new Error('Ubicación inválida para buscar calles')
  }

  // Overpass rechaza las peticiones GET (responde 406): se envía la consulta por POST
  // como formulario simple, que el navegador manda sin pedir permiso previo (CORS)
  const datos = await obtenerJson(URL_OVERPASS, {
    signal,
    fuente: 'OpenStreetMap',
    tiempoLimiteMs: TIEMPO_LIMITE_OVERPASS_MS,
    metodo: 'POST',
    cuerpo: new URLSearchParams({ data: consultaOverpass([longitud, latitud]) }),
  })
  if (!Array.isArray(datos?.elements)) {
    throw new Error('Formato inesperado de OpenStreetMap')
  }
  // Si Overpass se quedó sin tiempo responde 200 con una lista INCOMPLETA y un aviso:
  // una red de calles a medias podría dar una ruta engañosa, así que se trata como error
  if (typeof datos.remark === 'string' && /error|timed out|out of memory/i.test(datos.remark)) {
    throw new Error('OpenStreetMap no terminó la consulta; intenta de nuevo')
  }

  return { elementos: datos.elements, descargadoEn: Date.now() }
}
