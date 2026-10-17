import { COLORES_SEVERIDAD, ETIQUETAS_SEVERIDAD } from '../utils/zonas.js'

// Explica los colores de las zonas de peligro y de la ruta a refugio
function LeyendaZonas() {
  return (
    <>
      <div className="leyenda">
        <span className="leyenda-titulo">Zonas de peligro:</span>
        <ul className="leyenda-lista">
          {[1, 2].map((severidad) => (
            <li key={severidad} className="leyenda-elemento">
              <span
                className="leyenda-color leyenda-color-zona"
                style={{ backgroundColor: COLORES_SEVERIDAD[severidad] }}
                aria-hidden="true"
              />
              <span>{ETIQUETAS_SEVERIDAD[severidad]}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="leyenda">
        <span className="leyenda-titulo">Ruta a refugio:</span>
        <ul className="leyenda-lista">
          <li className="leyenda-elemento">
            <span className="leyenda-linea" style={{ backgroundColor: '#1d4ed8' }} aria-hidden="true" />
            <span>A pie</span>
          </li>
          <li className="leyenda-elemento">
            <span className="leyenda-linea" style={{ backgroundColor: '#7c3aed' }} aria-hidden="true" />
            <span>En carro</span>
          </li>
        </ul>
      </div>
    </>
  )
}

export default LeyendaZonas
