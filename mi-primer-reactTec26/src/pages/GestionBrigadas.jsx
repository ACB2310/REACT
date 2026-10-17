import { useState } from 'react'
import { Link } from 'react-router'
import MensajeFuente from '../components/MensajeFuente.jsx'
import FormularioBrigada from '../components/FormularioBrigada.jsx'
import { useBrigadas } from '../hooks/useBrigadas.js'
import { useEnLinea } from '../hooks/useEnLinea.js'
import { useDatosPeriodicos } from '../hooks/useDatosPeriodicos.js'
import {
  asignarMiembro,
  cambiarServicioBrigada,
  guardarBrigada,
  obtenerBrigadistas,
} from '../services/brigadas.js'
import { etiquetaEstadoBrigada } from '../utils/incidentes.js'
import { formatearFechaHora } from '../utils/fechas.js'
import './Pantallas.css'

// Las cuentas de brigadista cambian poco: se revisan cada 5 minutos y tras cada cambio
const INTERVALO_BRIGADISTAS_MS = 300000
async function cargarBrigadistas() {
  return { datos: await obtenerBrigadistas(), actualizadoEn: null }
}

// Pantalla del coordinador: registrar brigadas (nombre, vehículo y base) y decidir
// qué cuentas de brigadista pertenecen a cada una.
function GestionBrigadas() {
  const enLinea = useEnLinea()
  const brigadas = useBrigadas(true)
  // null = lista; 'nueva' = formulario vacío; Feature = editar esa brigada
  const [editando, setEditando] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const cuentas = useDatosPeriodicos(cargarBrigadistas, INTERVALO_BRIGADISTAS_MS)
  const brigadistas = cuentas.datos

  const lista = brigadas.brigadas?.features ?? []

  // Ejecuta un cambio, muestra el resultado y recarga
  async function ejecutar(accion, textoListo) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      await accion()
      setAviso(textoListo)
      brigadas.recargar({ silencioso: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function guardar(datos) {
    const id = editando === 'nueva' ? null : editando.properties.id
    await guardarBrigada({ id, ...datos })
    setEditando(null)
    setAviso(id ? 'Brigada guardada.' : 'Brigada creada.')
    brigadas.recargar({ silencioso: true })
  }

  if (editando) {
    return (
      <main className="pantalla-formulario">
        <FormularioBrigada
          brigada={editando === 'nueva' ? null : editando}
          deshabilitado={!enLinea}
          alGuardar={guardar}
          alCancelar={() => setEditando(null)}
        />
      </main>
    )
  }

  const deshabilitado = !enLinea || ocupado
  return (
    <main className="pantalla-formulario">
      <div className="encabezado-pantalla">
        <h1>Brigadas y miembros</h1>
        <Link to="/brigadas" className="enlace-secundario">
          Volver al panel
        </Link>
      </div>

      {!enLinea && (
        <div className="mensaje-estado mensaje-aviso" role="status">
          <p>Sin conexión. No se pueden hacer cambios.</p>
        </div>
      )}
      <MensajeFuente
        etiqueta="las brigadas"
        plural
        estado={brigadas.estado}
        error={brigadas.error}
        hayDatos={Boolean(brigadas.brigadas)}
        hora={formatearFechaHora(brigadas.actualizadoEn ?? brigadas.consultadoEn)}
        recargar={brigadas.recargar}
      />
      {aviso && (
        <div className="mensaje-estado mensaje-info" role="status">
          <p>{aviso}</p>
        </div>
      )}
      {error && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <button type="button" className="boton-principal" disabled={!enLinea} onClick={() => setEditando('nueva')}>
        Nueva brigada
      </button>

      <section aria-labelledby="titulo-brigadas">
        <h2 id="titulo-brigadas">Brigadas ({lista.length})</h2>
        {brigadas.brigadas && lista.length === 0 && <p>Todavía no hay brigadas. Crea la primera.</p>}
        <ul className="lista-tarjetas">
          {lista.map((brigada) => {
            const p = brigada.properties
            const ocupada = p.incidenteId !== null && p.incidenteId !== undefined
            const enServicio = p.estado !== 'fuera_de_servicio'
            return (
              <li key={p.id} className="tarjeta">
                <div className="tarjeta-encabezado">
                  <strong>{p.nombre}</strong>
                  <span className="texto-ayuda">{etiquetaEstadoBrigada(p.estado)}</span>
                </div>
                <p>
                  {p.vehiculo ?? 'Sin vehículo registrado'} · {p.miembros === 1 ? '1 brigadista' : `${p.miembros} brigadistas`}
                </p>
                <div className="fila-botones">
                  <button type="button" className="boton-secundario" disabled={deshabilitado} onClick={() => setEditando(brigada)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="boton-secundario"
                    disabled={deshabilitado || ocupada}
                    onClick={() =>
                      ejecutar(
                        () => cambiarServicioBrigada({ id: p.id, enServicio: !enServicio }),
                        enServicio ? `${p.nombre} quedó fuera de servicio.` : `${p.nombre} está en servicio.`,
                      )
                    }
                  >
                    {enServicio ? 'Poner fuera de servicio' : 'Poner en servicio'}
                  </button>
                </div>
                {ocupada && <p className="texto-ayuda">Está atendiendo un incidente.</p>}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="titulo-miembros">
        <h2 id="titulo-miembros">Miembros</h2>
        <MensajeFuente
          etiqueta="las cuentas de brigadistas"
          plural
          estado={cuentas.estado}
          error={cuentas.error}
          hayDatos={Boolean(brigadistas)}
          hora={formatearFechaHora(cuentas.consultadoEn)}
          recargar={cuentas.recargar}
        />
        {brigadistas && brigadistas.length === 0 && (
          <p className="texto-ayuda">
            No hay cuentas con rol de brigadista. La persona crea su cuenta en Entrar y luego se le da el rol
            en Supabase (ver supabase/pruebas/LEEME.md).
          </p>
        )}
        <ul className="lista-tarjetas">
          {(brigadistas ?? []).map((persona) => (
            <li key={persona.id} className="tarjeta">
              <label className="campo">
                {persona.nombre ? `${persona.nombre} (${persona.correo})` : persona.correo}
                <select
                  value={persona.brigadaId ?? ''}
                  disabled={deshabilitado}
                  onChange={(evento) => {
                    const brigadaId = evento.target.value ? Number(evento.target.value) : null
                    ejecutar(async () => {
                      await asignarMiembro({ usuarioId: persona.id, brigadaId })
                      cuentas.recargar({ silencioso: true })
                    }, 'Miembros actualizados.')
                  }}
                >
                  <option value="">Sin brigada</option>
                  {lista.map((brigada) => (
                    <option key={brigada.properties.id} value={brigada.properties.id}>
                      {brigada.properties.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default GestionBrigadas
