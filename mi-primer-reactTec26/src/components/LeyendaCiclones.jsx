import { AVISOS_COSTA, COLORES_ALERTA_GDACS } from '../utils/ciclones.js'

// Explica qué significa cada forma y color de los ciclones en el mapa.
// Los colores vienen de utils/ciclones.js, los mismos que usa CapaCiclones.
function LeyendaCiclones() {
  return (
    <div className="leyenda">
      <span className="leyenda-titulo">Ciclones:</span>
      <ul className="leyenda-lista">
        <li className="leyenda-elemento">
          <span className="leyenda-cono" aria-hidden="true" />
          <span>Cono de pronóstico</span>
        </li>
        <li className="leyenda-elemento">
          <span className="leyenda-linea leyenda-linea-punteada" aria-hidden="true" />
          <span>Trayectoria</span>
        </li>
        {AVISOS_COSTA.map((aviso) => (
          <li key={aviso.codigo} className="leyenda-elemento">
            <span className="leyenda-linea" style={{ backgroundColor: aviso.color }} aria-hidden="true" />
            <span>{aviso.etiqueta}</span>
          </li>
        ))}
        {COLORES_ALERTA_GDACS.map((alerta) => (
          <li key={alerta.nivel} className="leyenda-elemento">
            <span
              className="leyenda-color leyenda-color-gdacs"
              style={{ backgroundColor: alerta.color }}
              aria-hidden="true"
            />
            <span>{alerta.etiqueta}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default LeyendaCiclones
