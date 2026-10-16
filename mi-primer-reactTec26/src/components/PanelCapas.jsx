const OPCIONES = [
  { nombre: 'sismos', etiqueta: 'Sismos' },
  { nombre: 'ciclones', etiqueta: 'Ciclones' },
  { nombre: 'satelite', etiqueta: 'Satélite' },
]

// Casillas para prender y apagar cada capa del mapa.
// `capas` dice cuáles están prendidas; `alCambiar(nombre, valor)` avisa los cambios.
function PanelCapas({ capas, alCambiar }) {
  return (
    <fieldset className="panel-capas">
      <legend className="panel-capas-titulo">Capas</legend>
      {OPCIONES.map(({ nombre, etiqueta }) => (
        <label key={nombre} className="panel-capas-opcion">
          <input
            type="checkbox"
            checked={capas[nombre]}
            onChange={(evento) => alCambiar(nombre, evento.target.checked)}
          />
          {etiqueta}
        </label>
      ))}
    </fieldset>
  )
}

export default PanelCapas
