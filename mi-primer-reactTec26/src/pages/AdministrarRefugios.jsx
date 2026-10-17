import { useMemo, useState } from 'react'
import MapaBase from '../components/MapaBase.jsx'
import SelectorPunto from '../components/SelectorPunto.jsx'
import MensajeFuente from '../components/MensajeFuente.jsx'
import { useRefugios } from '../hooks/useRefugios.js'
import { useEnLinea } from '../hooks/useEnLinea.js'
import { actualizarRefugio } from '../services/refugios.js'
import { ESTADOS_REFUGIO } from '../utils/refugios.js'
import { BBOX_REPORTES_MEXICO, dentroDeCaja } from '../utils/geo.js'
import { formatearFechaHora } from '../utils/fechas.js'
import './Pantallas.css'

// Quita acentos y mayúsculas para buscar "Zapopan" escribiendo "zapopan"
function normalizar(texto) {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Formulario de un refugio: ubicarlo tocando el mapa y cambiar estado y ocupación
function EditorRefugio({ refugio, alGuardar }) {
  const enLinea = useEnLinea()
  const [mapa, setMapa] = useState(null)
  const [posicion, setPosicion] = useState(refugio.posicion)
  const [estado, setEstado] = useState(refugio.estado)
  const [ocupacion, setOcupacion] = useState(String(refugio.ocupacion ?? 0))
  // 'editando' | 'guardando' | 'guardado' | 'error'
  const [guardado, setGuardado] = useState({ estado: 'editando', error: null })

  const fueraDeMexico = posicion !== null && !dentroDeCaja(posicion, BBOX_REPORTES_MEXICO)
  const ocupacionValida = /^\d+$/.test(ocupacion)
  const guardando = guardado.estado === 'guardando'
  const puedeGuardar = enLinea && !fueraDeMexico && ocupacionValida && !guardando

  // Si el refugio ya tiene ubicación, el mapa empieza ahí
  function alCargarMapa(nuevoMapa) {
    setMapa(nuevoMapa)
    if (refugio.posicion) nuevoMapa.jumpTo?.({ center: refugio.posicion, zoom: 15 })
  }

  function cambiar(setter) {
    return (valor) => {
      setter(valor)
      setGuardado({ estado: 'editando', error: null })
    }
  }

  async function guardar(evento) {
    evento.preventDefault()
    if (!puedeGuardar) return
    setGuardado({ estado: 'guardando', error: null })
    try {
      await actualizarRefugio({ id: refugio.id, posicion, estado, ocupacion: Number(ocupacion) })
      setGuardado({ estado: 'guardado', error: null })
      alGuardar()
    } catch (error) {
      setGuardado({ estado: 'error', error: error.message })
    }
  }

  return (
    <form className="pantalla-formulario-seccion" onSubmit={guardar} aria-label={`Editar ${refugio.nombre}`}>
      <h2>{refugio.nombre}</h2>
      <p className="texto-ayuda">
        {[refugio.direccion, refugio.municipio, refugio.entidad].filter(Boolean).join(', ') || 'Sin dirección'}
      </p>
      <p className="texto-ayuda">Toca el mapa donde está el refugio. Puedes arrastrar el marcador.</p>
      <div className="mapa-formulario">
        <MapaBase alCargar={alCargarMapa} alFallar={() => {}} />
        <SelectorPunto mapa={mapa} posicion={posicion} alCambiar={cambiar(setPosicion)} />
      </div>
      {fueraDeMexico && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>El punto está fuera de México. Revisa la ubicación.</p>
        </div>
      )}

      <label className="campo">
        Estado
        <select value={estado} onChange={(evento) => cambiar(setEstado)(evento.target.value)}>
          {Object.entries(ESTADOS_REFUGIO).map(([valor, { etiqueta }]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        Personas en el refugio{refugio.capacidad !== null ? ` (capacidad: ${refugio.capacidad})` : ''}
        <input
          type="number"
          inputMode="numeric"
          min="0"
          value={ocupacion}
          onChange={(evento) => cambiar(setOcupacion)(evento.target.value)}
        />
      </label>

      {guardado.estado === 'error' && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>{guardado.error}</p>
        </div>
      )}
      {guardado.estado === 'guardado' && (
        <div className="mensaje-estado mensaje-info" role="status">
          <p>Refugio guardado</p>
        </div>
      )}

      <button type="submit" className="boton-principal" disabled={!puedeGuardar}>
        {!enLinea ? 'Sin conexión: no se puede guardar' : guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

// Pantalla del coordinador: lista de la lista oficial de refugios para ubicarlos
// en el mapa y mantener su estado y ocupación al día.
function AdministrarRefugios() {
  const refugios = useRefugios()
  const [busqueda, setBusqueda] = useState('')
  const [soloSinUbicacion, setSoloSinUbicacion] = useState(true)
  const [idElegido, setIdElegido] = useState(null)

  const lista = useMemo(() => refugios.lista ?? [], [refugios.lista])
  const sinUbicacion = lista.filter((refugio) => !refugio.posicion).length
  const visibles = useMemo(() => {
    const texto = normalizar(busqueda.trim())
    return lista.filter(
      (refugio) =>
        (!soloSinUbicacion || !refugio.posicion) &&
        (!texto || normalizar(`${refugio.nombre} ${refugio.municipio}`).includes(texto)),
    )
  }, [lista, busqueda, soloSinUbicacion])
  const elegido = lista.find((refugio) => refugio.id === idElegido) ?? null

  return (
    <main className="pantalla-formulario">
      <h1>Refugios</h1>
      <p className="texto-ayuda">
        {sinUbicacion === 1 ? '1 refugio sin ubicación' : `${sinUbicacion} refugios sin ubicación`} de{' '}
        {lista.length}
      </p>

      <MensajeFuente
        etiqueta="los refugios"
        plural
        estado={refugios.estado}
        error={refugios.error}
        hayDatos={Boolean(refugios.lista)}
        hora={formatearFechaHora(refugios.actualizadoEn ?? refugios.consultadoEn)}
        recargar={refugios.recargar}
      />

      {elegido ? (
        <>
          <button type="button" className="boton-secundario" onClick={() => setIdElegido(null)}>
            Volver a la lista
          </button>
          {/* key: al cambiar de refugio el formulario empieza de cero */}
          <EditorRefugio key={elegido.id} refugio={elegido} alGuardar={() => refugios.recargar({ silencioso: true })} />
        </>
      ) : (
        <>
          <label className="campo">
            Buscar por nombre o municipio
            <input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
          </label>
          <label className="casilla">
            <input
              type="checkbox"
              checked={soloSinUbicacion}
              onChange={(evento) => setSoloSinUbicacion(evento.target.checked)}
            />
            Solo sin ubicación
          </label>

          {refugios.lista && visibles.length === 0 && <p>No hay refugios que coincidan.</p>}
          <ul className="lista-refugios" aria-label="Lista de refugios">
            {visibles.map((refugio) => (
              <li key={refugio.id}>
                <button type="button" onClick={() => setIdElegido(refugio.id)}>
                  <strong>{refugio.nombre}</strong>
                  <span>{[refugio.municipio, ESTADOS_REFUGIO[refugio.estado]?.etiqueta].filter(Boolean).join(' · ')}</span>
                  {!refugio.posicion && <span className="etiqueta-sin-ubicacion">Sin ubicación</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

export default AdministrarRefugios
