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

// Con menos acercamiento que esto, un toque cae a cientos de metros de la calle real.
// El primer toque acerca el mapa a ese punto; el segundo ya marca el bloqueo.
const ZOOM_MINIMO_REPORTE = 14

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
  // true cuando la persona tocó el mapa muy lejos y lo acercamos por ella
  const [pedirAcercar, setPedirAcercar] = useState(false)

  const fueraDeMexico = posicion !== null && !dentroDeCaja(posicion, BBOX_REPORTES_MEXICO)
  const enviando = envio.estado === 'enviando'
  const puedeEnviar = configurado && enLinea && posicion && tipo && !fueraDeMexico && !enviando

  function cambiarPosicion(nueva) {
    setPedirAcercar(false)
    setPosicion(nueva)
    // Si ya se había enviado, tocar el mapa empieza un reporte nuevo
    if (envio.estado !== 'editando') setEnvio({ estado: 'editando', error: null })
  }

  // Toque en el mapa. Si el mapa está muy lejos, primero se acerca a ese punto.
  // (Arrastrar el marcador no pasa por aquí: para entonces ya está cerca.)
  function alTocarMapa(nueva) {
    const zoom = mapa?.getZoom?.()
    if (typeof zoom === 'number' && zoom < ZOOM_MINIMO_REPORTE) {
      setPedirAcercar(true)
      mapa.flyTo({ center: nueva, zoom: ZOOM_MINIMO_REPORTE + 1 })
      return
    }
    cambiarPosicion(nueva)
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
    setPedirAcercar(false)
    setPosicion(null)
    setTipo(null)
    setDescripcion('')
    setEnvio({ estado: 'editando', error: null })
  }

  // Qué le falta al reporte, para decirlo junto al botón de enviar
  let falta = null
  if (!posicion) falta = 'Falta marcar el punto en el mapa.'
  else if (!tipo) falta = 'Falta elegir el tipo de bloqueo.'

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
        <p className="texto-ayuda">
          Ya aparece en el mapa para todos. Si el bloqueo sigue después de 24 h, puedes renovarlo desde su
          marcador en el mapa.
        </p>
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
    <main className="pantalla-formulario pantalla-reportar">
      {/* Todo va dentro del formulario para que el botón de la barra de abajo lo envíe */}
      <form className="reportar-formulario" onSubmit={enviar}>
        <header className="reportar-encabezado">
          <h1>Reportar bloqueo</h1>
          <p className="texto-ayuda">
            Cualquier persona puede reportar. Los reportes sin cuenta aparecen como &quot;anónimo&quot;.
          </p>
          {!configurado && (
            <div className="mensaje-estado mensaje-error" role="alert">
              <p>No se pueden enviar reportes: falta configurar Supabase.</p>
            </div>
          )}
        </header>

        <section aria-labelledby="titulo-lugar" className="reportar-lugar">
          <h2 id="titulo-lugar">1. ¿Dónde está?</h2>
          <div className="mapa-formulario">
            <MapaBase alCargar={setMapa} alFallar={() => setFalloMapa(true)} />
            <SelectorPunto mapa={mapa} posicion={posicion} alCambiar={cambiarPosicion} alTocar={alTocarMapa} />
            {/* El GPS es lo más rápido con prisa: va encima del mapa, no escondido abajo */}
            <button
              type="button"
              className="boton-sobre-mapa"
              onClick={usarMiUbicacion}
              disabled={ubicacion.estado === 'buscando'}
            >
              {ubicacion.estado === 'buscando' ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
            </button>
          </div>

          {/* Estado del punto, justo debajo del mapa */}
          {posicion ? (
            <p className="punto-marcado">
              <span aria-hidden="true">✓</span> Punto marcado. Arrastra el marcador para ajustarlo.
            </p>
          ) : (
            <p className="texto-ayuda">Toca el mapa donde está el bloqueo, o usa tu ubicación.</p>
          )}
          {pedirAcercar && (
            <div className="mensaje-estado mensaje-info" role="status">
              <p>Acércate más para marcar la calle exacta. Toca de nuevo sobre el bloqueo.</p>
            </div>
          )}
          {falloMapa && (
            <div className="mensaje-estado mensaje-error" role="alert">
              <p>No se pudo cargar el mapa. Usa tu ubicación o revisa tu conexión.</p>
            </div>
          )}
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
        </section>

        <section aria-label="Detalles del bloqueo" className="reportar-detalles">
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
        </section>

        {/* Barra fija abajo: el botón siempre se ve y dice qué falta */}
        <div className="barra-enviar">
          {falta && <p className="barra-enviar-falta">{falta}</p>}
          <button type="submit" className="boton-principal" disabled={!puedeEnviar}>
            {textoBotonEnviar()}
          </button>
        </div>

        <p className="aviso-oficial reportar-aviso">{AVISO_OFICIAL}</p>
      </form>
    </main>
  )
}

export default ReportarBloqueo
