import { distanciaMetros } from './geo.js'

// Qué tan riesgoso es caminar por cada tipo de calle de OpenStreetMap después de un sismo
// (0 = lo más seguro). Las banquetas y calles peatonales son lo más seguro; las avenidas
// grandes tienen más tráfico y fachadas altas; las escaleras son peligrosas con prisa.
export const VULNERABILIDAD_VIA = {
  footway: 0,
  pedestrian: 0,
  living_street: 0.05,
  residential: 0.1,
  unclassified: 0.1,
  service: 0.1,
  tertiary: 0.15,
  secondary: 0.2,
  path: 0.2,
  cycleway: 0.2,
  primary: 0.25,
  steps: 0.3,
}
// Para cualquier otro tipo de vía
const VULNERABILIDAD_OTRA_VIA = 0.2
// Puentes y túneles suman riesgo: tras un sismo pueden estar dañados
const EXTRA_PUENTE_O_TUNEL = 0.5

// Distancia máxima (m) para "pegar" un punto (la persona o un punto de reunión) a la red de calles
export const DISTANCIA_MAXIMA_A_CALLE_M = 300

// Vías donde OSM dice que caminar "no se recomienda" (foot=discouraged)
const EXTRA_CAMINAR_DESACONSEJADO = 0.3

// Vulnerabilidad de una calle según sus etiquetas (tags) de OpenStreetMap
export function vulnerabilidadDeVia(tags) {
  const base = VULNERABILIDAD_VIA[tags?.highway] ?? VULNERABILIDAD_OTRA_VIA
  const esPuente = Boolean(tags?.bridge) && tags.bridge !== 'no'
  // Un pasaje bajo un edificio (tunnel=building_passage) no es un túnel de verdad
  const esTunel = Boolean(tags?.tunnel) && tags.tunnel !== 'no' && tags.tunnel !== 'building_passage'
  let vulnerabilidad = base
  if (esPuente || esTunel) vulnerabilidad += EXTRA_PUENTE_O_TUNEL
  if (tags?.foot === 'discouraged') vulnerabilidad += EXTRA_CAMINAR_DESACONSEJADO
  return vulnerabilidad
}

// Valores de "foot" que prohíben caminar. "use_sidepath" significa que hay una banqueta
// aparte: no se debe mandar a la gente por el arroyo de la avenida.
const PIE_PROHIBIDO = new Set(['no', 'private', 'use_sidepath'])
// Valores de "foot" que permiten caminar aunque el acceso general esté cerrado
const PIE_PERMITIDO = new Set(['yes', 'designated', 'permissive'])
// Accesos generales que cierran la vía al público
const ACCESO_CERRADO = new Set(['no', 'private', 'customers', 'delivery', 'military'])

// ¿Se puede caminar por esta vía? Se omiten las privadas y las que prohíben peatones
function sePuedeCaminar(tags) {
  if (PIE_PROHIBIDO.has(tags?.foot)) return false
  if (ACCESO_CERRADO.has(tags?.access) && !PIE_PERMITIDO.has(tags?.foot)) return false
  return true
}

// Id del nodo de la red más cercano a [lon, lat], o null si está a más de `maxM` metros
export function nodoMasCercano(grafo, coordenadas, maxM = DISTANCIA_MAXIMA_A_CALLE_M) {
  let mejorId = null
  let mejorDistancia = Infinity
  for (const nodo of Object.values(grafo?.nodos ?? {})) {
    const distancia = distanciaMetros(coordenadas, nodo.coordenadas)
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia
      mejorId = nodo.id
    }
  }
  return mejorDistancia <= maxM ? mejorId : null
}

// Convierte la respuesta de Overpass en:
// - grafo: { nodos: { [id]: { id, coordenadas: [lon, lat] } }, aristas: [{ id, desde, hasta, vulnerabilidad, tipoVia }] }
// - puntosReunion: [{ id, nombre, coordenadas, nodoId }], solo los que quedan a ≤ 300 m de una calle
export function construirZonaEvacuacion(elementos) {
  const nodos = {}
  const aristas = []

  for (const elemento of elementos ?? []) {
    if (elemento?.type !== 'way' || !sePuedeCaminar(elemento.tags)) continue
    const ids = elemento.nodes ?? []
    const geometria = elemento.geometry ?? []
    // Cada id de nodo debe tener su punto; si no coinciden, la vía viene incompleta y se omite
    if (ids.length < 2 || ids.length !== geometria.length) continue
    if (geometria.some((p) => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lon))) continue

    const vulnerabilidad = vulnerabilidadDeVia(elemento.tags)
    const tipoVia = elemento.tags?.highway ?? 'desconocida'
    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i])
      // Overpass da { lat, lon }; la app siempre usa [longitud, latitud]
      nodos[id] ??= { id, coordenadas: [geometria[i].lon, geometria[i].lat] }
      if (i > 0) {
        aristas.push({ id: `${elemento.id}-${i}`, desde: String(ids[i - 1]), hasta: id, vulnerabilidad, tipoVia })
      }
    }
  }

  const grafo = { nodos, aristas }
  const puntosReunion = []
  for (const elemento of elementos ?? []) {
    if (elemento?.type !== 'node' || elemento.tags?.emergency !== 'assembly_point') continue
    if (!Number.isFinite(elemento.lat) || !Number.isFinite(elemento.lon)) continue
    const coordenadas = [elemento.lon, elemento.lat]
    const nodoId = nodoMasCercano(grafo, coordenadas)
    // Un punto de reunión lejos de toda calle conocida no se puede alcanzar por la red
    if (nodoId === null) continue
    puntosReunion.push({
      id: `reunion-${elemento.id}`,
      nombre: elemento.tags.name ?? 'Punto de reunión',
      coordenadas,
      nodoId,
    })
  }

  return { grafo, puntosReunion }
}
