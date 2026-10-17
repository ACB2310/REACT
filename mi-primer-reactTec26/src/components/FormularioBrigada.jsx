import { useState } from 'react'
import MapaBase from './MapaBase.jsx'
import SelectorPunto from './SelectorPunto.jsx'
import { BBOX_REPORTES_MEXICO, dentroDeCaja } from '../utils/geo.js'

// Crear o editar una brigada: nombre, vehículo y base (tocando el mapa).
// `brigada`: Feature a editar, o null para una nueva.
// `alGuardar({ nombre, vehiculo, base })` devuelve una promesa.
function FormularioBrigada({ brigada = null, deshabilitado, alGuardar, alCancelar }) {
  const [mapa, setMapa] = useState(null)
  const [nombre, setNombre] = useState(brigada?.properties.nombre ?? '')
  const [vehiculo, setVehiculo] = useState(brigada?.properties.vehiculo ?? '')
  const [base, setBase] = useState(brigada?.geometry.coordinates ?? null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const fueraDeMexico = base !== null && !dentroDeCaja(base, BBOX_REPORTES_MEXICO)
  const puedeGuardar = nombre.trim() && base && !fueraDeMexico && !deshabilitado && !guardando

  // Al editar, el mapa empieza en la base actual
  function alCargarMapa(nuevoMapa) {
    setMapa(nuevoMapa)
    if (brigada) nuevoMapa.jumpTo?.({ center: brigada.geometry.coordinates, zoom: 14 })
  }

  async function guardar(evento) {
    evento.preventDefault()
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)
    try {
      await alGuardar({ nombre: nombre.trim(), vehiculo: vehiculo.trim() || null, base })
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <form className="pantalla-formulario-seccion" onSubmit={guardar} aria-label={brigada ? 'Editar brigada' : 'Nueva brigada'}>
      <h2>{brigada ? `Editar ${brigada.properties.nombre}` : 'Nueva brigada'}</h2>
      <label className="campo">
        Nombre
        <input value={nombre} maxLength={80} required onChange={(evento) => setNombre(evento.target.value)} />
      </label>
      <label className="campo">
        Vehículo (opcional)
        <input
          value={vehiculo}
          maxLength={80}
          placeholder="Por ejemplo: Pickup 4x4, ambulancia"
          onChange={(evento) => setVehiculo(evento.target.value)}
        />
      </label>
      <p className="texto-ayuda">Toca el mapa donde está la base de la brigada.</p>
      <div className="mapa-formulario">
        <MapaBase alCargar={alCargarMapa} alFallar={() => {}} />
        <SelectorPunto mapa={mapa} posicion={base} alCambiar={setBase} />
      </div>
      {fueraDeMexico && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>El punto está fuera de México. Revisa la ubicación.</p>
        </div>
      )}
      {error && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="fila-botones">
        <button type="submit" className="boton-principal" disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : 'Guardar brigada'}
        </button>
        <button type="button" className="boton-secundario" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
      {!base && <p className="texto-ayuda">Falta marcar la base en el mapa.</p>}
    </form>
  )
}

export default FormularioBrigada
