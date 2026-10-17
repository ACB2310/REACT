import { formatearFechaHora } from '../utils/fechas.js'

// Caminando con prisa, en promedio
const METROS_POR_MINUTO = 70

const SIGUE_A_PROTECCION_CIVIL = 'Sigue las indicaciones de Protección Civil.'

// Texto de cada estado que no es un error ni un "sin ruta"
const TEXTOS = {
  ubicando: 'Buscando tu ubicación…',
  descargando: 'Descargando calles y puntos de reunión de tu zona (puede tardar hasta 1 minuto)…',
  calculando: 'Calculando la ruta más segura…',
}

// Estados en los que no hay ruta: se dice explícitamente (CLAUDE.md)
const TEXTOS_SIN_RUTA = {
  'sin-zona-offline': `Sin conexión y sin calles guardadas de esta zona. Cuando tengas señal, toca "Ruta a punto de reunión" para guardarlas. ${SIGUE_A_PROTECCION_CIVIL}`,
  'sin-puntos': `No hay puntos de reunión ni refugios abiertos registrados cerca de ti. ${SIGUE_A_PROTECCION_CIVIL}`,
  'lejos-de-calles': `Estás lejos de las calles registradas; no se pudo calcular una ruta. ${SIGUE_A_PROTECCION_CIVIL}`,
}

const TEXTOS_MOTIVO = {
  'origen-en-zona-de-peligro': `Estás dentro de una zona de peligro (cerca del epicentro de un sismo fuerte o de un bloqueo total). Aléjate con cuidado y sigue las indicaciones de Protección Civil.`,
}
const TEXTO_SIN_RUTA = `No encontramos una ruta segura a un punto de reunión. ${SIGUE_A_PROTECCION_CIVIL}`

// "650 m" o "1.2 km"
function textoDistancia(metros) {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1)} km`
}

// "Punto de reunión Plaza Hidalgo: 1.0 km · unos 15 min a pie · riesgo bajo"
// El riesgo va con palabras (no solo con el color de la línea del mapa)
function textoRuta(resultado, sinDatosSismos) {
  const { puntoReunion, distanciaM, nivelRiesgo } = resultado
  const tipo = puntoReunion.tipo === 'refugio' ? 'Refugio' : 'Punto de reunión'
  // Si OSM no le puso nombre, el nombre ya es "Punto de reunión": no se repite
  const destino = puntoReunion.nombre === tipo ? tipo : `${tipo} ${puntoReunion.nombre}`
  const minutos = Math.ceil(distanciaM / METROS_POR_MINUTO)
  const riesgo = sinDatosSismos ? 'riesgo sísmico desconocido' : `riesgo ${nivelRiesgo}`
  return `${destino}: ${textoDistancia(distanciaM)} · unos ${minutos} min a pie · ${riesgo}`
}

// Una sola línea con la fuente y la hora de cada dato (para que el mapa no quede chico):
// "Fuentes: calles de © OpenStreetMap del … · tu ubicación del …[ · estado del refugio (lista oficial) del …]"
function textoFuentes(resultado, zona, ubicadoEn) {
  let texto = `Fuentes: calles de © OpenStreetMap del ${formatearFechaHora(zona?.descargadoEn)} · tu ubicación del ${formatearFechaHora(ubicadoEn)}`
  if (resultado.puntoReunion.tipo === 'refugio') {
    texto += ` · estado del refugio (lista oficial) del ${formatearFechaHora(resultado.puntoReunion.actualizadoEn)}`
  }
  return texto
}

function textoBloqueosSinConfirmar(cantidad) {
  return cantidad === 1
    ? 'Hay 1 bloqueo sin confirmar cerca que podría estar cerrando el paso.'
    : `Hay ${cantidad} bloqueos sin confirmar cerca que podrían estar cerrando el paso.`
}

// Panel para pedir la ruta a pie al punto de reunión o refugio más seguro.
// Recibe lo que entrega useRutaEvacuacion y solo muestra textos y botones.
// Con `mostrarBotones={false}` solo muestra los mensajes: lo usa PanelRuta (etapa 4)
// cuando la ruta sin conexión es el respaldo de la ruta en línea, y el botón es el suyo.
function PanelEvacuacion({
  estado,
  error,
  motivo,
  resultado,
  zona,
  ubicadoEn,
  precisionM,
  sinDatosSismos,
  sinDatosBloqueos,
  sinDatosZonas,
  bloqueosSinConfirmarCerca,
  buscarRuta,
  limpiar,
  mostrarBotones = true,
}) {
  const hayRuta = estado === 'listo' && resultado

  let mensaje = null
  if (TEXTOS[estado]) {
    mensaje = { tipo: 'info', texto: TEXTOS[estado] }
  } else if (estado === 'ubicacion-imprecisa') {
    mensaje = {
      tipo: 'aviso',
      texto: `Tu ubicación es aproximada (margen de ${Math.round(precisionM ?? 0)} m). Activa la ubicación precisa del teléfono o sal a un lugar abierto y vuelve a intentar. ${SIGUE_A_PROTECCION_CIVIL}`,
    }
  } else if (estado === 'error') {
    // Cualquier error (sin https, sin ubicación, OpenStreetMap caído, bloqueo con formato raro)
    // también termina recordando qué hacer
    const sinPunto = String(error ?? '').replace(/[.\s]+$/, '')
    mensaje = { tipo: 'error', texto: `No se pudo calcular la ruta: ${sinPunto}. ${SIGUE_A_PROTECCION_CIVIL}` }
  } else if (TEXTOS_SIN_RUTA[estado]) {
    mensaje = { tipo: 'error', texto: TEXTOS_SIN_RUTA[estado] }
  } else if (estado === 'sin-ruta') {
    mensaje = { tipo: 'error', texto: TEXTOS_MOTIVO[motivo] ?? TEXTO_SIN_RUTA }
  }

  return (
    <section className="panel-evacuacion" aria-label="Ruta de evacuación a pie">
      {mostrarBotones && (
        <div className="panel-evacuacion-botones">
          <button type="button" className="boton-evacuacion" onClick={buscarRuta}>
            Ruta a punto de reunión
          </button>
          {hayRuta && (
            <button type="button" className="boton-reintentar boton-secundario" onClick={limpiar}>
              Quitar ruta
            </button>
          )}
        </div>
      )}

      {mensaje && (
        <div className={`mensaje-estado mensaje-${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          <p>{mensaje.texto}</p>
          {estado === 'sin-ruta' && bloqueosSinConfirmarCerca > 0 && (
            <p>{textoBloqueosSinConfirmar(bloqueosSinConfirmarCerca)}</p>
          )}
        </div>
      )}

      {hayRuta && resultado.origenEnZona && (
        <div className="mensaje-estado mensaje-aviso" role="alert">
          <p>Estás dentro de una zona de peligro: sal de ella por la ruta indicada.</p>
        </div>
      )}

      {hayRuta && (
        <div className="mensaje-estado mensaje-info" role="status">
          <p>{textoRuta(resultado, sinDatosSismos)}</p>
          {sinDatosSismos && <p>No hay datos de sismos: el riesgo sísmico de la ruta es desconocido.</p>}
          {sinDatosBloqueos && <p>No se pudieron cargar los bloqueos reportados: la ruta no los toma en cuenta.</p>}
          {sinDatosZonas && <p>No se pudieron cargar las zonas de peligro: la ruta no las toma en cuenta.</p>}
          <p className="fuente">{textoFuentes(resultado, zona, ubicadoEn)}</p>
          <p className="fuente">
            Ruta calculada en tu teléfono; puede no reflejar daños recientes. Sigue las indicaciones oficiales.
          </p>
        </div>
      )}
    </section>
  )
}

export default PanelEvacuacion
