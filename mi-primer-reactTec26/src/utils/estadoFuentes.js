// Resumen de una sola línea del estado de todas las fuentes de datos del mapa.
// En lugar de mostrar un aviso por fuente ("Cargando los sismos…", "Cargando los
// ciclones…"), el mapa muestra un solo indicador; el detalle se ve al tocarlo.
//
// `fuentes`: arreglo de { estado } con 'cargando' | 'listo' | 'error'.
// Devuelve { tipo, texto }, donde tipo es 'sin-conexion' | 'error' | 'cargando' | 'listo'.
export function resumirEstadoFuentes(fuentes, { sinConexion = false } = {}) {
  if (sinConexion) return { tipo: 'sin-conexion', texto: 'Sin conexión' }

  const conError = fuentes.filter((fuente) => fuente.estado === 'error').length
  if (conError > 0) {
    return { tipo: 'error', texto: conError === 1 ? '1 fuente con error' : `${conError} fuentes con error` }
  }

  if (fuentes.some((fuente) => fuente.estado === 'cargando')) {
    return { tipo: 'cargando', texto: 'Cargando datos…' }
  }

  return { tipo: 'listo', texto: 'Datos al día' }
}
