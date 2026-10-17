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
// 5. Etapa 5: si EN CARRO no hay ruta, se busca la ruta combinada (ver planificarRutaCombinada).

export const PERFILES = { a_pie: 'foot-walking', carro: 'driving-car' }
export const RADIO_BLOQUEO_M = 25
export const MAXIMO_CANDIDATOS = 10
export const RADIO_CANDIDATOS_KM = 30
export const RUTAS_A_PROBAR = 3
export const MARGEN_CAJA_KM = 2
// Límites de OpenRouteService para avoid_polygons (con un poco de margen)
export const AREA_MAXIMA_KM2 = 190
export const EXTENSION_MAXIMA_KM = 19.5

// Ruta combinada (etapa 5, decisiones en docs/superpowers/plans/…etapa5…)
// Hasta dónde se busca dónde bajar del vehículo: lo que se camina en 15 min hasta el refugio
export const TIEMPO_A_PIE_TRANSBORDO_S = 900
// Tiempo para estacionarse y bajar del vehículo
export const TIEMPO_DESCENSO_S = 120
export const DESTINOS_COMBINADA = 2
export const PUNTOS_BORDE_TRANSBORDO = 12
// Cuántos puntos de la isócrona se prueban con rutas reales (además del punto de corte)
export const COMBINADAS_A_PROBAR = 2
// Alrededor del refugio: obstáculos que la ruta "hasta donde sí llega" no evita (para cortarla ahí)
export const RADIO_CORTE_KM = 1.5
// El carro se detiene esta distancia antes del obstáculo
export const MARGEN_ANTES_DEL_OBSTACULO_KM = 0.03
// Si ORS empieza el tramo a pie más lejos que esto de donde terminó el carro, no sirve
export const HUECO_MAXIMO_TRANSBORDO_KM = 0.05
// Si el carro avanza menos que esto, conviene la ruta a pie desde el principio
export const TRAMO_CARRO_MINIMO_M = 150
export const INSTRUCCION_TRANSBORDO = 'Bájate del vehículo aquí y sigue a pie'

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
// - `sinEvitar(obstaculo)`: los que devuelvan true no se mandan a ORS (pero siguen en `todos`).
export function obstaculosParaRuta({ bloqueos = [], zonas = [], modo, origen, destino, sinEvitar = () => false }) {
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
    .filter((o) => cajasSeTocan(cajaDe(o.anillo), caja) && !sinEvitar(o))
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
    // Qué obstáculos se mandaron (para no contar dos veces uno que evitan los dos tramos)
    idsEvitados: enviados.map((o) => `${o.clase}-${o.id}`),
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
//
// `registrar(evento)` (opcional) recibe qué se intentó en cada paso: la función lo manda a
// sus Logs para poder ver por qué no salió una ruta.
export async function planificarRuta({ origen, modo, refugios, bloqueos, zonas, pedirMatriz, pedirRuta, pedirIsocrona, registrar = () => {} }) {
  const directa = await planificarRutaDirecta({ origen, modo, refugios, bloqueos, zonas, pedirMatriz, pedirRuta })
  registrar({ paso: 'directa', modo, estado: directa.estado, motivo: directa.motivo ?? null })

  // Etapa 5: en carro, si el vehículo no llega a ningún refugio, se cambia de transporte.
  // Se calculan AL MISMO TIEMPO (para que ninguna se quede sin tiempo):
  // - la ruta combinada: en carro hasta donde se pueda y de ahí a pie;
  // - la ruta a pie desde donde está la persona (a pie los bloqueos parciales se cruzan).
  // Gana la combinada si el carro avanza de verdad; si no, la ruta a pie.
  const sinCaminoEnCarro = modo === 'carro' && directa.estado === 'sin-ruta' && directa.motivo !== 'sin-refugios'
  if (!sinCaminoEnCarro || !pedirIsocrona) return directa

  const [combinada, aPie] = await Promise.allSettled([
    planificarRutaCombinada({ origen, refugios, bloqueos, zonas, pedirMatriz, pedirRuta, pedirIsocrona, registrar }),
    planificarRutaDirecta({ origen, modo: 'a_pie', refugios, bloqueos, zonas, pedirMatriz, pedirRuta }),
  ])
  registrar({ paso: 'combinada', ...resumenDeIntento(combinada) })
  registrar({ paso: 'a-pie', ...resumenDeIntento(aPie) })

  const rutaCombinada = combinada.status === 'fulfilled' ? combinada.value : null
  if (rutaCombinada && rutaCombinada.tramos.carro.distanciaM >= TRAMO_CARRO_MINIMO_M) return rutaCombinada
  if (aPie.status === 'fulfilled' && aPie.value.estado === 'ruta') return { ...aPie.value, sinPasoEnCarro: true }
  // Un tramo en carro muy corto es mejor que nada si a pie no salió
  if (rutaCombinada) return rutaCombinada
  // Si ORS falló (límite, caída, se acabó el tiempo), la causa NO son los bloqueos: se
  // informa el error para que la app diga "No se pudo calcular la ruta" y no "cierran el paso"
  if (aPie.status === 'rejected') throw aPie.reason
  return directa
}

// Para el registro: cómo terminó un intento (sin coordenadas)
function resumenDeIntento(intento) {
  if (intento.status === 'rejected') {
    const error = intento.reason
    if (error instanceof ErrorRutas) return { error: error.codigo }
    return { error: String(error?.message ?? error), detalle: String(error?.stack ?? '') }
  }
  const valor = intento.value
  return { estado: valor?.estado ?? 'sin-ruta', motivo: valor?.motivo ?? null }
}

// La ruta normal: un solo tramo, a pie o en carro, al refugio al que se llega más rápido
async function planificarRutaDirecta({ origen, modo, refugios, bloqueos, zonas, pedirMatriz, pedirRuta }) {
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

// ---------------------------------------------------------------------------
// Ruta combinada (etapa 5): si el vehículo no puede llegar al refugio, ir en carro hasta
// el punto desde donde se llega más rápido caminando, y de ahí a pie (CLAUDE.md).
// `pedirIsocrona(perfil, punto, segundos, avoid)` devuelve el GeoJSON Polygon de lo que
// se alcanza desde `punto` en ese tiempo.
//
// Dos fuentes de candidatos para bajarse del vehículo:
// - El "punto más cercano al que sí llega": la ruta en carro al refugio SIN evitar los
//   obstáculos de sus alrededores, cortada unos metros antes del primero que toca.
//   Siempre se prueba: es el caso típico (un bloqueo en la calle de acceso).
// - Puntos de la isócrona a pie del refugio, ordenados por las matrices de ORS. La matriz
//   no conoce los bloqueos, por eso solo sirven para encontrar algo MÁS rápido.
// ---------------------------------------------------------------------------

// ¿Sirve este punto para bajarse del vehículo? No dentro de una zona de severidad 1 ni a
// 25 m o menos de un bloqueo (de cualquier tipo: el carro no puede terminar dentro de uno).
function puntoSeguroParaBajar(punto, bloqueos, zonas) {
  if (zonasAEvitar(zonas).some((zona) => puntoEnAnillo(punto, zona.anillo))) return false
  return !bloqueos.some(
    (b) => Number.isFinite(b.longitud) && Number.isFinite(b.latitud) && distanciaKm(punto, [b.longitud, b.latitud]) * 1000 <= RADIO_BLOQUEO_M,
  )
}

// Puntos candidatos para bajarse: algunos del borde de la isócrona a pie del refugio y otros
// a medio camino entre ese borde y el refugio. ORS los ajusta a la calle más cercana.
export function puntosDeTransbordo(isocrona, destino, { bloqueos = [], zonas = [] } = {}, cantidad = PUNTOS_BORDE_TRANSBORDO) {
  const anillo = anilloDeGeojson(isocrona)
  if (!anillo) return []
  const vertices = anillo.slice(0, -1)
  const paso = Math.max(1, vertices.length / cantidad)
  const puntos = []
  for (let i = 0; i < vertices.length && puntos.length < cantidad * 2; i += paso) {
    const borde = vertices[Math.floor(i)]
    puntos.push(borde, [(borde[0] + destino[0]) / 2, (borde[1] + destino[1]) / 2])
  }
  return puntos.filter((punto) => puntoSeguroParaBajar(punto, bloqueos, zonas))
}

// Punto de la línea a MARGEN_ANTES_DEL_OBSTACULO_KM antes del primer obstáculo que toca,
// o null si no toca ninguno (o si ya empieza en uno)
export function puntoAntesDeObstaculo(linea, obstaculos) {
  const toca = (tramo) => obstaculos.some((o) => lineaTocaAnillo(tramo, o.anillo))
  const entre = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  for (let i = 0; i < linea.length - 1; i++) {
    const [a, b] = [linea[i], linea[i + 1]]
    if (!toca([a, b])) continue
    if (toca([a, a])) return null
    // Hasta dónde se puede avanzar en este tramo sin tocar el obstáculo
    let libre = 0
    let ocupado = 1
    for (let paso = 0; paso < 30; paso++) {
      const medio = (libre + ocupado) / 2
      if (toca([a, entre(a, b, medio)])) ocupado = medio
      else libre = medio
    }
    const largoKm = distanciaKm(a, b)
    const t = libre - (largoKm > 0 ? MARGEN_ANTES_DEL_OBSTACULO_KM / largoKm : 1)
    if (t > 0) return entre(a, b, t)
    // El obstáculo está pegado al inicio del tramo: se usa el vértice anterior (si hay)
    return i > 0 ? a : null
  }
  return null
}

// El "punto más cercano al que sí llega" el carro (ver arriba). null si no hay.
// Primero se ignoran solo los obstáculos de los alrededores del refugio (así el carro
// rodea los demás y llega lo más cerca posible); si así no hay ruta, se ignoran TODOS:
// el carro va por el camino normal y se detiene antes del primer obstáculo.
async function candidatoDeCorte(destino, { origen, bloqueos, zonas, pedirRuta }) {
  const alrededores = agrandarCaja(cajaDe([destino.posicion]), RADIO_CORTE_KM)
  const cerca = (o) => cajasSeTocan(cajaDe(o.anillo), alrededores)
  for (const sinEvitar of [cerca, () => true]) {
    const obstaculos = obstaculosParaRuta({ bloqueos, zonas, modo: 'carro', origen, destino: destino.posicion, sinEvitar })
    let ruta
    try {
      ruta = await pedirRuta(PERFILES.carro, origen, destino.posicion, obstaculos.avoid)
    } catch (error) {
      if (error?.codigo === 'SIN_RUTA') continue
      throw error
    }
    const punto = puntoAntesDeObstaculo(ruta?.geometry?.coordinates ?? [], obstaculos.todos)
    if (punto && puntoSeguroParaBajar(punto, bloqueos, zonas)) return { destino, punto }
  }
  return null
}

// Una búsqueda de candidatos que falla (por ejemplo, ORS no responde la isócrona) no debe
// tumbar a las demás: se registra y se sigue con lo que haya
async function sinTumbarLasDemas(promesa, registrar, paso, vacio) {
  try {
    return await promesa
  } catch (error) {
    registrar({ paso, error: error?.codigo ?? String(error?.message ?? error), detalle: error?.codigo ? undefined : String(error?.stack ?? '') })
    return vacio
  }
}

// Candidatos de la isócrona con su tiempo estimado por las matrices:
// tiempo en carro hasta el punto + bajar + tiempo a pie del punto al refugio.
async function candidatosDeIsocronas(destinos, { origen, bloqueos, zonas, pedirMatriz, pedirIsocrona }) {
  const porDestino = await Promise.all(
    destinos.map(async (destino) => {
      const alrededor = obstaculosParaRuta({ bloqueos, zonas, modo: 'a_pie', origen: destino.posicion, destino: destino.posicion })
      const isocrona = await pedirIsocrona(PERFILES.a_pie, destino.posicion, TIEMPO_A_PIE_TRANSBORDO_S, alrededor.avoid)
      return puntosDeTransbordo(isocrona, destino.posicion, { bloqueos, zonas }).map((punto) => ({ destino, punto }))
    }),
  )
  const todos = porDestino.flat()
  if (todos.length === 0) return []

  // Una sola matriz en carro para todos los puntos; a pie, una por refugio
  // (a pie no hay sentidos únicos: del refugio al punto tarda lo mismo que del punto al refugio)
  const [enCarro, ...aPie] = await Promise.all([
    pedirMatriz(PERFILES.carro, [origen, ...todos.map((c) => c.punto)]),
    ...destinos.map((destino, d) => pedirMatriz(PERFILES.a_pie, [destino.posicion, ...porDestino[d].map((c) => c.punto)])),
  ])
  let i = 0
  return porDestino.flatMap((candidatos, d) =>
    candidatos
      .map((candidato, j) => {
        const carro = enCarro?.[i++]
        const pie = aPie[d]?.[j]
        // Si la matriz no llega (null), ese punto no sirve: no cuenta como 0 s
        const estimadoS = Number.isFinite(carro) && Number.isFinite(pie) ? carro + TIEMPO_DESCENSO_S + pie : null
        return { ...candidato, estimadoS }
      })
      .filter((c) => c.estimadoS !== null),
  )
}

// Ruta real de un candidato: el tramo en carro y, desde donde terminó, el tramo a pie.
// Se descarta (CRUZA_OBSTACULO) si algún tramo cruza un obstáculo, si el carro termina en
// un lugar donde no se puede bajar o si ORS empieza el tramo a pie lejos de ahí.
// Los huecos entre puntos (persona → inicio de la ruta en carro, fin a pie → refugio) se
// revisan junto con cada tramo.
async function rutaCombinadaReal({ destino, punto }, { origen, bloqueos, zonas, pedirRuta }) {
  const obstaculosCarro = obstaculosParaRuta({ bloqueos, zonas, modo: 'carro', origen, destino: punto })
  const rutaCarro = await pedirRuta(PERFILES.carro, origen, punto, obstaculosCarro.avoid)
  const lineaCarro = rutaCarro?.geometry?.coordinates ?? []
  if (lineaCarro.length < 2 || rutaCruzaObstaculos([origen, ...lineaCarro], obstaculosCarro.todos)) {
    throw new ErrorRutas('CRUZA_OBSTACULO')
  }

  const transbordo = lineaCarro.at(-1)
  if (!puntoSeguroParaBajar(transbordo, bloqueos, zonas)) throw new ErrorRutas('CRUZA_OBSTACULO')

  const obstaculosPie = obstaculosParaRuta({ bloqueos, zonas, modo: 'a_pie', origen: transbordo, destino: destino.posicion })
  const rutaPie = await pedirRuta(PERFILES.a_pie, transbordo, destino.posicion, obstaculosPie.avoid)
  const lineaPie = rutaPie?.geometry?.coordinates ?? []
  if (lineaPie.length < 2 || distanciaKm(transbordo, lineaPie[0]) > HUECO_MAXIMO_TRANSBORDO_KM) {
    throw new ErrorRutas('CRUZA_OBSTACULO')
  }
  if (rutaCruzaObstaculos([transbordo, ...lineaPie, destino.posicion], obstaculosPie.todos)) {
    throw new ErrorRutas('CRUZA_OBSTACULO')
  }

  const carro = resumirRuta(rutaCarro)
  // El último paso del carro es "Llegaste…": en la combinada lo sustituye "Bájate del vehículo"
  carro.pasos = carro.pasos.slice(0, -1)
  const aPie = resumirRuta(rutaPie)
  return { destino, transbordo, rutaCarro, rutaPie, carro, aPie, obstaculosCarro, obstaculosPie, totalS: carro.duracionS + TIEMPO_DESCENSO_S + aPie.duracionS }
}

// Devuelve la mejor ruta combinada o null si no hay ninguna. Lanza los errores de ORS.
export async function planificarRutaCombinada({ origen, refugios, bloqueos = [], zonas = [], pedirMatriz, pedirRuta, pedirIsocrona, registrar = () => {} }) {
  const destinos = refugiosCandidatos(origen, refugios, zonas, DESTINOS_COMBINADA)
  if (destinos.length === 0) return null

  const [cortes, deIsocronas] = await Promise.all([
    Promise.all(
      destinos.map((destino) =>
        sinTumbarLasDemas(candidatoDeCorte(destino, { origen, bloqueos, zonas, pedirRuta }), registrar, 'corte', null),
      ),
    ),
    sinTumbarLasDemas(candidatosDeIsocronas(destinos, { origen, bloqueos, zonas, pedirMatriz, pedirIsocrona }), registrar, 'isocronas', []),
  ])
  registrar({ paso: 'candidatos', cortes: cortes.filter(Boolean).length, isocronas: deIsocronas.length })
  const aProbar = [
    ...cortes.filter(Boolean),
    ...deIsocronas.sort((a, b) => a.estimadoS - b.estimadoS).slice(0, COMBINADAS_A_PROBAR),
  ]
  if (aProbar.length === 0) return null

  const intentos = await Promise.allSettled(aProbar.map((c) => rutaCombinadaReal(c, { origen, bloqueos, zonas, pedirRuta })))
  registrar({ paso: 'intentos', resultados: intentos.map((i) => (i.status === 'fulfilled' ? 'ok' : (i.reason?.codigo ?? 'error'))) })
  const buenas = intentos.filter((i) => i.status === 'fulfilled').map((i) => i.value)
  if (buenas.length === 0) {
    const grave = intentos.find((i) => !['SIN_RUTA', 'CRUZA_OBSTACULO'].includes(i.reason?.codigo))
    if (grave) throw grave.reason
    return null
  }

  const mejor = buenas.sort((a, b) => a.totalS - b.totalS)[0]
  const { destino, transbordo, rutaCarro, rutaPie, carro, aPie, obstaculosCarro, obstaculosPie } = mejor
  // Un obstáculo que evitan los dos tramos se cuenta una vez
  const ids = new Set([...obstaculosCarro.idsEvitados, ...obstaculosPie.idsEvitados])
  const cuantos = (clase) => [...ids].filter((id) => id.startsWith(`${clase}-`)).length
  return {
    estado: 'ruta',
    modo: 'combinada',
    destino: {
      id: destino.id,
      nombre: destino.nombre,
      direccion: destino.direccion ?? null,
      municipio: destino.municipio ?? null,
      posicion: destino.posicion,
    },
    ruta: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: rutaCarro.geometry, properties: { modo: 'carro' } },
        { type: 'Feature', geometry: rutaPie.geometry, properties: { modo: 'a_pie' } },
      ],
    },
    transbordo,
    tramos: { carro, aPie, descensoS: TIEMPO_DESCENSO_S },
    resumen: {
      distanciaM: carro.distanciaM + aPie.distanciaM,
      duracionS: mejor.totalS,
      pasos: [...carro.pasos, { instruccion: INSTRUCCION_TRANSBORDO, distanciaM: 0 }, ...aPie.pasos],
    },
    evitados: { bloqueos: cuantos('bloqueo'), zonas: cuantos('zona') },
    origenEnZona: obstaculosCarro.origenEnZona !== null,
  }
}
