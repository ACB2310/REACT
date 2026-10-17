import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import MapaBase from '../components/MapaBase.jsx'
import SelectorPunto from '../components/SelectorPunto.jsx'
import MensajeFuente from '../components/MensajeFuente.jsx'
import CapaIncidentes from '../components/CapaIncidentes.jsx'
import CapaBasesBrigadas from '../components/CapaBasesBrigadas.jsx'
import FormularioIncidente from '../components/FormularioIncidente.jsx'
import TarjetaIncidente from '../components/TarjetaIncidente.jsx'
import { useIncidentes, useBrigadas } from '../hooks/useBrigadas.js'
import { useEnLinea } from '../hooks/useEnLinea.js'
import { crearIncidente, actualizarIncidente, cancelarIncidente } from '../services/incidentes.js'
import { asignarBrigada, liberarBrigada } from '../services/brigadas.js'
import { sugerirAsignaciones, brigadasDisponiblesPorDistancia, incidentesCercanos } from '../utils/asignacion.js'
import { BBOX_REPORTES_MEXICO, dentroDeCaja } from '../utils/geo.js'
import { formatearFechaHora } from '../utils/fechas.js'
import './Pantallas.css'

// Errores que significan "alguien más cambió esto": se recarga para ver lo actual
const ERRORES_DE_CARRERA = ['La brigada ya tiene', 'Ese incidente ya tiene', 'El incidente ya no existe']

// Si se llega desde el popup de un bloqueo: /brigadas?bloqueo=10&lng=-103.3&lat=20.6
function leerBloqueoInicial(parametros) {
  const bloqueoId = Number(parametros.get('bloqueo'))
  const posicion = [Number(parametros.get('lng')), Number(parametros.get('lat'))]
  if (!bloqueoId || !dentroDeCaja(posicion, BBOX_REPORTES_MEXICO)) return null
  return { bloqueoId, posicion }
}

// Panel del coordinador: crear incidentes y asignar brigadas por prioridad.
// La app sugiere la brigada disponible más cercana; el coordinador confirma con un toque.
function PanelBrigadas() {
  const [parametros] = useSearchParams()
  const enLinea = useEnLinea()
  const incidentes = useIncidentes(true)
  const brigadas = useBrigadas(true)
  const [mapa, setMapa] = useState(null)

  const [desdeBloqueo] = useState(() => leerBloqueoInicial(parametros))
  // Nuevo incidente: null = mostrando las listas
  const [nuevo, setNuevo] = useState(() =>
    desdeBloqueo ? { posicion: desdeBloqueo.posicion, tipo: 'bloqueo', bloqueoId: desdeBloqueo.bloqueoId } : null,
  )
  const [aviso, setAviso] = useState(null)
  // Acción en curso por tarjeta: { [incidenteId]: { ocupado, error } }
  const [acciones, setAcciones] = useState({})

  const listaIncidentes = useMemo(() => incidentes.incidentes?.features ?? [], [incidentes.incidentes])
  const listaBrigadas = useMemo(() => brigadas.brigadas?.features ?? [], [brigadas.brigadas])
  const nombres = useMemo(
    () => new Map(listaBrigadas.map((b) => [b.properties.id, b.properties.nombre])),
    [listaBrigadas],
  )
  const sugerencias = useMemo(
    () => new Map(sugerirAsignaciones(listaIncidentes, listaBrigadas).map((s) => [s.incidenteId, s])),
    [listaIncidentes, listaBrigadas],
  )
  const porAtender = listaIncidentes.filter((i) => i.properties.estado === 'pendiente')
  const enCurso = listaIncidentes.filter((i) => i.properties.estado !== 'pendiente')
  const disponibles = listaBrigadas.filter((b) => b.properties.estado === 'disponible').length

  const cercanos = nuevo?.posicion ? incidentesCercanos(nuevo.posicion, nuevo.tipo, listaIncidentes) : []

  function recargarTodo() {
    incidentes.recargar({ silencioso: true })
    brigadas.recargar({ silencioso: true })
  }

  // Ejecuta una acción de una tarjeta, guarda su error y recarga
  async function ejecutar(incidenteId, accion) {
    setAcciones((previas) => ({ ...previas, [incidenteId]: { ocupado: true, error: null } }))
    setAviso(null)
    try {
      await accion()
      setAcciones((previas) => ({ ...previas, [incidenteId]: { ocupado: false, error: null } }))
      recargarTodo()
    } catch (error) {
      setAcciones((previas) => ({ ...previas, [incidenteId]: { ocupado: false, error: error.message } }))
      if (ERRORES_DE_CARRERA.some((inicio) => error.message.startsWith(inicio))) recargarTodo()
    }
  }

  async function guardarIncidente({ tipo, prioridad, descripcion }) {
    await crearIncidente({ posicion: nuevo.posicion, tipo, prioridad, descripcion, bloqueoId: nuevo.bloqueoId ?? null })
    setNuevo(null)
    setAviso('Incidente creado.')
    recargarTodo()
  }

  const fueraDeMexico = nuevo?.posicion && !dentroDeCaja(nuevo.posicion, BBOX_REPORTES_MEXICO)

  return (
    <main className="pantalla-formulario">
      <div className="encabezado-pantalla">
        <h1>Brigadas</h1>
        <div className="fila-botones">
          <Link to="/brigadas/equipos" className="enlace-secundario">
            Brigadas y miembros
          </Link>
          <Link to="/zonas" className="enlace-secundario">
            Zonas de peligro
          </Link>
        </div>
      </div>
      <p className="texto-ayuda">
        {porAtender.length} por atender · {enCurso.length} en curso · {disponibles}{' '}
        {disponibles === 1 ? 'brigada disponible' : 'brigadas disponibles'}
      </p>

      {!enLinea && (
        <div className="mensaje-estado mensaje-aviso" role="status">
          <p>Sin conexión. Se muestran los últimos datos; no se pueden hacer cambios.</p>
        </div>
      )}
      <MensajeFuente
        etiqueta="los incidentes"
        plural
        estado={incidentes.estado}
        error={incidentes.error}
        hayDatos={Boolean(incidentes.incidentes)}
        hora={formatearFechaHora(incidentes.actualizadoEn ?? incidentes.consultadoEn)}
        recargar={incidentes.recargar}
      />
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

      <div className="mapa-formulario">
        <MapaBase alCargar={setMapa} alFallar={() => {}} />
        <CapaBasesBrigadas mapa={mapa} brigadas={brigadas.brigadas} />
        <CapaIncidentes mapa={mapa} incidentes={incidentes.incidentes} />
        {nuevo && (
          <SelectorPunto
            mapa={mapa}
            posicion={nuevo.posicion}
            alCambiar={(posicion) => setNuevo((previo) => ({ ...previo, posicion }))}
          />
        )}
      </div>

      {nuevo ? (
        <section aria-labelledby="titulo-nuevo">
          <h2 id="titulo-nuevo">Nuevo incidente</h2>
          {nuevo.bloqueoId && <p className="texto-ayuda">Desde el bloqueo reportado #{nuevo.bloqueoId}.</p>}
          {fueraDeMexico && (
            <div className="mensaje-estado mensaje-aviso" role="alert">
              <p>El punto está fuera de México. Revisa la ubicación.</p>
            </div>
          )}
          <FormularioIncidente
            posicion={nuevo.posicion}
            tipoInicial={nuevo.tipo}
            cercanos={cercanos}
            deshabilitado={!enLinea || fueraDeMexico}
            alCambiarTipo={(tipo) => setNuevo((previo) => ({ ...previo, tipo }))}
            alGuardar={guardarIncidente}
            alCancelar={() => setNuevo(null)}
          />
        </section>
      ) : (
        <>
          <button
            type="button"
            className="boton-principal"
            onClick={() => {
              setAviso(null)
              setNuevo({ posicion: null, tipo: 'rescate', bloqueoId: null })
            }}
          >
            Nuevo incidente
          </button>

          <section aria-labelledby="titulo-por-atender">
            <h2 id="titulo-por-atender">Por atender ({porAtender.length})</h2>
            {incidentes.incidentes && porAtender.length === 0 && <p>No hay incidentes sin brigada.</p>}
            <ul className="lista-tarjetas">
              {porAtender.map((incidente) => {
                const id = incidente.properties.id
                return (
                  <TarjetaIncidente
                    key={id}
                    incidente={incidente}
                    sugerencia={sugerencias.get(id)}
                    opciones={brigadasDisponiblesPorDistancia(incidente.geometry.coordinates, listaBrigadas)}
                    nombreBrigada={(brigadaId) => nombres.get(brigadaId) ?? 'Brigada'}
                    ocupado={acciones[id]?.ocupado}
                    error={acciones[id]?.error}
                    deshabilitado={!enLinea}
                    alAsignar={(brigadaId) => ejecutar(id, () => asignarBrigada({ incidenteId: id, brigadaId }))}
                    alCancelar={() => ejecutar(id, () => cancelarIncidente(id))}
                    alCambiarPrioridad={(prioridad) =>
                      ejecutar(id, () =>
                        actualizarIncidente({ id, prioridad, descripcion: incidente.properties.descripcion }),
                      )
                    }
                  />
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="titulo-en-curso">
            <h2 id="titulo-en-curso">En curso ({enCurso.length})</h2>
            {incidentes.incidentes && enCurso.length === 0 && <p>Ninguna brigada está atendiendo incidentes.</p>}
            <ul className="lista-tarjetas">
              {enCurso.map((incidente) => {
                const id = incidente.properties.id
                return (
                  <TarjetaIncidente
                    key={id}
                    incidente={incidente}
                    nombreBrigada={(brigadaId) => nombres.get(brigadaId) ?? 'Brigada'}
                    ocupado={acciones[id]?.ocupado}
                    error={acciones[id]?.error}
                    deshabilitado={!enLinea}
                    alLiberar={(brigadaId) => ejecutar(id, () => liberarBrigada(brigadaId))}
                    alCancelar={() => ejecutar(id, () => cancelarIncidente(id))}
                    alCambiarPrioridad={(prioridad) =>
                      ejecutar(id, () =>
                        actualizarIncidente({ id, prioridad, descripcion: incidente.properties.descripcion }),
                      )
                    }
                  />
                )
              })}
            </ul>
          </section>
        </>
      )}
    </main>
  )
}

export default PanelBrigadas
