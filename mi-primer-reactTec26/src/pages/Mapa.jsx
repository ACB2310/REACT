import { useState } from 'react'
import MapaBase from '../components/MapaBase.jsx'
import CapaSismos from '../components/CapaSismos.jsx'
import LeyendaMagnitud from '../components/LeyendaMagnitud.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { formatearFechaHora } from '../utils/fechas.js'
import './Mapa.css'

const AVISO_OFICIAL =
  'Plataforma informativa. Las indicaciones oficiales de Protección Civil, SMN y SSN tienen prioridad.'

// Decide qué mensaje de estado mostrar arriba del mapa.
// Devuelve null cuando todo está bien y no hace falta avisar nada.
function elegirMensaje({ sismos, estado, error, sinConexion, hora }) {
  if (sinConexion) {
    return {
      tipo: 'aviso',
      texto: sismos
        ? `Sin conexión. Mostrando datos de las ${hora}.`
        : 'Sin conexión. No hay datos guardados.',
    }
  }
  if (estado === 'error') {
    return {
      tipo: 'error',
      texto: sismos
        ? `No se pudo actualizar. Mostrando datos de las ${hora}.`
        : `No se pudieron cargar los sismos: ${error}`,
    }
  }
  if (!sismos) return { tipo: 'info', texto: 'Cargando sismos…' }
  if (sismos.features.length === 0) {
    return {
      tipo: 'info',
      texto: 'No hay sismos de magnitud 2.5 o más en México y alrededores en los últimos 7 días.',
    }
  }
  return null
}

// Pantalla principal: mapa con los sismos recientes de USGS
function Mapa() {
  const { sismos, estado, error, actualizadoEn, sinConexion, recargar } = useSismos()
  // El mapa de MapLibre llega cuando termina de cargar (ver MapaBase)
  const [mapa, setMapa] = useState(null)

  const hora = formatearFechaHora(actualizadoEn)
  const total = sismos?.features.length ?? 0
  const mensaje = elegirMensaje({ sismos, estado, error, sinConexion, hora })

  return (
    <div className="pantalla-mapa">
      <header className="barra-superior">
        <h1>Sismos recientes</h1>
        {total > 0 && (
          <p className="conteo">
            {total === 1 ? '1 sismo' : `${total} sismos`} en los últimos 7 días
          </p>
        )}
        {mensaje && (
          <div
            className={`mensaje-estado mensaje-${mensaje.tipo}`}
            role={mensaje.tipo === 'error' ? 'alert' : 'status'}
          >
            <p>{mensaje.texto}</p>
            {estado === 'error' && (
              <button type="button" className="boton-reintentar" onClick={recargar}>
                Reintentar
              </button>
            )}
          </div>
        )}
      </header>

      <div className="contenedor-mapa">
        <MapaBase alCargar={setMapa} />
        <CapaSismos mapa={mapa} sismos={sismos} />
      </div>

      <footer className="pie">
        <LeyendaMagnitud />
        <p className="fuente">Fuente: USGS · Actualizado: {hora}</p>
        <p className="aviso-oficial">{AVISO_OFICIAL}</p>
      </footer>
    </div>
  )
}

export default Mapa
