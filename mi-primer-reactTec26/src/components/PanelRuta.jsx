import PanelEvacuacion from './PanelEvacuacion.jsx'
import { formatearFechaHora } from '../utils/fechas.js'
import {
  MODOS,
  TEXTOS_SIN_RUTA_ORS,
  TEXTO_SIN_RUTA_ORS,
  enlaceRutaEnMapas,
  textoDuracion,
  textoEvitados,
  textoMetros,
} from '../utils/rutas.js'

const TEXTOS_ESPERA = {
  ubicando: 'Buscando tu ubicación…',
  calculando: 'Calculando la ruta más rápida a un refugio…',
}

// Un solo botón "Ruta a refugio" (etapa 4). Con conexión muestra la ruta en línea
// (OpenRouteService); si se usó el respaldo sin conexión, muestra el PanelEvacuacion
// de la ruta a pie calculada en el teléfono.
//
// props:
// - ruta: lo que devuelve useRutaRefugio
// - evacuacion: lo que devuelve useRutaEvacuacion (para el respaldo)
// - modo / alCambiarModo: 'a_pie' | 'carro'
// - sinDatosBloqueos: para el aviso del respaldo
function PanelRuta({ ruta, evacuacion, modo, alCambiarModo, sinDatosBloqueos }) {
  const { estado, resultado, origen, error, aviso } = ruta
  const trabajando = estado === 'ubicando' || estado === 'calculando'
  const hayAlgo = !['inactivo', 'ubicando', 'calculando'].includes(estado)

  let mensaje = null
  if (TEXTOS_ESPERA[estado]) {
    mensaje = { tipo: 'info', texto: TEXTOS_ESPERA[estado] }
  } else if (estado === 'error') {
    const sinPunto = String(error ?? '').replace(/[.\s]+$/, '')
    mensaje = { tipo: 'error', texto: `No se pudo calcular la ruta: ${sinPunto}. Sigue las indicaciones de Protección Civil.` }
  } else if (estado === 'sin-conexion-carro') {
    mensaje = {
      tipo: 'aviso',
      texto: 'Sin conexión: la ruta en carro necesita internet. Elige "A pie" para calcularla en tu teléfono.',
    }
  } else if (estado === 'sin-ruta') {
    mensaje = { tipo: 'error', texto: TEXTOS_SIN_RUTA_ORS[resultado?.motivo] ?? TEXTO_SIN_RUTA_ORS }
  }

  const listo = estado === 'listo' && resultado?.estado === 'ruta'
  // Etapa 5: en carro no se llega al refugio; se va en carro hasta `transbordo` y luego a pie
  const combinada = listo && resultado.modo === 'combinada'
  const evitados = listo ? textoEvitados(resultado.evitados) : null

  return (
    <section className="panel-evacuacion" aria-label="Ruta a refugio">
      <div className="selector-modo" role="group" aria-label="¿Cómo te vas a mover?">
        {Object.entries(MODOS).map(([valor, { etiqueta }]) => (
          <button
            key={valor}
            type="button"
            className="selector-modo-opcion"
            aria-pressed={modo === valor}
            disabled={trabajando}
            onClick={() => alCambiarModo(valor)}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="panel-evacuacion-botones">
        <button type="button" className="boton-evacuacion" onClick={ruta.buscar} disabled={trabajando}>
          Ruta a refugio
        </button>
        {hayAlgo && (
          <button type="button" className="boton-reintentar boton-secundario" onClick={ruta.limpiar}>
            Quitar ruta
          </button>
        )}
      </div>

      {mensaje && (
        <div className={`mensaje-estado mensaje-${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          <p>{mensaje.texto}</p>
        </div>
      )}

      {listo && resultado.origenEnZona && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>Estás dentro de una zona de peligro: sal de ella por la ruta indicada.</p>
        </div>
      )}

      {listo && (
        <div className="mensaje-estado mensaje-info" role="status">
          {combinada ? (
            <>
              <p>
                Refugio {resultado.destino.nombre}: {textoDuracion(resultado.resumen.duracionS)} en total ·{' '}
                {textoMetros(resultado.resumen.distanciaM)}
              </p>
              <p>El carro no puede llegar hasta el refugio: bájate en el punto amarillo y sigue a pie.</p>
              <p>
                En carro (línea morada): {textoDuracion(resultado.tramos.carro.duracionS)} ·{' '}
                {textoMetros(resultado.tramos.carro.distanciaM)}
              </p>
              <p>Bajar del vehículo: {textoDuracion(resultado.tramos.descensoS)}</p>
              <p>
                A pie (línea azul): {textoDuracion(resultado.tramos.aPie.duracionS)} ·{' '}
                {textoMetros(resultado.tramos.aPie.distanciaM)}
              </p>
            </>
          ) : (
            <p>
              Refugio {resultado.destino.nombre}: {textoDuracion(resultado.resumen.duracionS)} {MODOS[resultado.modo ?? modo].enTexto} ·{' '}
              {textoMetros(resultado.resumen.distanciaM)}
            </p>
          )}
          {evitados && <p>{evitados}</p>}
          {resultado.resumen.pasos.length > 0 && (
            <details className="pasos-ruta">
              <summary>Indicaciones ({resultado.resumen.pasos.length})</summary>
              <ol>
                {resultado.resumen.pasos.map((paso, i) => (
                  <li key={i}>
                    {paso.instruccion}
                    {paso.distanciaM > 0 && ` (${textoMetros(paso.distanciaM)})`}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {origen && combinada && (
            <>
              <a
                className="enlace-mapas"
                href={enlaceRutaEnMapas(origen, resultado.transbordo, 'carro')}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir tramo en carro
              </a>
              <a
                className="enlace-mapas"
                href={enlaceRutaEnMapas(resultado.transbordo, resultado.destino.posicion, 'a_pie')}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir tramo a pie
              </a>
            </>
          )}
          {origen && !combinada && (
            <a
              className="enlace-mapas"
              href={enlaceRutaEnMapas(origen, resultado.destino.posicion, resultado.modo ?? modo)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir en mapas
            </a>
          )}
          <p className="fuente">Ruta: OpenRouteService · {formatearFechaHora(resultado.consultadoEn)}</p>
          <p className="fuente">Puede no reflejar daños recientes. Sigue las indicaciones oficiales.</p>
        </div>
      )}

      {estado === 'respaldo' && (
        <>
          {aviso && (
            <div className="mensaje-estado mensaje-aviso" role="status">
              <p>{aviso}</p>
            </div>
          )}
          <PanelEvacuacion {...evacuacion} sinDatosBloqueos={sinDatosBloqueos} mostrarBotones={false} />
        </>
      )}
    </section>
  )
}

export default PanelRuta
