import { useState } from 'react'
import { Link } from 'react-router'
import MapaBase from '../components/MapaBase.jsx'
import SelectorPunto from '../components/SelectorPunto.jsx'
import { useSesion } from '../hooks/useSesion.js'
import { useUbicacion } from '../hooks/useUbicacion.js'
import { useEnLinea } from '../hooks/useEnLinea.js'
import { reportarBloqueo } from '../services/bloqueos.js'
import { TIPOS_BLOQUEO, LIMITE_DESCRIPCION } from '../utils/bloqueos.js'
import { BBOX_REPORTES_MEXICO, dentroDeCaja } from '../utils/geo.js'
import { AVISO_OFICIAL } from '../utils/avisos.js'
import './Pantallas.css'

// Pantalla para que CUALQUIER persona, con o sin cuenta, reporte un bloqueo:
// 1) toca el mapa (o usa su ubicación), 2) elige parcial o total,
// 3) escribe una descripción opcional y 4) envía.
function ReportarBloqueo() {
  const { asegurarSesion, configurado } = useSesion()
  const ubicacion = useUbicacion()
  const enLinea = useEnLinea()

  const [mapa, setMapa] = useState(null)
  const [falloMapa, setFalloMapa] = useState(false)
  const [posicion, setPosicion] = useState(null)
  const [tipo, setTipo] = useState(null)
  const [descripcion, setDescripcion] = useState('')
  // estado: 'editando' | 'enviando' | 'enviado' | 'error'
  const [envio, setEnvio] = useState({ estado: 'editando', error: null })

  const fueraDeMexico = posicion !== null && !dentroDeCaja(posicion, BBOX_REPORTES_MEXICO)
  const enviando = envio.estado === 'enviando'
  const puedeEnviar = configurado && enLinea && posicion && tipo && !fueraDeMexico && !enviando

  function cambiarPosicion(nueva) {
    setPosicion(nueva)
    // Si ya se había enviado, tocar el mapa empieza un reporte nuevo
    if (envio.estado !== 'editando') setEnvio({ estado: 'editando', error: null })
  }

  async function usarMiUbicacion() {
    const encontrada = await ubicacion.pedir()
    if (!encontrada) return
    cambiarPosicion(encontrada)
    mapa?.flyTo({ center: encontrada, zoom: 16 })
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (!puedeEnviar) return
    setEnvio({ estado: 'enviando', error: null })
    try {
      // Sin cuenta: aquí se crea la sesión anónima (solo al enviar, no al abrir la app)
      await asegurarSesion()
      await reportarBloqueo({ posicion, tipo, descripcion: descripcion.trim() || null })
      setEnvio({ estado: 'enviado', error: null })
    } catch (error) {
      // Se conserva todo lo que la persona escribió para que pueda reintentar
      setEnvio({ estado: 'error', error: error.message })
    }
  }

  function reportarOtro() {
    setPosicion(null)
    setTipo(null)
    setDescripcion('')
    setEnvio({ estado: 'editando', error: null })
  }

  function textoBotonEnviar() {
    if (!enLinea) return 'Sin conexión: no se puede enviar'
    if (enviando) return 'Enviando…'
    return 'Enviar reporte'
  }

  if (envio.estado === 'enviado') {
    return (
      <main className="pantalla-formulario">
        <h1>Reportar bloqueo</h1>
        <div className="mensaje-estado mensaje-info" role="status">
          <p>Reporte enviado. Vence en 24 h.</p>
        </div>
        <div className="fila-botones">
          <Link to="/" className="boton-principal">
            Ver en el mapa
          </Link>
          <button type="button" className="boton-secundario" onClick={reportarOtro}>
            Reportar otro
          </button>
        </div>
        <p className="aviso-oficial">{AVISO_OFICIAL}</p>
      </main>
    )
  }

  return (
    <main className="pantalla-formulario">
      <h1>Reportar bloqueo</h1>
      <p className="texto-ayuda">
        Cualquier persona puede reportar. Los reportes sin cuenta aparecen como &quot;anónimo&quot;.
      </p>

      {!configurado && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>No se pueden enviar reportes: falta configurar Supabase.</p>
        </div>
      )}

      <section aria-labelledby="titulo-lugar" className="pantalla-formulario-seccion">
        <h2 id="titulo-lugar">1. ¿Dónde está?</h2>
        <p className="texto-ayuda">
          {posicion ? 'Puedes arrastrar el marcador para ajustarlo.' : 'Toca el mapa donde está el bloqueo.'}
        </p>
      </section>
      <div className="mapa-formulario">
        <MapaBase alCargar={setMapa} alFallar={() => setFalloMapa(true)} />
        <SelectorPunto mapa={mapa} posicion={posicion} alCambiar={cambiarPosicion} />
      </div>
      {falloMapa && (
        <div className="mensaje-estado mensaje-error" role="alert">
          <p>No se pudo cargar el mapa. Usa tu ubicación o revisa tu conexión.</p>
        </div>
      )}
      <button
        type="button"
        className="boton-secundario"
        onClick={usarMiUbicacion}
        disabled={ubicacion.estado === 'buscando'}
      >
        {ubicacion.estado === 'buscando' ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
      </button>
      {ubicacion.error && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>{ubicacion.error}</p>
        </div>
      )}
      {fueraDeMexico && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>El punto está fuera de México. Revisa la ubicación.</p>
        </div>
      )}

      <form className="pantalla-formulario-seccion" onSubmit={enviar}>
        <fieldset className="opciones-tarjeta">
          <legend>2. ¿Qué tipo de bloqueo es?</legend>
          {Object.entries(TIPOS_BLOQUEO).map(([valor, { etiqueta, detalle, color }]) => (
            <label key={valor} className="opcion-tarjeta">
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
              />
              <span className="opcion-tarjeta-titulo">
                <span className="opcion-tarjeta-color" style={{ backgroundColor: color }} aria-hidden="true" />
                {etiqueta}
              </span>
              <span className="opcion-tarjeta-detalle">{detalle}</span>
            </label>
          ))}
        </fieldset>

        <label className="campo">
          3. Descripción (opcional)
          <textarea
            value={descripcion}
            maxLength={LIMITE_DESCRIPCION}
            placeholder="Por ejemplo: árbol caído, calle inundada, derrumbe"
            onChange={(evento) => setDescripcion(evento.target.value)}
          />
          <span className="contador">
            {descripcion.length} / {LIMITE_DESCRIPCION}
          </span>
        </label>

        {envio.estado === 'error' && (
          <div className="mensaje-estado mensaje-error" role="alert">
            <p>{envio.error}</p>
          </div>
        )}

        <button type="submit" className="boton-principal" disabled={!puedeEnviar}>
          {textoBotonEnviar()}
        </button>
        {!posicion && <p className="texto-ayuda">Falta marcar el punto en el mapa.</p>}
        {posicion && !tipo && <p className="texto-ayuda">Falta elegir el tipo de bloqueo.</p>}
      </form>

      <p className="aviso-oficial">{AVISO_OFICIAL}</p>
    </main>
  )
}

export default ReportarBloqueo
