import { UMBRALES_MAGNITUD } from '../utils/sismos.js'

// Explica qué significa cada color de círculo en el mapa
function LeyendaMagnitud() {
  return (
    <div className="leyenda">
      <span className="leyenda-titulo">Magnitud:</span>
      <ul className="leyenda-lista">
        {UMBRALES_MAGNITUD.map((umbral) => (
          <li key={umbral.min} className="leyenda-elemento">
            <span className="leyenda-color" style={{ backgroundColor: umbral.color }} aria-hidden="true" />
            <span>{umbral.etiqueta}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default LeyendaMagnitud
