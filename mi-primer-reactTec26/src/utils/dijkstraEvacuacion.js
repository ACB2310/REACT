import booleanIntersects from '@turf/boolean-intersects'
import { lineString } from '@turf/helpers'
import { crearColaPrioridad } from './colaPrioridad.js'
import { distanciaMetros } from './geo.js'
import { factorRiesgoSismico } from './riesgoSismico.js'

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

// ¿El tramo [a, b] toca algún bloqueo que impida pasar a pie?
// Caminando, solo los bloqueos "total" impiden el paso; los "solo_vehiculos" se pueden cruzar.
// Un bloqueo sin tipo conocido se trata como "total": ante la duda, no se pasa.
function cruzaBloqueoAPie(a, b, bloqueos) {
  const tramo = lineString([a, b])
  return bloqueos.some(
    (bloqueo) => bloqueo?.properties?.tipo !== 'solo_vehiculos' && booleanIntersects(tramo, bloqueo),
  )
}

// Arma la lista de vecinos de cada nodo con el costo de ir hacia ellos.
// Las calles se pueden recorrer en los dos sentidos (a pie no importan los sentidos únicos).
function construirVecinos(grafo, sismosActivos, bloqueos) {
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

    const riesgoSismico = factorRiesgoSismico([a, b], sismosActivos)
    // Tramo bloqueado por un sismo fuerte o por un bloqueo total: no se usa
    if (riesgoSismico === Infinity || cruzaBloqueoAPie(a, b, bloqueos)) continue

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
// - sismosActivos: FeatureCollection de sismos (ver filtrarSismosActivos)
// - bloqueos: Features con properties.tipo 'total' o 'solo_vehiculos'
//
// Devuelve { estado: 'ok', refugioId, nodos, distanciaM, distanciaKm, costo, riesgoMaximo, nivelRiesgo, ruta }
// o { estado: 'sin-ruta', motivo } para que la pantalla avise a la persona.
export function calcularRutaEvacuacion(grafo, nodoOrigenId, idsRefugios, sismosActivos, { bloqueos = [] } = {}) {
  if (!grafo?.nodos?.[nodoOrigenId]) return { estado: 'sin-ruta', motivo: 'origen-desconocido' }

  const refugios = [...new Set(idsRefugios ?? [])].filter((id) => grafo.nodos[id])
  if (refugios.length === 0) return { estado: 'sin-ruta', motivo: 'sin-refugios' }

  const { vecinos, conCalles } = construirVecinos(grafo, sismosActivos, bloqueos)
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
