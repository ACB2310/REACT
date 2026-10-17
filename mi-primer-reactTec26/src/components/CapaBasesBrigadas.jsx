import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { etiquetaEstadoBrigada, expresionColorBrigada } from '../utils/incidentes.js'
import { crearElemento } from '../utils/popup.js'

const ID_FUENTE = 'brigadas'
const ID_CAPA = 'brigadas-bases'
// Capa invisible más grande para tocar con el dedo
const ID_CAPA_TOQUE = 'brigadas-toque'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

function crearContenidoPopup(brigada) {
  const p = brigada.properties
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(
    crearElemento('strong', p.nombre ?? 'Brigada'),
    crearElemento('p', `Base · ${etiquetaEstadoBrigada(p.estado)}`),
    crearElemento('p', p.vehiculo ? `Vehículo: ${p.vehiculo}` : 'Sin vehículo registrado'),
    crearElemento('p', p.miembros === 1 ? '1 brigadista' : `${p.miembros ?? 0} brigadistas`),
  )
  return contenido
}

// Bases fijas de las brigadas, con el color de su estado y borde oscuro
// (para no confundirlas con los refugios, que tienen borde blanco)
function CapaBasesBrigadas({ mapa, brigadas, visible = true }) {
  function alHacerClic(evento) {
    const brigada = evento.features?.[0]
    if (!brigada) return
    new Popup({ maxWidth: '280px' })
      .setLngLat(brigada.geometry.coordinates)
      .setDOMContent(crearContenidoPopup(brigada))
      .addTo(mapa)
  }

  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: brigadas ?? COLECCION_VACIA }) }],
    capas: [
      {
        id: ID_CAPA,
        type: 'circle',
        source: ID_FUENTE,
        paint: {
          'circle-color': expresionColorBrigada(),
          'circle-radius': 9,
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 3,
        },
      },
      {
        id: ID_CAPA_TOQUE,
        type: 'circle',
        source: ID_FUENTE,
        paint: { 'circle-radius': 20, 'circle-opacity': 0 },
      },
    ],
    clics: { [ID_CAPA_TOQUE]: alHacerClic },
    visible,
  })

  useEffect(() => {
    if (!mapa || !brigadas) return
    mapa.getSource(ID_FUENTE)?.setData(brigadas)
  }, [mapa, brigadas])

  return null
}

export default CapaBasesBrigadas
