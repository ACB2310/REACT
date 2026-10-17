import { crearColaPrioridad } from './colaPrioridad.js'
import { agrandarCaja, cajaDeGeometria, cajasSeTocan, distanciaMetros, distanciaPuntoSegmentoKm } from './geo.js'
import { factorRiesgoConSismosPreparados, prepararSismos } from './riesgoSismico.js'

// Vulnerabilidad que se usa si una calle no trae un valor válido.
// Es la misma que "cualquier otra vía" del plan: ante la duda, no se asume que es segura.
const VULNERABILIDAD_DESCONOCIDA = 0.2

// Límites para describir el riesgo de una ruta con palabras
const LIMITE_RIESGO_MEDIO = 0.5
const LIMITE_RIESGO_ALTO = 1.5

function nivelDeRiesgo(riesgo) {
  if (riesgo < LIMITE_RIESGO_MEDIO) return 'bajo'
  if (riesgo < LIMITE_RIESGO_ALTO) return 'medio'
  return 'alto'
}

// Los bloqueos se reportan tocando el mapa, así que nunca caen exacto sobre la calle de
// OpenStreetMap: un bloqueo (punto, línea o polígono) cierra las calles a esta distancia o menos
const TOLERANCIA_BLOQUEO_M = 20

// Formato que deben tener los bloqueos (lo que tendrá que entregar Supabase en la etapa 3):
// un Feature de GeoJSON con geometría Point, LineString o Polygon (o sus Multi) en [lon, lat]
// y properties.tipo 'total' o 'solo_vehiculos'. También se acepta la geometría sola.
const TIPOS_GEOMETRIA_BLOQUEO = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'])

// Tramos rectos [p, q] de una línea o del contorno de un polígono, cada uno con su caja
// agrandada 20 m: así solo se miden los tramos del bloqueo que quedan cerca de cada calle
function tramosDeGeometria(geometria) {
  const lineas = {
    LineString: () => [geometria.coordinates],
    MultiLineString: () => geometria.coordinates,
    Polygon: () => geometria.coordinates,
    MultiPolygon: () => geometria.coordinates.flat(),
  }[geometria.type]()
  return lineas.flatMap((linea) =>
    linea.slice(1).map((q, i) => {
      const p = linea[i]
      const caja = agrandarCaja(cajaDeGeometria({ type: 'LineString', coordinates: [p, q] }), TOLERANCIA_BLOQUEO_M / 1000)
      return { p, q, caja }
    }),
  )
}

// Polígonos de un bloqueo como [anilloExterior, ...huecos]; las líneas no tienen
function poligonosDeGeometria(geometria) {
  if (geometria.type === 'Polygon') return [geometria.coordinates]
  if (geometria.type === 'MultiPolygon') return geometria.coordinates
  return []
}

// ¿El punto está dentro del anillo? (se cuenta cuántas veces una línea horizontal cruza el borde)
function puntoEnAnillo([x, y], anillo) {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

// Dentro del polígono: dentro del anillo exterior y fuera de sus huecos
function puntoEnPoligono(punto, [exterior, ...huecos]) {
  return puntoEnAnillo(punto, exterior) && !huecos.some((hueco) => puntoEnAnillo(punto, hueco))
}

// ¿Se cruzan (o se tocan) los tramos a-b y p-q? Geometría plana: sobra a escala de calles.
function orientacion(a, b, c) {
  return Math.sign((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]))
}
function sobreTramo(a, b, c) {
  return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
}
function tramosSeCruzan(a, b, p, q) {
  const o1 = orientacion(a, b, p)
  const o2 = orientacion(a, b, q)
  const o3 = orientacion(p, q, a)
  const o4 = orientacion(p, q, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (
    (o1 === 0 && sobreTramo(a, b, p)) ||
    (o2 === 0 && sobreTramo(a, b, q)) ||
    (o3 === 0 && sobreTramo(p, q, a)) ||
    (o4 === 0 && sobreTramo(p, q, b))
  )
}

// Prepara los bloqueos que impiden pasar A PIE, una sola vez por cálculo:
// - Caminando, solo los "total" impiden el paso; los "solo_vehiculos" se pueden cruzar.
// - Un bloqueo sin tipo conocido se trata como "total": ante la duda, no se pasa.
// - Un bloqueo con formato desconocido DETIENE el cálculo: ignorarlo podría dar una ruta que lo cruza.
// - Se guarda la caja de cada bloqueo para descartar rápido las calles lejanas.
function prepararBloqueosAPie(bloqueos) {
  const preparados = []
  for (const bloqueo of bloqueos ?? []) {
    const geometria = bloqueo?.type === 'Feature' ? bloqueo.geometry : bloqueo
    if (!TIPOS_GEOMETRIA_BLOQUEO.has(geometria?.type) || !Array.isArray(geometria.coordinates)) {
      throw new Error('Hay un bloqueo con formato desconocido')
    }
    if (bloqueo?.properties?.tipo === 'solo_vehiculos') continue
    const esPunto = geometria.type === 'Point' || geometria.type === 'MultiPoint'
    preparados.push({
      geometria,
      esPunto,
      tramos: esPunto ? [] : tramosDeGeometria(geometria),
      poligonos: esPunto ? [] : poligonosDeGeometria(geometria),
      caja: agrandarCaja(cajaDeGeometria(geometria), TOLERANCIA_BLOQUEO_M / 1000),
    })
  }
  return preparados
}

// Puntos de un bloqueo de tipo Point o MultiPoint
function puntosDeBloqueo(geometria) {
  return geometria.type === 'Point' ? [geometria.coordinates] : geometria.coordinates
}

// Distancia (m) entre dos tramos que no se cruzan: la menor de cada extremo al otro tramo
function distanciaEntreTramosM([a, b], [p, q]) {
  return (
    Math.min(
      distanciaPuntoSegmentoKm(a, p, q),
      distanciaPuntoSegmentoKm(b, p, q),
      distanciaPuntoSegmentoKm(p, a, b),
      distanciaPuntoSegmentoKm(q, a, b),
    ) * 1000
  )
}

// ¿El tramo [a, b] toca algún bloqueo que impida pasar a pie (o pasa a 20 m o menos)?
// Con a == b sirve para saber si un punto (un refugio, la persona) queda dentro de un bloqueo.
//
// Para líneas y polígonos (las zonas de peligro pueden medir km² y tener decenas de vértices)
// solo se miden los lados que quedan cerca de la calle; el resto se descarta por su caja.
// Si la calle no cruza ni pasa cerca de ningún lado, solo queda saber si está toda adentro:
// basta con ver si uno de sus extremos está dentro del polígono.
function tocaBloqueoAPie(a, b, bloqueos) {
  if (bloqueos.length === 0) return false
  const cajaTramo = cajaDeGeometria({ type: 'LineString', coordinates: [a, b] })
  return bloqueos.some(({ geometria, esPunto, tramos, poligonos, caja }) => {
    if (!cajasSeTocan(cajaTramo, caja)) return false
    if (esPunto) {
      return puntosDeBloqueo(geometria).some(
        (p) => distanciaPuntoSegmentoKm(p, a, b) * 1000 <= TOLERANCIA_BLOQUEO_M,
      )
    }
    const cercanos = tramos.filter((tramo) => cajasSeTocan(cajaTramo, tramo.caja))
    if (cercanos.some(({ p, q }) => tramosSeCruzan(a, b, p, q))) return true
    if (poligonos.some((poligono) => puntoEnPoligono(a, poligono))) return true
    return cercanos.some(({ p, q }) => distanciaEntreTramosM([a, b], [p, q]) <= TOLERANCIA_BLOQUEO_M)
  })
}

// ¿Se puede caminar el tramo [a, b] (fuera del grafo)? Sirve para revisar lo que Dijkstra no ve:
// el tramo de la persona a la primera calle y el de la última calle al punto de reunión.
// Devuelve true si cruza el radio crítico de un sismo fuerte o un bloqueo total.
export function tramoBloqueadoAPie(a, b, sismosActivos, { bloqueos = [] } = {}) {
  if (factorRiesgoConSismosPreparados([a, b], prepararSismos(sismosActivos)) === Infinity) return true
  return tocaBloqueoAPie(a, b, prepararBloqueosAPie(bloqueos))
}

// Arma la lista de vecinos de cada nodo con el costo de ir hacia ellos.
// Las calles se pueden recorrer en los dos sentidos (a pie no importan los sentidos únicos).
function construirVecinos(grafo, sismos, bloqueos) {
  const vecinos = new Map()
  const conCalles = new Set()
  const agregar = (desde, entrada) => {
    if (!vecinos.has(desde)) vecinos.set(desde, [])
    vecinos.get(desde).push(entrada)
  }

  for (const arista of grafo.aristas ?? []) {
    const a = grafo.nodos[arista.desde]?.coordenadas
    const b = grafo.nodos[arista.hasta]?.coordenadas
    if (!a || !b) continue
    conCalles.add(arista.desde)
    conCalles.add(arista.hasta)

    const riesgoSismico = factorRiesgoConSismosPreparados([a, b], sismos)
    // Tramo bloqueado por un sismo fuerte o por un bloqueo total: no se usa
    if (riesgoSismico === Infinity || tocaBloqueoAPie(a, b, bloqueos)) continue

    const vulnerabilidad =
      Number.isFinite(arista.vulnerabilidad) && arista.vulnerabilidad >= 0
        ? arista.vulnerabilidad
        : VULNERABILIDAD_DESCONOCIDA
    const distancia = distanciaMetros(a, b)
    // Costo ponderado: la distancia "pesa más" mientras más riesgosa es la calle
    const costo = distancia * (1 + riesgoSismico + vulnerabilidad)
    const riesgo = riesgoSismico + vulnerabilidad

    agregar(arista.desde, { vecino: arista.hasta, costo, distancia, riesgo })
    agregar(arista.hasta, { vecino: arista.desde, costo, distancia, riesgo })
  }
  return { vecinos, conCalles }
}

// Busca el punto de reunión o refugio al que conviene ir a pie desde `nodoOrigenId`:
// el de MENOR COSTO TOTAL (distancia ponderada por riesgo), no necesariamente el más cercano.
//
// - grafo: { nodos: { [id]: { id, coordenadas: [lon, lat] } }, aristas: [{ id, desde, hasta, vulnerabilidad, tipoVia }] }
// - idsRefugios: ids de los nodos que son puntos de reunión o refugios
// - sismosActivos: FeatureCollection (o lista) de sismos (ver filtrarSismosActivos)
// - bloqueos: Features con properties.tipo 'total' o 'solo_vehiculos' (polígono, línea o punto)
//
// Devuelve { estado: 'ok', refugioId, nodos, distanciaM, distanciaKm, costo, riesgoMaximo, nivelRiesgo, ruta }
// o { estado: 'sin-ruta', motivo } para que la pantalla avise a la persona.
export function calcularRutaEvacuacion(grafo, nodoOrigenId, idsRefugios, sismosActivos, { bloqueos = [] } = {}) {
  if (!grafo?.nodos?.[nodoOrigenId]) return { estado: 'sin-ruta', motivo: 'origen-desconocido' }

  const candidatos = [...new Set(idsRefugios ?? [])].filter((id) => grafo.nodos[id])
  if (candidatos.length === 0) return { estado: 'sin-ruta', motivo: 'sin-refugios' }

  // Sismos y bloqueos se preparan una sola vez para todo el cálculo
  const sismos = prepararSismos(sismosActivos)
  const bloqueosAPie = prepararBloqueosAPie(bloqueos)

  // CLAUDE.md: se descartan los refugios dentro de una zona de peligro
  // (radio crítico de un sismo fuerte o dentro de un bloqueo total), aunque ya estés ahí
  const refugios = candidatos.filter((id) => {
    const p = grafo.nodos[id].coordenadas
    return factorRiesgoConSismosPreparados([p, p], sismos) !== Infinity && !tocaBloqueoAPie(p, p, bloqueosAPie)
  })
  if (refugios.length === 0) return { estado: 'sin-ruta', motivo: 'refugios-inalcanzables' }

  const { vecinos, conCalles } = construirVecinos(grafo, sismos, bloqueosAPie)
  const yaEstaEnRefugio = refugios.includes(nodoOrigenId)
  if (!yaEstaEnRefugio && !conCalles.has(nodoOrigenId)) return { estado: 'sin-ruta', motivo: 'origen-aislado' }

  // --- Dijkstra ---
  // costoHasta: el menor costo encontrado hasta ahora para llegar a cada nodo
  // anterior: desde qué nodo (y por qué calle) se llega con ese costo
  const costoHasta = new Map([[nodoOrigenId, 0]])
  const anterior = new Map()
  const visitados = new Set()
  const pendientes = new Set(refugios)
  const cola = crearColaPrioridad()
  cola.agregar(nodoOrigenId, 0)

  while (!cola.estaVacia() && pendientes.size > 0) {
    // 1. Tomar el nodo más "barato" que todavía no se ha visitado
    const { valor: nodo, prioridad: costo } = cola.sacarMinimo()
    if (visitados.has(nodo)) continue
    visitados.add(nodo)
    pendientes.delete(nodo)

    // 2. Revisar si pasar por este nodo abarata llegar a sus vecinos
    for (const { vecino, costo: costoCalle, distancia, riesgo } of vecinos.get(nodo) ?? []) {
      if (visitados.has(vecino)) continue
      const nuevoCosto = costo + costoCalle
      if (nuevoCosto < (costoHasta.get(vecino) ?? Infinity)) {
        costoHasta.set(vecino, nuevoCosto)
        anterior.set(vecino, { nodo, distancia, riesgo })
        cola.agregar(vecino, nuevoCosto)
      }
    }
  }

  // 3. Elegir el refugio al que se llegó con el menor costo total
  let mejor = null
  for (const id of refugios) {
    const costo = costoHasta.get(id)
    if (costo !== undefined && (mejor === null || costo < mejor.costo)) mejor = { id, costo }
  }
  if (mejor === null) return { estado: 'sin-ruta', motivo: 'refugios-inalcanzables' }

  // 4. Reconstruir el camino yendo hacia atrás desde el refugio
  const nodos = [mejor.id]
  let distanciaM = 0
  let riesgoMaximo = 0
  let actual = mejor.id
  while (actual !== nodoOrigenId) {
    const paso = anterior.get(actual)
    distanciaM += paso.distancia
    riesgoMaximo = Math.max(riesgoMaximo, paso.riesgo)
    actual = paso.nodo
    nodos.unshift(actual)
  }

  const distanciaRedondeada = Math.round(distanciaM)
  const nivelRiesgo = nivelDeRiesgo(riesgoMaximo)
  const coordenadas = nodos.map((id) => grafo.nodos[id].coordenadas.slice(0, 2))
  // Un LineString necesita al menos 2 puntos: si ya estás en el refugio se repite el punto
  if (coordenadas.length === 1) coordenadas.push([...coordenadas[0]])

  return {
    estado: 'ok',
    refugioId: mejor.id,
    nodos,
    distanciaM: distanciaRedondeada,
    distanciaKm: Math.round(distanciaM / 100) / 10,
    costo: mejor.costo,
    riesgoMaximo,
    nivelRiesgo,
    ruta: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coordenadas },
      properties: { refugioId: mejor.id, distanciaM: distanciaRedondeada, nivelRiesgo },
    },
  }
}
