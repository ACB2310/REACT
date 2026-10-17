import { ESTADOS_REFUGIO } from '../utils/refugios.js'
import { TIPOS_BLOQUEO } from '../utils/bloqueos.js'

// Explica los colores de refugios y bloqueos en el mapa
function LeyendaRefugiosBloqueos() {
  return (
    <>
      <div className="leyenda">
        <span className="leyenda-titulo">Refugios:</span>
        <ul className="leyenda-lista">
          {Object.entries(ESTADOS_REFUGIO).map(([estado, { etiqueta, color }]) => (
            <li key={estado} className="leyenda-elemento">
              <span className="leyenda-color" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{etiqueta}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="leyenda">
        <span className="leyenda-titulo">Bloqueos:</span>
        <ul className="leyenda-lista">
          {Object.entries(TIPOS_BLOQUEO).map(([tipo, { etiqueta, detalle, color }]) => (
            <li key={tipo} className="leyenda-elemento">
              <span className="leyenda-color" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>
                {etiqueta}: {detalle}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default LeyendaRefugiosBloqueos
