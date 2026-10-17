// Etapa 7: qué datos de la ruta vienen de la copia guardada en el teléfono (no de una
// descarga nueva) y de cuándo es la más antigua, para avisarlo en el panel de la ruta.
// Cada fuente es lo que devuelve su hook: { desdeAlmacen, consultadoEn }.

const NOMBRES = { bloqueos: 'bloqueos', zonas: 'zonas de peligro', refugios: 'refugios' }

// Devuelve { nombres: [...], desde: ms | null } o null si todo es nuevo
export function copiaDatosParaRuta(fuentes) {
  const guardadas = Object.entries(NOMBRES).filter(([clave]) => fuentes[clave]?.desdeAlmacen)
  if (guardadas.length === 0) return null
  const horas = guardadas.map(([clave]) => fuentes[clave].consultadoEn).filter((ms) => Number.isFinite(ms))
  return { nombres: guardadas.map(([, nombre]) => nombre), desde: horas.length > 0 ? Math.min(...horas) : null }
}

// "bloqueos", "bloqueos y zonas de peligro", "bloqueos, zonas de peligro y refugios"
function unir(nombres) {
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

export function textoCopiaDatosRuta(copia, formatearFechaHora) {
  const fecha = copia.desde !== null ? ` (del ${formatearFechaHora(copia.desde)})` : ''
  return `Sin datos nuevos: la ruta usa ${unir(copia.nombres)} guardados en tu teléfono${fecha}. Puede haber cambios que no conoce.`
}
