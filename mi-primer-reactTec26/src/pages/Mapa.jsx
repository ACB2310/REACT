import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import MapaBase from '../components/MapaBase.jsx'
import CapaSismos from '../components/CapaSismos.jsx'
import CapaCiclones from '../components/CapaCiclones.jsx'
import CapaSatelite from '../components/CapaSatelite.jsx'
import LeyendaMagnitud from '../components/LeyendaMagnitud.jsx'
import LeyendaCiclones from '../components/LeyendaCiclones.jsx'
import MensajeFuente from '../components/MensajeFuente.jsx'
import PanelCapas from '../components/PanelCapas.jsx'
import CapaRefugios from '../components/CapaRefugios.jsx'
import CapaBloqueos from '../components/CapaBloqueos.jsx'
import LeyendaRefugiosBloqueos from '../components/LeyendaRefugiosBloqueos.jsx'
import CapaIncidentes from '../components/CapaIncidentes.jsx'
import LeyendaBrigadas from '../components/LeyendaBrigadas.jsx'
import PanelRuta from '../components/PanelRuta.jsx'
import CapaZonasPeligro from '../components/CapaZonasPeligro.jsx'
import LeyendaZonas from '../components/LeyendaZonas.jsx'
import CapaRutasEvacuacion from '../components/CapaRutasEvacuacion.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { useCiclones } from '../hooks/useCiclones.js'
import { useSatelite } from '../hooks/useSatelite.js'
import { useRefugios } from '../hooks/useRefugios.js'
import { useBloqueos } from '../hooks/useBloqueos.js'
import { useSesion } from '../hooks/useSesion.js'
import { useIncidentes } from '../hooks/useBrigadas.js'
import { useRutaEvacuacion } from '../hooks/useRutaEvacuacion.js'
import { useRutaRefugio } from '../hooks/useRutaRefugio.js'
import { useModoRuta } from '../hooks/useModoRuta.js'
import { useZonasPeligro } from '../hooks/useZonasPeligro.js'
import { renovarBloqueo, eliminarBloqueo, confirmarBloqueo } from '../services/bloqueos.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { AVISO_OFICIAL } from '../utils/avisos.js'
import { resumirEstadoFuentes } from '../utils/estadoFuentes.js'
import './Mapa.css'

// Arreglo vacío fijo: la ruta se recalcula cada vez que cambia el arreglo de bloqueos
const SIN_BLOQUEOS = []


// Mientras no haya datos no hay hora que mostrar
function horaDe(actualizadoEn) {
  return actualizadoEn === null || actualizadoEn === undefined ? '—' : formatearFechaHora(actualizadoEn)
}

// Hora para el pie. Si la fuente no trae hora propia (por ejemplo, NHC sin tormentas),
// se dice cuándo se consultó, para que nunca quede sin hora un "Sin ciclones activos".
function horaDeFuente({ actualizadoEn, consultadoEn }) {
  if (actualizadoEn !== null && actualizadoEn !== undefined) return horaDe(actualizadoEn)
  if (consultadoEn !== null && consultadoEn !== undefined) return `consultado ${horaDe(consultadoEn)}`
  return '—'
}

// Hora para los mensajes de error ("Mostrando datos del …")
function horaParaMensaje({ actualizadoEn, consultadoEn }) {
  return horaDe(actualizadoEn ?? consultadoEn)
}

// Texto de un renglón de la lista de ciclones, por ejemplo
// "Huracán Trudy · categoría 1 · 139 km/h · alerta GDACS naranja"
function describirCiclon(ciclon) {
  const partes = [`${ciclon.tipo ?? 'Ciclón tropical'} ${ciclon.nombre}`]
  if (ciclon.categoria) partes.push(`categoría ${ciclon.categoria}`)
  if (ciclon.vientoKmh) partes.push(`${ciclon.vientoKmh} km/h`)
  if (ciclon.alertaGdacs) partes.push(`alerta GDACS ${ciclon.alertaGdacs}`)
  return partes.join(' · ')
}

// Junta lo que MensajeFuente necesita de una fuente (sismos, ciclones, refugios…).
// `origen` es lo que devuelve su hook: { estado, error, recargar, actualizadoEn, consultadoEn }
function datosDeFuente(clave, etiqueta, origen, hayDatos, { singular = false } = {}) {
  return {
    clave,
    etiqueta,
    singular,
    estado: origen.estado,
    error: origen.error,
    hayDatos,
    hora: horaParaMensaje(origen),
    recargar: origen.recargar,
  }
}

// "Protección Civil de Jalisco, lista 2026 · …": de dónde salieron los refugios del mapa
function fuentesDeRefugios(refugios) {
  const fuentes = new Set((refugios?.features ?? []).map((refugio) => refugio.properties.fuente).filter(Boolean))
  return fuentes.size > 0 ? [...fuentes].join(' · ') : 'lista oficial'
}

// Pantalla principal: mapa en vivo con sismos, ciclones, satélite, refugios y bloqueos
function Mapa() {
  const sismos = useSismos()
  const { nhc, gdacs, ciclones, eventosGdacsSinNhc } = useCiclones()
  const refugios = useRefugios()
  const bloqueos = useBloqueos()
  const { rol, configurado: supabaseConfigurado, asegurarSesion } = useSesion()
  const zonas = useZonasPeligro()
  const navegar = useNavigate()
  // Brigadistas y coordinadores ven además los incidentes (los ciudadanos no)
  const esPersonal = rol === 'brigadista' || rol === 'coordinador'
  const incidentes = useIncidentes(esPersonal)

  // Ruta a pie al punto de reunión o refugio más seguro. Los bloqueos se pasan como un
  // arreglo ESTABLE (solo cambia cuando cambian los bloqueos), para no recalcular en cada render.
  const bloqueosParaRuta = useMemo(() => bloqueos.bloqueos?.features ?? SIN_BLOQUEOS, [bloqueos.bloqueos])
  const evacuacion = useRutaEvacuacion({
    sismos: sismos.sismos,
    bloqueos: bloqueosParaRuta,
    refugios: refugios.refugios,
    zonas: zonas.zonas,
  })
  const { resultado: resultadoRuta, sinDatosSismos } = evacuacion
  // Sin datos de sismos el riesgo es desconocido: la línea se dibuja gris, no verde
  const rutaParaMapa = useMemo(() => {
    if (!resultadoRuta) return null
    if (!sinDatosSismos) return resultadoRuta.ruta
    return { ...resultadoRuta.ruta, properties: { ...resultadoRuta.ruta.properties, nivelRiesgo: 'desconocido' } }
  }, [resultadoRuta, sinDatosSismos])

  // Etapa 4: un solo botón "Ruta a refugio". Con conexión, ruta en línea (OpenRouteService);
  // sin conexión o si falla, a pie se usa la ruta del teléfono (evacuacion, arriba)
  const [modoRuta, setModoRuta] = useModoRuta()
  const rutaRefugio = useRutaRefugio({ modo: modoRuta, evacuacion, asegurarSesion })
  const rutaEnLinea = rutaRefugio.estado === 'listo' ? rutaRefugio.resultado : null
  // En el mapa se dibuja UNA ruta: la en línea, o la del teléfono si se usó el respaldo
  const rutaDibujada = rutaEnLinea
    ? { ruta: rutaEnLinea.ruta, origen: rutaRefugio.origen, destino: rutaEnLinea.destino.posicion }
    : {
        ruta: rutaParaMapa,
        origen: resultadoRuta ? evacuacion.origen : null,
        destino: resultadoRuta?.puntoReunion.coordenadas ?? null,
      }

  // Qué capas están prendidas. El satélite empieza apagado para cuidar datos y batería.
  const [capas, setCapas] = useState({
    sismos: true,
    ciclones: true,
    satelite: false,
    refugios: true,
    bloqueos: true,
    incidentes: true,
    zonas: true,
  })
  const satelite = useSatelite(capas.satelite)

  // Desde el popup de un bloqueo. El tiempo real también avisa, pero se recarga
  // de una vez para que la persona vea el cambio aunque la señal sea mala.
  async function alRenovarBloqueo(id) {
    await renovarBloqueo(id)
    bloqueos.recargar({ silencioso: true })
  }
  async function alEliminarBloqueo(id) {
    await eliminarBloqueo(id)
    bloqueos.recargar({ silencioso: true })
  }
  async function alConfirmarBloqueo(id) {
    await confirmarBloqueo(id)
    bloqueos.recargar({ silencioso: true })
  }
  // El coordinador convierte un bloqueo en incidente en el panel de brigadas
  function alCrearIncidente(id, [longitud, latitud]) {
    navegar(`/brigadas?bloqueo=${id}&lng=${longitud}&lat=${latitud}`)
  }

  // El mapa de MapLibre llega cuando termina de cargar (ver MapaBase)
  const [mapa, setMapa] = useState(null)
  const [falloMapaBase, setFalloMapaBase] = useState(false)
  // Cambiar este número hace que React cree un MapaBase nuevo (para reintentar)
  const [intentoMapa, setIntentoMapa] = useState(0)

  function cambiarCapa(nombre, valor) {
    setCapas((anteriores) => ({ ...anteriores, [nombre]: valor }))
  }
  function alFallarMapaBase() {
    setFalloMapaBase(true)
  }
  function reintentarMapaBase() {
    setFalloMapaBase(false)
    setMapa(null)
    setIntentoMapa((intento) => intento + 1)
  }

  // Sin conexión se avisa una sola vez, aunque lo detecten varias fuentes
  const sinConexion =
    sismos.sinConexion || nhc.sinConexion || gdacs.sinConexion || refugios.sinConexion || bloqueos.sinConexion
  const hayAlgunDato = Boolean(sismos.sismos || nhc.datos || gdacs.datos || refugios.refugios || bloqueos.bloqueos)
  const totalBloqueos = bloqueos.bloqueos?.features.length ?? 0

  const totalSismos = sismos.sismos?.features.length ?? 0
  const semanaSinSismos = sismos.estado === 'listo' && totalSismos === 0
  // Solo se dice que no hay ciclones si las DOS fuentes respondieron bien y vacías
  const sinCiclones = nhc.estado === 'listo' && gdacs.estado === 'listo' && ciclones.length === 0

  // Todas las fuentes con su estado, para el indicador único "Datos al día".
  // Sin conexión no se lista ninguna: se avisa una sola vez arriba.
  const fuentes = sinConexion
    ? []
    : [
        datosDeFuente('sismos', 'los sismos', sismos, Boolean(sismos.sismos)),
        datosDeFuente('nhc', 'los ciclones de NHC', nhc, Boolean(nhc.datos)),
        datosDeFuente('gdacs', 'los ciclones de GDACS', gdacs, Boolean(gdacs.datos)),
        ...(supabaseConfigurado
          ? [
              datosDeFuente('refugios', 'los refugios', refugios, Boolean(refugios.refugios)),
              datosDeFuente('bloqueos', 'los bloqueos', bloqueos, Boolean(bloqueos.bloqueos)),
            ]
          : []),
        ...(capas.satelite
          ? [datosDeFuente('satelite', 'la imagen de satélite', satelite, Boolean(satelite.datos), { singular: true })]
          : []),
      ]
  const resumenEstado = resumirEstadoFuentes(fuentes, { sinConexion })
  // Los errores se ven siempre (con su botón Reintentar); "Cargando…" solo dentro del indicador
  const fuentesConError = fuentes.filter((fuente) => fuente.estado === 'error')
  const fuentesCargando = fuentes.filter((fuente) => fuente.estado === 'cargando')

  function mensajeDe(fuente) {
    return (
      <MensajeFuente
        key={fuente.clave}
        etiqueta={fuente.etiqueta}
        plural={!fuente.singular}
        estado={fuente.estado}
        error={fuente.error}
        hayDatos={fuente.hayDatos}
        hora={fuente.hora}
        recargar={fuente.recargar}
      />
    )
  }

  return (
    <div className="pantalla-mapa">
      {/* Arriba: título, estado de los datos y lo urgente. Se mantiene corto para dejarle espacio al mapa. */}
      <header className="mapa-cabecera">
        <div className="mapa-cabecera-fila">
          <h1>Mapa en vivo</h1>
          {/* Un solo indicador en lugar de un aviso por fuente; al tocarlo se ven fuentes y horas */}
          <details className="estado-datos">
            <summary className={`estado-datos-resumen estado-${resumenEstado.tipo}`}>
              <span className="estado-punto" aria-hidden="true" />
              {resumenEstado.texto}
            </summary>
            <div className="estado-datos-panel">
              {fuentesCargando.map(mensajeDe)}
              <p className="fuente">Sismos: USGS · {horaDeFuente(sismos)}</p>
              <p className="fuente">
                Ciclones: NHC/NOAA · {horaDeFuente(nhc)} · GDACS · {horaDeFuente(gdacs)}
              </p>
              {supabaseConfigurado && (
                <>
                  <p className="fuente">
                    Refugios: {fuentesDeRefugios(refugios.refugios)} · {horaDeFuente(refugios)}
                  </p>
                  <p className="fuente">Bloqueos: reportes ciudadanos · {horaDeFuente(bloqueos)}</p>
                </>
              )}
              {capas.satelite && (
                <p className="fuente">Satélite: NASA GIBS (GOES-East) · {horaDeFuente(satelite)}</p>
              )}
            </div>
          </details>
        </div>

        {/* Ciclones activos: lo más urgente, en una banda de color */}
        {ciclones.length > 0 && (
          <ul className="alerta-ciclones" aria-label="Ciclones activos">
            {ciclones.map((ciclon) => (
              <li key={ciclon.id}>{describirCiclon(ciclon)}</li>
            ))}
          </ul>
        )}

        {/* Resumen en etiquetas pequeñas */}
        <ul className="resumen-mapa" aria-label="Resumen">
          {totalSismos > 0 && (
            <li className="conteo">
              {totalSismos === 1 ? '1 sismo' : `${totalSismos} sismos`} en los últimos 7 días
            </li>
          )}
          {semanaSinSismos && (
            <li className="conteo">No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.</li>
          )}
          {sinCiclones && <li className="conteo">Sin ciclones activos cerca de México según NHC y GDACS.</li>}
          {totalBloqueos > 0 && (
            <li className="conteo">
              {totalBloqueos === 1 ? '1 bloqueo reportado' : `${totalBloqueos} bloqueos reportados`} en las últimas 24 h
            </li>
          )}
        </ul>

        {/* Avisos que sí hay que ver de inmediato */}
        {sinConexion && (
          <div className="mensaje-estado mensaje-aviso" role="status">
            <p>
              {hayAlgunDato
                ? 'Sin conexión. Se muestran los últimos datos descargados.'
                : 'Sin conexión. No hay datos guardados.'}
            </p>
          </div>
        )}
        {fuentesConError.map(mensajeDe)}
        {!sinConexion && !supabaseConfigurado && (
          <div className="mensaje-estado mensaje-aviso" role="status">
            <p>Refugios y bloqueos no disponibles: falta configurar Supabase.</p>
          </div>
        )}
      </header>

      {/* El mapa ocupa todo el espacio que queda */}
      <div className="mapa-lienzo">
        <MapaBase key={intentoMapa} alCargar={setMapa} alFallar={alFallarMapaBase} />
        <CapaSatelite mapa={mapa} hora={satelite.datos} visible={capas.satelite} />
        <CapaCiclones mapa={mapa} nhc={nhc.datos} eventosGdacs={eventosGdacsSinNhc} visible={capas.ciclones} />
        <CapaSismos mapa={mapa} sismos={sismos.sismos} visible={capas.sismos} />
        {/* Las zonas de peligro van debajo de refugios y bloqueos */}
        <CapaZonasPeligro mapa={mapa} zonas={zonas.zonas} visible={capas.zonas} />
        {/* Refugios y bloqueos van encima: son lo más importante para moverse */}
        <CapaRefugios mapa={mapa} refugios={refugios.refugios} visible={capas.refugios} />
        <CapaBloqueos
          mapa={mapa}
          bloqueos={bloqueos.bloqueos}
          visible={capas.bloqueos}
          rol={rol}
          alRenovar={alRenovarBloqueo}
          alEliminar={alEliminarBloqueo}
          alConfirmar={alConfirmarBloqueo}
          alCrearIncidente={alCrearIncidente}
        />
        {esPersonal && <CapaIncidentes mapa={mapa} incidentes={incidentes.incidentes} visible={capas.incidentes} />}
        {/* La ruta va al final para quedar encima de todo (también al cambiar de tema) */}
        <CapaRutasEvacuacion
          mapa={mapa}
          ruta={rutaDibujada.ruta}
          origen={rutaDibujada.origen}
          destino={rutaDibujada.destino}
        />

        {/* Capas y leyenda juntas, detrás de un botón para no tapar el mapa */}
        <details className="mapa-capas">
          <summary className="boton-flotante">Capas</summary>
          <div className="mapa-capas-panel">
            <PanelCapas capas={capas} alCambiar={cambiarCapa} extras={esPersonal ? ['incidentes'] : []} />
            <div className="leyendas">
              <LeyendaMagnitud />
              <LeyendaCiclones />
              <LeyendaRefugiosBloqueos />
              <LeyendaZonas />
              {esPersonal && <LeyendaBrigadas />}
            </div>
          </div>
        </details>

        {falloMapaBase && (
          <div className="mensaje-estado mensaje-error mapa-fallo" role="alert">
            <p>No se pudo cargar el mapa base. Revisa tu conexión.</p>
            <button type="button" className="boton-reintentar" onClick={reintentarMapaBase}>
              Reintentar mapa
            </button>
          </div>
        )}

        <Link to="/reportar" className="boton-reportar">
          Reportar bloqueo
        </Link>
      </div>

      {/* Abajo (en escritorio, a la izquierda): la acción principal, al alcance del pulgar */}
      <div className="mapa-hoja">
        <PanelRuta
          ruta={rutaRefugio}
          evacuacion={evacuacion}
          modo={modoRuta}
          alCambiarModo={setModoRuta}
          sinDatosBloqueos={bloqueos.bloqueos == null}
        />
        <p className="aviso-oficial">{AVISO_OFICIAL}</p>
      </div>
    </div>
  )
}

export default Mapa
