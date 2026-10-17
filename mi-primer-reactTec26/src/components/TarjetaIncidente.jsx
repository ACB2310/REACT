import { useState } from 'react'
import {
  ESTADOS_INCIDENTE,
  PRIORIDADES,
  etiquetaEstadoBrigada,
  etiquetaTipoIncidente,
  textoAntiguedad,
} from '../utils/incidentes.js'
import { textoDistancia } from '../utils/asignacion.js'

// Tarjeta de un incidente en el panel del coordinador.
// - Por atender: muestra la brigada sugerida, "Asignar" y "Cambiar".
// - En curso: muestra la brigada y "Liberar brigada".
// Todas las acciones devuelven promesas; la página muestra el error en `error`.
//
// props:
// - incidente: Feature de incidentes_vista
// - sugerencia: { brigadaId, distanciaKm } o null
// - opciones: [{ brigada, distanciaKm }] brigadas disponibles por distancia (para "Cambiar")
// - nombreBrigada(id): nombre para mostrar
// - ocupado: hay una acción en curso para esta tarjeta
// - deshabilitado: sin conexión
function TarjetaIncidente({
  incidente,
  sugerencia = null,
  opciones = [],
  nombreBrigada,
  ocupado,
  deshabilitado,
  error,
  alAsignar,
  alLiberar,
  alCancelar,
  alCambiarPrioridad,
}) {
  const [eligiendo, setEligiendo] = useState(false)
  const p = incidente.properties
  const color = PRIORIDADES[p.prioridad]?.color ?? '#6b7280'
  const porAtender = p.estado === 'pendiente'
  const bloqueado = ocupado || deshabilitado

  function asignar(brigadaId) {
    setEligiendo(false)
    alAsignar(brigadaId)
  }

  return (
    <li className="tarjeta" style={{ '--color-prioridad': color }}>
      <div className="tarjeta-encabezado">
        <span className="insignia-prioridad" aria-label={`Prioridad ${p.prioridad}`}>
          {p.prioridad}
        </span>
        <strong>{etiquetaTipoIncidente(p.tipo)}</strong>
        <span className="texto-ayuda">{textoAntiguedad(p.creadoEn)}</span>
      </div>
      {p.descripcion && <p>{p.descripcion}</p>}

      {porAtender ? (
        <>
          <p>
            {sugerencia?.brigadaId
              ? `Sugerida: ${nombreBrigada(sugerencia.brigadaId)} · ${textoDistancia(sugerencia.distanciaKm)}`
              : 'Sin brigadas disponibles'}
          </p>
          <div className="fila-botones">
            {sugerencia?.brigadaId && (
              <button
                type="button"
                className="boton-principal"
                disabled={bloqueado}
                onClick={() => asignar(sugerencia.brigadaId)}
              >
                Asignar {nombreBrigada(sugerencia.brigadaId)}
              </button>
            )}
            {opciones.length > 0 && (
              <button
                type="button"
                className="boton-secundario"
                disabled={bloqueado}
                aria-expanded={eligiendo}
                onClick={() => setEligiendo((valor) => !valor)}
              >
                Cambiar
              </button>
            )}
          </div>
          {eligiendo && (
            <ul className="lista-opciones" aria-label="Brigadas disponibles">
              {opciones.map(({ brigada, distanciaKm }) => (
                <li key={brigada.properties.id}>
                  <button
                    type="button"
                    className="boton-secundario"
                    disabled={bloqueado}
                    onClick={() => asignar(brigada.properties.id)}
                  >
                    Asignar {brigada.properties.nombre} · {textoDistancia(distanciaKm)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p>
            {ESTADOS_INCIDENTE[p.estado]} · {p.brigadaNombre ?? 'Brigada'} ({etiquetaEstadoBrigada(p.brigadaEstado)})
          </p>
          <div className="fila-botones">
            <button
              type="button"
              className="boton-secundario"
              disabled={bloqueado}
              onClick={() => {
                if (window.confirm(`¿Liberar a ${p.brigadaNombre ?? 'la brigada'}? El incidente volverá a "Sin brigada".`)) {
                  alLiberar(p.brigadaId)
                }
              }}
            >
              Liberar brigada
            </button>
          </div>
        </>
      )}

      <div className="fila-botones tarjeta-secundaria">
        <label className="campo campo-en-linea">
          Prioridad
          <select
            value={p.prioridad}
            disabled={bloqueado}
            onChange={(evento) => alCambiarPrioridad(Number(evento.target.value))}
          >
            {Object.entries(PRIORIDADES).map(([valor, { etiqueta }]) => (
              <option key={valor} value={valor}>
                {valor} · {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="boton-texto-peligro"
          disabled={bloqueado}
          onClick={() => {
            if (window.confirm('¿Cancelar este incidente? Si tiene brigada, quedará disponible.')) alCancelar()
          }}
        >
          Cancelar incidente
        </button>
      </div>

      {error && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>{error}</p>
        </div>
      )}
    </li>
  )
}

export default TarjetaIncidente
