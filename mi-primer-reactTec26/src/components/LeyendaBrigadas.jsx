import { PRIORIDADES, ESTADOS_BRIGADA } from '../utils/incidentes.js'

// Explica los colores de incidentes (por prioridad) y bases de brigadas (por estado)
function LeyendaBrigadas() {
  return (
    <>
      <div className="leyenda">
        <span className="leyenda-titulo">Incidentes:</span>
        <ul className="leyenda-lista">
          {Object.entries(PRIORIDADES).map(([prioridad, { etiqueta, color }]) => (
            <li key={prioridad} className="leyenda-elemento">
              <span className="leyenda-color" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>
                {prioridad} {etiqueta}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="leyenda">
        <span className="leyenda-titulo">Bases de brigadas:</span>
        <ul className="leyenda-lista">
          {Object.entries(ESTADOS_BRIGADA).map(([estado, { etiqueta, color }]) => (
            <li key={estado} className="leyenda-elemento">
              <span className="leyenda-color leyenda-color-base" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{etiqueta}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export default LeyendaBrigadas
