import { distanciaMetros } from './geo.js'

// Sugerencia de qué brigada mandar a cada incidente (etapa 6).
//
// Reglas (decisión del 2026-10-17):
// - Se atienden primero los incidentes más urgentes (prioridad 1) y, a igual prioridad,
//   los más viejos.
// - A cada uno se le sugiere la brigada DISPONIBLE más cercana a su base que no se
//   haya sugerido ya para otro incidente (así nunca se repite una brigada).
// - "Más cercana" es distancia en línea recta. Cuando exista la etapa 4
//   (OpenRouteService) se cambia `distanciaKm` por el tiempo de llegada.
//
// Es solo una sugerencia: el coordinador la acepta o la cambia, y el servidor
// vuelve a revisar todo al asignar.

function distanciaKm(a, b) {
  return distanciaMetros(a, b) / 1000
}

function ordenarPorUrgencia(incidentes) {
  return [...incidentes].sort(
    (a, b) =>
      a.properties.prioridad - b.properties.prioridad ||
      (a.properties.creadoEn ?? 0) - (b.properties.creadoEn ?? 0),
  )
}

// incidentes y brigadas: arreglos de Features (como los de obtenerIncidentes/obtenerBrigadas)
// Devuelve [{ incidenteId, brigadaId | null, distanciaKm | null }], en orden de urgencia
export function sugerirAsignaciones(incidentes = [], brigadas = []) {
  const pendientes = ordenarPorUrgencia(incidentes.filter((i) => i.properties.estado === 'pendiente'))
  const libres = brigadas.filter((b) => b.properties.estado === 'disponible')
  const usadas = new Set()

  return pendientes.map((incidente) => {
    let mejor = null
    for (const brigada of libres) {
      if (usadas.has(brigada.properties.id)) continue
      const km = distanciaKm(incidente.geometry.coordinates, brigada.geometry.coordinates)
      if (!mejor || km < mejor.distanciaKm) mejor = { brigadaId: brigada.properties.id, distanciaKm: km }
    }
    if (mejor) usadas.add(mejor.brigadaId)
    return {
      incidenteId: incidente.properties.id,
      brigadaId: mejor?.brigadaId ?? null,
      distanciaKm: mejor?.distanciaKm ?? null,
    }
  })
}

// Brigadas disponibles ordenadas de la más cercana a la más lejana de un punto,
// para el botón "Cambiar". Devuelve [{ brigada, distanciaKm }].
export function brigadasDisponiblesPorDistancia(posicion, brigadas = []) {
  return brigadas
    .filter((b) => b.properties.estado === 'disponible')
    .map((brigada) => ({ brigada, distanciaKm: distanciaKm(posicion, brigada.geometry.coordinates) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
}

// Incidentes abiertos del mismo tipo a `metros` o menos de `posicion`, para avisar
// "posible duplicado" antes de crear otro. Devuelve [{ incidente, metros }], el más cercano primero.
export function incidentesCercanos(posicion, tipo, incidentes = [], metros = 150) {
  return incidentes
    .filter((i) => i.properties.tipo === tipo && ['pendiente', 'asignado', 'en_atencion'].includes(i.properties.estado))
    .map((incidente) => ({ incidente, metros: distanciaMetros(posicion, incidente.geometry.coordinates) }))
    .filter((cercano) => cercano.metros <= metros)
    .sort((a, b) => a.metros - b.metros)
}

// "850 m" o "3.2 km"
export function textoDistancia(km) {
  if (typeof km !== 'number') return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
