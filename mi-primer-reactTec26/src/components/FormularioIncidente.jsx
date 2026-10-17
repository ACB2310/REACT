import { useState } from 'react'
import { PRIORIDADES, TIPOS_INCIDENTE, LIMITE_DESCRIPCION_INCIDENTE, etiquetaTipoIncidente } from '../utils/incidentes.js'

// Formulario para crear un incidente. El punto se elige tocando el mapa (lo maneja la página).
// `cercanos`: incidentes abiertos del mismo tipo muy cerca (posible duplicado).
// `alGuardar({ tipo, prioridad, descripcion })` devuelve una promesa.
function FormularioIncidente({ posicion, tipoInicial = 'rescate', cercanos = [], deshabilitado, alGuardar, alCancelar, alCambiarTipo }) {
  const [tipo, setTipo] = useState(tipoInicial)
  const [prioridad, setPrioridad] = useState(null)
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const puedeGuardar = posicion && prioridad && !deshabilitado && !guardando

  function cambiarTipo(nuevo) {
    setTipo(nuevo)
    alCambiarTipo?.(nuevo)
  }

  async function guardar(evento) {
    evento.preventDefault()
    if (!puedeGuardar) return
    // Aviso de posible duplicado: ya hay uno igual abierto muy cerca
    if (cercanos.length > 0) {
      const metros = Math.round(cercanos[0].metros)
      const seguir = window.confirm(
        `Ya hay un incidente de ${etiquetaTipoIncidente(tipo).toLowerCase()} abierto a ${metros} m. ¿Crear otro de todos modos?`,
      )
      if (!seguir) return
    }
    setGuardando(true)
    setError(null)
    try {
      await alGuardar({ tipo, prioridad, descripcion: descripcion.trim() || null })
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <form className="pantalla-formulario-seccion" onSubmit={guardar} aria-label="Nuevo incidente">
      <p className="texto-ayuda">
        {posicion ? 'Puedes arrastrar el marcador para ajustarlo.' : 'Toca el mapa donde está el incidente.'}
      </p>

      <label className="campo">
        Tipo
        <select value={tipo} onChange={(evento) => cambiarTipo(evento.target.value)}>
          {Object.entries(TIPOS_INCIDENTE).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="opciones-prioridad">
        <legend>Prioridad (1 = la más urgente)</legend>
        {Object.entries(PRIORIDADES).map(([valor, { etiqueta, color }]) => (
          <label key={valor} className="opcion-prioridad" style={{ '--color-prioridad': color }}>
            <input
              type="radio"
              name="prioridad"
              value={valor}
              checked={prioridad === Number(valor)}
              onChange={() => setPrioridad(Number(valor))}
            />
            <span>
              {valor} · {etiqueta}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="campo">
        Descripción (opcional)
        <textarea
          value={descripcion}
          maxLength={LIMITE_DESCRIPCION_INCIDENTE}
          placeholder="Por ejemplo: 2 personas atrapadas en planta baja"
          onChange={(evento) => setDescripcion(evento.target.value)}
        />
        <span className="contador">
          {descripcion.length} / {LIMITE_DESCRIPCION_INCIDENTE}
        </span>
      </label>

      {cercanos.length > 0 && (
        <div className="mensaje-estado mensaje-aviso" role="status">
          <p>
            Posible duplicado: ya hay un incidente de {etiquetaTipoIncidente(tipo).toLowerCase()} abierto a{' '}
            {Math.round(cercanos[0].metros)} m.
          </p>
        </div>
      )}
      {error && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="fila-botones">
        <button type="submit" className="boton-principal" disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : 'Crear incidente'}
        </button>
        <button type="button" className="boton-secundario" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
      {!posicion && <p className="texto-ayuda">Falta marcar el punto en el mapa.</p>}
      {posicion && !prioridad && <p className="texto-ayuda">Falta elegir la prioridad.</p>}
    </form>
  )
}

export default FormularioIncidente
