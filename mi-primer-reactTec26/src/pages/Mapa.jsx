import { useState } from 'react'
import { Link } from 'react-router'
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
import { useSismos } from '../hooks/useSismos.js'
import { useCiclones } from '../hooks/useCiclones.js'
import { useSatelite } from '../hooks/useSatelite.js'
import { useRefugios } from '../hooks/useRefugios.js'
import { useBloqueos } from '../hooks/useBloqueos.js'
import { useSesion } from '../hooks/useSesion.js'
import { renovarBloqueo, eliminarBloqueo, confirmarBloqueo } from '../services/bloqueos.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { AVISO_OFICIAL } from '../utils/avisos.js'
import './Mapa.css'


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
  const { rol, configurado: supabaseConfigurado } = useSesion()

  // Qué capas están prendidas. El satélite empieza apagado para cuidar datos y batería.
  const [capas, setCapas] = useState({
    sismos: true,
    ciclones: true,
    satelite: false,
    refugios: true,
    bloqueos: true,
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

  return (
    <div className="pantalla-mapa">
      <header className="barra-superior">
        <h1>Mapa en vivo</h1>
        {totalSismos > 0 && (
          <p className="conteo">
            {totalSismos === 1 ? '1 sismo' : `${totalSismos} sismos`} en los últimos 7 días
          </p>
        )}
        {ciclones.length > 0 && (
          <ul className="lista-ciclones" aria-label="Ciclones activos">
            {ciclones.map((ciclon) => (
              <li key={ciclon.id}>{describirCiclon(ciclon)}</li>
            ))}
          </ul>
        )}
        {sinCiclones && <p className="conteo">Sin ciclones activos cerca de México según NHC y GDACS.</p>}
        {totalBloqueos > 0 && (
          <p className="conteo">
            {totalBloqueos === 1 ? '1 bloqueo reportado' : `${totalBloqueos} bloqueos reportados`} en las últimas 24 h
          </p>
        )}

        {sinConexion ? (
          <div className="mensaje-estado mensaje-aviso" role="status">
            <p>
              {hayAlgunDato
                ? 'Sin conexión. Se muestran los últimos datos descargados.'
                : 'Sin conexión. No hay datos guardados.'}
            </p>
          </div>
        ) : (
          <>
            <MensajeFuente
              etiqueta="los sismos"
              plural
              estado={sismos.estado}
              error={sismos.error}
              hayDatos={Boolean(sismos.sismos)}
              hora={horaParaMensaje(sismos)}
              recargar={sismos.recargar}
            />
            <MensajeFuente
              etiqueta="los ciclones de NHC"
              plural
              estado={nhc.estado}
              error={nhc.error}
              hayDatos={Boolean(nhc.datos)}
              hora={horaParaMensaje(nhc)}
              recargar={nhc.recargar}
            />
            <MensajeFuente
              etiqueta="los ciclones de GDACS"
              plural
              estado={gdacs.estado}
              error={gdacs.error}
              hayDatos={Boolean(gdacs.datos)}
              hora={horaParaMensaje(gdacs)}
              recargar={gdacs.recargar}
            />
            {supabaseConfigurado ? (
              <>
                <MensajeFuente
                  etiqueta="los refugios"
                  plural
                  estado={refugios.estado}
                  error={refugios.error}
                  hayDatos={Boolean(refugios.refugios)}
                  hora={horaParaMensaje(refugios)}
                  recargar={refugios.recargar}
                />
                <MensajeFuente
                  etiqueta="los bloqueos"
                  plural
                  estado={bloqueos.estado}
                  error={bloqueos.error}
                  hayDatos={Boolean(bloqueos.bloqueos)}
                  hora={horaParaMensaje(bloqueos)}
                  recargar={bloqueos.recargar}
                />
              </>
            ) : (
              <div className="mensaje-estado mensaje-aviso" role="status">
                <p>Refugios y bloqueos no disponibles: falta configurar Supabase.</p>
              </div>
            )}
            {capas.satelite && (
              <MensajeFuente
                etiqueta="la imagen de satélite"
                plural={false}
                estado={satelite.estado}
                error={satelite.error}
                hayDatos={Boolean(satelite.datos)}
                hora={horaParaMensaje(satelite)}
                recargar={satelite.recargar}
              />
            )}
          </>
        )}
        {semanaSinSismos && (
          <div className="mensaje-estado mensaje-info" role="status">
            <p>No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.</p>
          </div>
        )}
        {falloMapaBase && (
          <div className="mensaje-estado mensaje-error" role="alert">
            <p>No se pudo cargar el mapa base. Revisa tu conexión.</p>
            <button type="button" className="boton-reintentar" onClick={reintentarMapaBase}>
              Reintentar mapa
            </button>
          </div>
        )}
      </header>

      <div className="contenedor-mapa">
        <MapaBase key={intentoMapa} alCargar={setMapa} alFallar={alFallarMapaBase} />
        <CapaSatelite mapa={mapa} hora={satelite.datos} visible={capas.satelite} />
        <CapaCiclones mapa={mapa} nhc={nhc.datos} eventosGdacs={eventosGdacsSinNhc} visible={capas.ciclones} />
        <CapaSismos mapa={mapa} sismos={sismos.sismos} visible={capas.sismos} />
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
        />
        <PanelCapas capas={capas} alCambiar={cambiarCapa} />
        <Link to="/reportar" className="boton-reportar">
          Reportar bloqueo
        </Link>
      </div>

      <footer className="pie">
        <details className="leyendas">
          <summary>Leyenda</summary>
          <LeyendaMagnitud />
          <LeyendaCiclones />
          <LeyendaRefugiosBloqueos />
        </details>
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
        <p className="aviso-oficial">{AVISO_OFICIAL}</p>
      </footer>
    </div>
  )
}

export default Mapa
