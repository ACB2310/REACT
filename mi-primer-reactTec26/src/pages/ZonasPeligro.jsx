import { useState } from 'react'
import MapaBase from '../components/MapaBase.jsx'
import MensajeFuente from '../components/MensajeFuente.jsx'
import CapaZonasPeligro from '../components/CapaZonasPeligro.jsx'
import DibujarPoligono from '../components/DibujarPoligono.jsx'
import { useZonasPeligro } from '../hooks/useZonasPeligro.js'
import { useEnLinea } from '../hooks/useEnLinea.js'
import { crearZona, desactivarZona } from '../services/zonas.js'
import {
  AREA_MAXIMA_ZONA_KM2,
  ETIQUETAS_SEVERIDAD,
  LIMITE_DESCRIPCION_ZONA,
  TEXTOS_SEVERIDAD,
  VIGENCIAS,
  areaDePuntos,
  cerrarAnillo,
  textoArea,
} from '../utils/zonas.js'
import { formatearFechaHora } from '../utils/fechas.js'
import './Pantallas.css'

// Pantalla del coordinador: dibujar zonas de peligro (inundación, fuga, derrumbe…).
// Las rutas a refugio las evitan (severidad "Evitar") y todos las ven en el mapa.
function ZonasPeligro() {
  const enLinea = useEnLinea()
  const zonas = useZonasPeligro()
  const [mapa, setMapa] = useState(null)
  const [puntos, setPuntos] = useState([])
  const [severidad, setSeveridad] = useState(1)
  const [descripcion, setDescripcion] = useState('')
  const [vigencia, setVigencia] = useState('24')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)

  const area = areaDePuntos(puntos)
  const muyGrande = area > AREA_MAXIMA_ZONA_KM2
  const puedeGuardar = enLinea && puntos.length >= 3 && !muyGrande && !guardando
  const lista = zonas.zonas?.features ?? []

  function cambiarPuntos(nuevos) {
    setPuntos(nuevos)
    setAviso(null)
    setError(null)
  }

  async function guardar(evento) {
    evento.preventDefault()
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)
    try {
      const horas = vigencia === 'sin' ? null : Number(vigencia)
      await crearZona({
        anillo: cerrarAnillo(puntos),
        severidad,
        descripcion: descripcion.trim() || null,
        expiraEn: horas === null ? null : Date.now() + horas * 3600000,
      })
      setPuntos([])
      setDescripcion('')
      setAviso('Zona guardada. Las rutas a refugio ya la toman en cuenta.')
      zonas.recargar({ silencioso: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function desactivar(zona) {
    if (!window.confirm('¿Desactivar esta zona? Dejará de mostrarse y las rutas podrán pasar por ahí.')) return
    setError(null)
    try {
      await desactivarZona(zona.properties.id)
      setAviso('Zona desactivada.')
      zonas.recargar({ silencioso: true })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <main className="pantalla-formulario">
      <h1>Zonas de peligro</h1>
      <p className="texto-ayuda">
        Toca el mapa para marcar las esquinas de la zona, en orden. Con 3 puntos o más ya es una zona.
      </p>

      {!enLinea && (
        <div className="mensaje-estado mensaje-aviso" role="status">
          <p>Sin conexión. No se pueden guardar zonas.</p>
        </div>
      )}
      <MensajeFuente
        etiqueta="las zonas"
        plural
        estado={zonas.estado}
        error={zonas.error}
        hayDatos={Boolean(zonas.zonas)}
        hora={formatearFechaHora(zonas.actualizadoEn ?? zonas.consultadoEn)}
        recargar={zonas.recargar}
      />

      <div className="mapa-formulario">
        <MapaBase alCargar={setMapa} alFallar={() => {}} />
        <CapaZonasPeligro mapa={mapa} zonas={zonas.zonas} />
        <DibujarPoligono mapa={mapa} puntos={puntos} alCambiar={cambiarPuntos} />
      </div>

      <p className="texto-ayuda" role="status">
        {puntos.length === 0
          ? 'Sin puntos todavía.'
          : `${puntos.length} ${puntos.length === 1 ? 'punto' : 'puntos'}${puntos.length >= 3 ? ` · ${textoArea(area)}` : ''}`}
      </p>
      {muyGrande && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>
            La zona mide {textoArea(area)}; el máximo es {AREA_MAXIMA_ZONA_KM2} km². Divídela en varias.
          </p>
        </div>
      )}
      <div className="fila-botones">
        <button
          type="button"
          className="boton-secundario"
          disabled={puntos.length === 0}
          onClick={() => cambiarPuntos(puntos.slice(0, -1))}
        >
          Deshacer punto
        </button>
        <button type="button" className="boton-secundario" disabled={puntos.length === 0} onClick={() => cambiarPuntos([])}>
          Borrar
        </button>
      </div>

      <form className="pantalla-formulario-seccion" onSubmit={guardar} aria-label="Nueva zona de peligro">
        <fieldset className="opciones-tarjeta">
          <legend>¿Qué tan peligrosa es?</legend>
          {[1, 2].map((valor) => (
            <label key={valor} className="opcion-tarjeta">
              <input
                type="radio"
                name="severidad"
                value={valor}
                checked={severidad === valor}
                onChange={() => setSeveridad(valor)}
              />
              <span className="opcion-tarjeta-titulo">{ETIQUETAS_SEVERIDAD[valor]}</span>
              <span className="opcion-tarjeta-detalle">{TEXTOS_SEVERIDAD[valor]}</span>
            </label>
          ))}
        </fieldset>

        <label className="campo">
          Descripción (opcional)
          <textarea
            value={descripcion}
            maxLength={LIMITE_DESCRIPCION_ZONA}
            placeholder="Por ejemplo: fuga de gas, calle inundada, edificio en riesgo de colapso"
            onChange={(evento) => setDescripcion(evento.target.value)}
          />
        </label>

        <label className="campo">
          Vigencia
          <select value={vigencia} onChange={(evento) => setVigencia(evento.target.value)}>
            {VIGENCIAS.map(({ horas, etiqueta }) => (
              <option key={etiqueta} value={horas === null ? 'sin' : String(horas)}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>

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

        <button type="submit" className="boton-principal" disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : 'Guardar zona'}
        </button>
      </form>

      <section aria-labelledby="titulo-zonas-activas">
        <h2 id="titulo-zonas-activas">Zonas activas ({lista.length})</h2>
        {zonas.zonas && lista.length === 0 && <p>No hay zonas de peligro marcadas.</p>}
        <ul className="lista-tarjetas">
          {lista.map((zona) => {
            const p = zona.properties
            return (
              <li key={p.id} className="tarjeta">
                <strong>{TEXTOS_SEVERIDAD[p.severidad]}</strong>
                {p.descripcion && <p>{p.descripcion}</p>}
                <p className="texto-ayuda">
                  Marcada {formatearFechaHora(p.creadoEn)}
                  {p.expiraEn ? ` · vigente hasta ${formatearFechaHora(p.expiraEn)}` : ' · sin vencimiento'}
                </p>
                <div className="fila-botones">
                  <button type="button" className="boton-secundario" disabled={!enLinea} onClick={() => desactivar(zona)}>
                    Desactivar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}

export default ZonasPeligro
