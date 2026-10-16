// Mensaje de estado de una fuente de datos (sismos, ciclones, satélite):
// cargando, actualizando o error con botón "Reintentar".
// No muestra nada cuando la fuente está bien.
//
// `etiqueta` lleva el artículo ("los sismos", "la imagen de satélite") y
// `plural` ajusta el verbo ("No se pudieron…" / "No se pudo…").
function MensajeFuente({ etiqueta, plural, estado, error, hayDatos, hora, recargar }) {
  const verbo = plural ? 'pudieron' : 'pudo'

  let tipo = null
  let texto = null
  if (estado === 'error') {
    tipo = 'error'
    texto = hayDatos
      ? `No se ${verbo} actualizar ${etiqueta}. Mostrando datos del ${hora}.`
      : `No se ${verbo} cargar ${etiqueta}: ${error}`
  } else if (estado === 'cargando') {
    tipo = 'info'
    texto = hayDatos ? `Actualizando ${etiqueta}…` : `Cargando ${etiqueta}…`
  }
  if (!texto) return null

  return (
    <div className={`mensaje-estado mensaje-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <p>{texto}</p>
      {tipo === 'error' && (
        <button type="button" className="boton-reintentar" onClick={recargar}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export default MensajeFuente
