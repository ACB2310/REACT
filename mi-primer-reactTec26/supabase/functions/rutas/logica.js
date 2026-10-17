// Lógica de la Edge Function `rutas` (etapa 4), SIN dependencias:
// la usa Deno en Supabase y la prueba Vitest en la computadora.
// Todas las coordenadas van en [longitud, latitud].
//
// Cómo se elige la ruta (decisiones del 2026-10-17, ver docs/superpowers/plans/…etapa4…):
// 1. Candidatos: los 10 refugios ABIERTOS más cercanos en línea recta (≤ 30 km) que no
//    estén dentro de una zona de peligro de severidad 1.
// 2. La matriz de ORS los ordena por TIEMPO de llegada (la matriz no acepta zonas a evitar).
// 3. Para los 3 más rápidos se pide la ruta real evitando bloqueos y zonas.
// 4. Se descarta cualquier ruta que cruce un obstáculo y gana la de menor tiempo.

export const PERFILES = { a_pie: 'foot-walking', carro: 'driving-car' }
export const RADIO_BLOQUEO_M = 25
export const MAXIMO_CANDIDATOS = 10
export const RADIO_CANDIDATOS_KM = 30
export const RUTAS_A_PROBAR = 3
export const MARGEN_CAJA_KM = 2
// Límites de OpenRouteService para avoid_polygons (con un poco de margen)
export const AREA_MAXIMA_KM2 = 190
export const EXTENSION_MAXIMA_KM = 19.5

const RADIO_TIERRA_KM = 6371.0088
const KM_POR_GRADO = 111.32

// ---------------------------------------------------------------------------
// Geometría sencilla
// ---------------------------------------------------------------------------

// Distancia en km entre dos puntos (fórmula haversine)
export function distanciaKm([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a))
}

// Polígono (anillo cerrado) que aproxima un círculo alrededor de un punto
export function circuloAlrededor([lng, lat], metros = RADIO_BLOQUEO_M, lados = 8) {
  const dLat = metros / 1000 / KM_POR_GRADO
  const dLng = metros / 1000 / (KM_POR_GRADO * Math.cos((lat * Math.PI) / 180))
  const anillo = []
  for (let i = 0; i < lados; i++) {
    const angulo = (2 * Math.PI * i) / lados
    anillo.push([lng + dLng * Math.cos(angulo), lat + dLat * Math.sin(angulo)])
  }
  anillo.push(anillo[0])
  return anillo
}

// Caja [oeste, sur, este, norte] de una lista de puntos
export function cajaDe(puntos) {
  let [oeste, sur, este, norte] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lng, lat] of puntos) {
    oeste = Math.min(oeste, lng)
    este = Math.max(este, lng)
    sur = Math.min(sur, lat)
    norte = Math.max(norte, lat)
  }
  return [oeste, sur, este, norte]
}

export function agrandarCaja([oeste, sur, este, norte], km) {
  const dLat = km / KM_POR_GRADO
  const latMedia = ((sur + norte) / 2) * (Math.PI / 180)
  const dLng = km / (KM_POR_GRADO * Math.cos(latMedia))
  return [oeste - dLng, sur - dLat, este + dLng, norte + dLat]
}

export function cajasSeTocan(a, b) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

// Lado más largo de la caja, en km (así mide ORS la "extensión")
export function extensionKm([oeste, sur, este, norte]) {
  const ancho = distanciaKm([oeste, (sur + norte) / 2], [este, (sur + norte) / 2])
  const alto = distanciaKm([oeste, sur], [oeste, norte])
  return Math.max(ancho, alto)
}

// Área aproximada de un anillo en km² (proyección local; suficiente para zonas pequeñas)
export function areaKm2(anillo) {
  const latMedia = (anillo.reduce((suma, [, lat]) => suma + lat, 0) / anillo.length) * (Math.PI / 180)
  const kmPorGradoLng = KM_POR_GRADO * Math.cos(latMedia)
  let doble = 0
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x1, y1] = [anillo[i][0] * kmPorGradoLng, anillo[i][1] * KM_POR_GRADO]
    const [x2, y2] = [anillo[i + 1][0] * kmPorGradoLng, anillo[i + 1][1] * KM_POR_GRADO]
    doble += x1 * y2 - x2 * y1
  }
  return Math.abs(doble) / 2
}

// ¿El punto está dentro del anillo? (rayo hacia la derecha)
export function puntoEnAnillo([x, y], anillo) {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

function orientacion(a, b, c) {
  const valor = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
  return Math.sign(valor)
}

function enSegmento(a, b, c) {
  return (
    Math.min(a[0], c[0]) <= b[0] && b[0] <= Math.max(a[0], c[0]) &&
    Math.min(a[1], c[1]) <= b[1] && b[1] <= Math.max(a[1], c[1])
  )
}

// ¿Se cruzan los segmentos p1-p2 y q1-q2?
export function segmentosSeCruzan(p1, p2, q1, q2) {
  const o1 = orientacion(p1, p2, q1)
  const o2 = orientacion(p1, p2, q2)
  const o3 = orientacion(q1, q2, p1)
  const o4 = orientacion(q1, q2, p2)
  if (o1 !== o2 && o3 !== o4) return true
  return (
    (o1 === 0 && enSegmento(p1, q1, p2)) ||
    (o2 === 0 && enSegmento(p1, q2, p2)) ||
    (o3 === 0 && enSegmento(q1, p1, q2)) ||
    (o4 === 0 && enSegmento(q1, p2, q2))
  )
}

// ¿La línea (lista de puntos) toca el anillo? Un punto dentro o un tramo que cruza el borde.
export function lineaTocaAnillo(linea, anillo) {
  if (!cajasSeTocan(cajaDe(linea), cajaDe(anillo))) return false
  if (linea.some((punto) => puntoEnAnillo(punto, anillo))) return true
  for (let i = 0; i < linea.length - 1; i++) {
    for (let j = 0; j < anillo.length - 1; j++) {
      if (segmentosSeCruzan(linea[i], linea[i + 1], anillo[j], anillo[j + 1])) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Datos de entrada
// ---------------------------------------------------------------------------

// Primer anillo de un GeoJSON Polygon (texto o objeto) o null si no sirve
export function anilloDeGeojson(geojson) {
  try {
    const forma = typeof geojson === 'string' ? JSON.parse(geojson) : geojson
    if (forma?.type !== 'Polygon' || !Array.isArray(forma.coordinates?.[0])) return null
    const anillo = forma.coordinates[0]
    return anillo.length >= 4 && anillo.every((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) ? anillo : null
  } catch {
    return null
  }
}

// Zonas que la ruta debe evitar: severidad 1 con polígono válido
export function zonasAEvitar(zonas = []) {
  return zonas
    .filter((zona) => zona.severidad === 1)
    .map((zona) => ({ id: zona.id, anillo: anilloDeGeojson(zona.geojson) }))
    .filter((zona) => zona.anillo)
}

// Refugios abiertos con ubicación, fuera de zonas de peligro, del más cercano al más lejano
export function refugiosCandidatos(origen, refugios = [], zonas = [], maximo = MAXIMO_CANDIDATOS, radioKm = RADIO_CANDIDATOS_KM) {
  const peligro = zonasAEvitar(zonas)
  return refugios
    .filter((r) => r.estado === 'abierto' && Number.isFinite(r.longitud) && Number.isFinite(r.latitud))
    .map((r) => ({ ...r, posicion: [r.longitud, r.latitud] }))
    .filter((r) => !peligro.some((zona) => puntoEnAnillo(r.posicion, zona.anillo)))
    .map((r) => ({ ...r, distanciaKm: distanciaKm(origen, r.posicion) }))
    .filter((r) => r.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, maximo)
}

// Junta candidatos con sus tiempos de la matriz; quita los que no tienen ruta (null)
export function ordenarPorTiempo(candidatos, duraciones) {
  return candidatos
    .map((candidato, i) => ({ ...candidato, duracionMatrizS: duraciones?.[i] }))
    .filter((c) => Number.isFinite(c.duracionMatrizS))
    .sort((a, b) => a.duracionMatrizS - b.duracionMatrizS)
}

// Obstáculos para una ruta origen → destino.
// - A pie: bloqueos `total`. En carro: `total` y `solo_vehiculos`.
// - Zonas de severidad 1, menos la que contiene el origen (si no, ORS no encuentra salida).
// - Solo los que tocan la caja origen–destino + 2 km, del más cercano al origen al más lejano,
//   mientras quepan en los límites de ORS. Los que no caben NO se mandan, pero `todos`
//   los incluye para revisar después que la ruta no los cruce.
export function obstaculosParaRuta({ bloqueos = [], zonas = [], modo, origen, destino }) {
  const tipos = modo === 'carro' ? ['total', 'solo_vehiculos'] : ['total']
  const caja = agrandarCaja(cajaDe([origen, destino]), MARGEN_CAJA_KM)

  const deBloqueos = bloqueos
    .filter((b) => tipos.includes(b.tipo) && Number.isFinite(b.longitud) && Number.isFinite(b.latitud))
    .map((b) => ({ clase: 'bloqueo', id: b.id, anillo: circuloAlrededor([b.longitud, b.latitud]) }))
    // Si la persona está parada junto al bloqueo (≤ 25 m), ese no se evita: debe poder salir
    .filter((b) => !puntoEnAnillo(origen, b.anillo))

  let origenEnZona = null
  const deZonas = []
  for (const zona of zonasAEvitar(zonas)) {
    if (puntoEnAnillo(origen, zona.anillo)) origenEnZona = zona.id
    else deZonas.push({ clase: 'zona', id: zona.id, anillo: zona.anillo })
  }

  const todos = [...deBloqueos, ...deZonas]
  const enCamino = todos
    .filter((o) => cajasSeTocan(cajaDe(o.anillo), caja))
    .map((o) => ({ ...o, distanciaKm: distanciaKm(origen, o.anillo[0]) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm)

  const enviados = []
  let area = 0
  for (const obstaculo of enCamino) {
    const areaNueva = area + areaKm2(obstaculo.anillo)
    const extension = extensionKm(cajaDe([...enviados, obstaculo].flatMap((o) => o.anillo)))
    if (areaNueva > AREA_MAXIMA_KM2 || extension > EXTENSION_MAXIMA_KM) continue
    enviados.push(obstaculo)
    area = areaNueva
  }

  return {
    avoid: enviados.length > 0 ? { type: 'MultiPolygon', coordinates: enviados.map((o) => [o.anillo]) } : null,
    evitados: {
      bloqueos: enviados.filter((o) => o.clase === 'bloqueo').length,
      zonas: enviados.filter((o) => o.clase === 'zona').length,
    },
    omitidos: enCamino.length - enviados.length,
    todos,
    origenEnZona,
  }
}

// ¿La ruta cruza algún obstáculo? (también los que no se mandaron a ORS)
export function rutaCruzaObstaculos(linea, obstaculos) {
  return obstaculos.some((o) => lineaTocaAnillo(linea, o.anillo))
}

// Distancia, tiempo e instrucciones de una ruta de ORS (GeoJSON Feature)
export function resumirRuta(ruta) {
  const propiedades = ruta?.properties ?? {}
  const pasos = (propiedades.segments ?? []).flatMap((segmento) =>
    (segmento.steps ?? []).map((paso) => ({
      instruccion: String(paso.instruction ?? ''),
      distanciaM: Math.round(paso.distance ?? 0),
    })),
  )
  return {
    distanciaM: Math.round(propiedades.summary?.distance ?? 0),
    duracionS: Math.round(propiedades.summary?.duration ?? 0),
    pasos,
  }
}

// Error de ORS → código de la app
export function codigoErrorOrs(status, cuerpo) {
  const codigo = cuerpo?.error?.code
  if (codigo === 2009 || codigo === 2010 || codigo === 2016) return 'SIN_RUTA'
  if (status === 401 || status === 403) return 'ORS_LLAVE'
  if (status === 429) return 'ORS_LIMITE'
  return 'ORS_ERROR'
}

export class ErrorRutas extends Error {
  constructor(codigo) {
    super(codigo)
    this.codigo = codigo
  }
}

// ---------------------------------------------------------------------------
// Todo junto. `pedirMatriz(perfil, puntos)` devuelve las duraciones desde puntos[0]
// a cada uno de los demás; `pedirRuta(perfil, origen, destino, avoid)` devuelve la
// Feature de ORS o lanza ErrorRutas('SIN_RUTA'). Se inyectan para poder probar sin red.
// ---------------------------------------------------------------------------
export async function planificarRuta({ origen, modo, refugios, bloqueos, zonas, pedirMatriz, pedirRuta }) {
  const perfil = PERFILES[modo]
  if (!perfil) throw new ErrorRutas('MODO_INVALIDO')

  const candidatos = refugiosCandidatos(origen, refugios, zonas)
  if (candidatos.length === 0) return { estado: 'sin-ruta', motivo: 'sin-refugios' }

  const duraciones = await pedirMatriz(perfil, [origen, ...candidatos.map((c) => c.posicion)])
  const ordenados = ordenarPorTiempo(candidatos, duraciones)
  if (ordenados.length === 0) return { estado: 'sin-ruta', motivo: 'sin-acceso' }

  const intentos = await Promise.allSettled(
    ordenados.slice(0, RUTAS_A_PROBAR).map(async (destino) => {
      const obstaculos = obstaculosParaRuta({ bloqueos, zonas, modo, origen, destino: destino.posicion })
      const ruta = await pedirRuta(perfil, origen, destino.posicion, obstaculos.avoid)
      const linea = ruta?.geometry?.coordinates ?? []
      // Nunca mostrar una ruta que cruce un bloqueo o una zona (CLAUDE.md)
      if (linea.length < 2 || rutaCruzaObstaculos(linea, obstaculos.todos)) {
        throw new ErrorRutas('CRUZA_OBSTACULO')
      }
      return { destino, ruta, resumen: resumirRuta(ruta), obstaculos }
    }),
  )

  // Un error de ORS que no sea "sin ruta" (llave, límite, caída) se informa tal cual
  const graves = intentos.filter(
    (i) => i.status === 'rejected' && !['SIN_RUTA', 'CRUZA_OBSTACULO'].includes(i.reason?.codigo),
  )
  const buenas = intentos.filter((i) => i.status === 'fulfilled').map((i) => i.value)
  if (buenas.length === 0) {
    if (graves.length > 0) throw graves[0].reason
    return { estado: 'sin-ruta', motivo: 'bloqueada' }
  }

  const mejor = buenas.sort((a, b) => a.resumen.duracionS - b.resumen.duracionS)[0]
  const { destino, ruta, resumen, obstaculos } = mejor
  return {
    estado: 'ruta',
    modo,
    destino: {
      id: destino.id,
      nombre: destino.nombre,
      direccion: destino.direccion ?? null,
      municipio: destino.municipio ?? null,
      posicion: destino.posicion,
    },
    ruta: { type: 'Feature', geometry: ruta.geometry, properties: { modo } },
    resumen,
    evitados: obstaculos.evitados,
    origenEnZona: obstaculos.origenEnZona !== null,
  }
}
