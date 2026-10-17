import { useMemo, useState } from 'react'
import MapaBase from '../components/MapaBase.jsx'
import MensajeFuente from '../components/MensajeFuente.jsx'
import CapaIncidentes from '../components/CapaIncidentes.jsx'
import CapaBasesBrigadas from '../components/CapaBasesBrigadas.jsx'
import { useMiAsignacion } from '../hooks/useBrigadas.js'
import { useEnLinea } from '../hooks/useEnLinea.js'
import { avanzarAsignacion } from '../services/brigadas.js'
import {
  SIGUIENTE_PASO,
  enlaceAbrirEnMapas,
  etiquetaEstadoBrigada,
  etiquetaPrioridad,
  etiquetaTipoIncidente,
  textoAntiguedad,
} from '../utils/incidentes.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { AVISO_OFICIAL } from '../utils/avisos.js'
import './Pantallas.css'

function coleccion(features) {
  return { type: 'FeatureCollection', features }
}

// Mapa con la base y, si hay, el incidente; se acomoda para que se vean los dos
function MapaAsignacion({ brigada, incidente }) {
  const [mapa, setMapa] = useState(null)
  const base = useMemo(
    () =>
      coleccion([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: brigada.base },
          properties: { id: brigada.id, nombre: brigada.nombre, estado: brigada.estado, miembros: null },
        },
      ]),
    [brigada],
  )
  const incidentes = useMemo(
    () =>
      coleccion(
        incidente
          ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: incidente.posicion }, properties: incidente }]
          : [],
      ),
    [incidente],
  )

  function alCargar(nuevoMapa) {
    setMapa(nuevoMapa)
    if (incidente) {
      const [a, b] = [brigada.base, incidente.posicion]
      nuevoMapa.fitBounds?.(
        [
          [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
          [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
        ],
        { padding: 60, maxZoom: 16, duration: 0 },
      )
    } else {
      nuevoMapa.jumpTo?.({ center: brigada.base, zoom: 14 })
    }
  }

  return (
    <div className="mapa-formulario">
      <MapaBase alCargar={alCargar} alFallar={() => {}} />
      <CapaBasesBrigadas mapa={mapa} brigadas={base} />
      <CapaIncidentes mapa={mapa} incidentes={incidentes} />
    </div>
  )
}

// Pantalla del brigadista: ve el incidente de su brigada y avisa su avance con un
// solo botón grande: Voy en camino → Llegué al lugar → Terminé.
function MiBrigada() {
  const enLinea = useEnLinea()
  const miAsignacion = useMiAsignacion(true)
  const [avance, setAvance] = useState({ ocupado: false, error: null })

  const { asignacion } = miAsignacion
  const brigada = asignacion?.brigada ?? null
  const incidente = asignacion?.incidente ?? null
  const paso = brigada ? SIGUIENTE_PASO[brigada.estado] : null

  async function avanzar() {
    if (!paso || !enLinea) return
    if (paso.estado === 'terminado' && !window.confirm('¿Terminaron de atender el incidente? La brigada quedará disponible.')) {
      return
    }
    setAvance({ ocupado: true, error: null })
    try {
      await avanzarAsignacion(paso.estado)
      setAvance({ ocupado: false, error: null })
    } catch (error) {
      setAvance({ ocupado: false, error: error.message })
    }
    // Pase lo que pase, se vuelve a pedir el estado real al servidor
    miAsignacion.recargar({ silencioso: true })
  }

  const cargandoPrimeraVez = miAsignacion.estado === 'cargando' && asignacion === null

  return (
    <main className="pantalla-formulario">
      <h1>Mi brigada</h1>

      {!enLinea && (
        <div className="mensaje-estado mensaje-aviso" role="status">
          <p>Sin conexión. Se muestra lo último que se descargó; no se puede avisar el avance.</p>
        </div>
      )}
      <MensajeFuente
        etiqueta="tu asignación"
        plural={false}
        estado={miAsignacion.estado}
        error={miAsignacion.error}
        hayDatos={miAsignacion.consultadoEn !== null}
        hora={formatearFechaHora(miAsignacion.consultadoEn)}
        recargar={miAsignacion.recargar}
      />

      {!cargandoPrimeraVez && miAsignacion.estado !== 'error' && !brigada && (
        <div className="mensaje-estado mensaje-aviso" role="status">
          <p>Tu cuenta no pertenece a ninguna brigada. Pide al coordinador que te agregue.</p>
        </div>
      )}

      {brigada && (
        <>
          <p>
            <strong>{brigada.nombre}</strong> · {etiquetaEstadoBrigada(brigada.estado)}
          </p>

          {incidente ? (
            <section aria-labelledby="titulo-incidente" className="pantalla-formulario-seccion">
              <h2 id="titulo-incidente">
                {etiquetaTipoIncidente(incidente.tipo)} · Prioridad {etiquetaPrioridad(incidente.prioridad)}
              </h2>
              {incidente.descripcion && <p>{incidente.descripcion}</p>}
              <p className="texto-ayuda">Asignado {textoAntiguedad(incidente.asignadoEn)}</p>
              <MapaAsignacion brigada={brigada} incidente={incidente} />
              <a
                className="boton-secundario"
                href={enlaceAbrirEnMapas(incidente.posicion)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir en mapas
              </a>
              {avance.error && (
                <div className="mensaje-estado mensaje-error" role="alert">
                  <p>{avance.error}</p>
                </div>
              )}
              {paso && (
                <button
                  type="button"
                  className="boton-principal boton-paso"
                  disabled={!enLinea || avance.ocupado}
                  onClick={avanzar}
                >
                  {!enLinea ? 'Sin conexión' : avance.ocupado ? 'Enviando…' : paso.texto}
                </button>
              )}
            </section>
          ) : (
            <>
              <div className="mensaje-estado mensaje-info" role="status">
                <p>Sin incidente asignado. Mantente disponible en la base.</p>
              </div>
              <MapaAsignacion brigada={brigada} incidente={null} />
            </>
          )}
        </>
      )}

      <p className="aviso-oficial">{AVISO_OFICIAL}</p>
    </main>
  )
}

export default MiBrigada
