const OPCIONES = [
  { nombre: 'sismos', etiqueta: 'Sismos' },
  { nombre: 'ciclones', etiqueta: 'Ciclones' },
  { nombre: 'satelite', etiqueta: 'Satélite' },
  { nombre: 'refugios', etiqueta: 'Refugios' },
  { nombre: 'bloqueos', etiqueta: 'Bloqueos' },
  { nombre: 'zonas', etiqueta: 'Zonas' },
  // Solo para brigadistas y coordinadores (ver `extras`)
  { nombre: 'incidentes', etiqueta: 'Incidentes', extra: true },
]

// Casillas para prender y apagar cada capa del mapa.
// `capas` dice cuáles están prendidas; `alCambiar(nombre, valor)` avisa los cambios.
// `extras`: nombres de capas opcionales que se muestran (por ejemplo ['incidentes']).
function PanelCapas({ capas, alCambiar, extras = [] }) {
  return (
    <fieldset className="panel-capas">
      <legend className="panel-capas-titulo">Capas</legend>
      {OPCIONES.filter(({ nombre, extra }) => !extra || extras.includes(nombre)).map(({ nombre, etiqueta }) => (
        <label key={nombre} className="panel-capas-opcion">
          <input
            type="checkbox"
            checked={Boolean(capas[nombre])}
            onChange={(evento) => alCambiar(nombre, evento.target.checked)}
          />
          {etiqueta}
        </label>
      ))}
    </fieldset>
  )
}

export default PanelCapas
