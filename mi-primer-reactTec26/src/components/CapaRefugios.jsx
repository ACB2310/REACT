import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { expresionColorRefugio, etiquetaEstadoRefugio, textoOcupacion } from '../utils/refugios.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { crearElemento } from '../utils/popup.js'

const ID_FUENTE = 'refugios'
const ID_CAPA = 'refugios-puntos'
// Capa invisible más grande para tocar con el dedo
const ID_CAPA_TOQUE = 'refugios-toque'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Contenido del popup de un refugio. Todo con textContent: nada se interpreta como HTML.
function crearContenidoPopup(refugio) {
  const p = refugio.properties
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(crearElemento('strong', p.nombre ?? 'Refugio'))
  if (p.direccion) contenido.append(crearElemento('p', p.direccion))
  if (p.municipio) contenido.append(crearElemento('p', [p.municipio, p.entidad].filter(Boolean).join(', ')))
  contenido.append(
    crearElemento('p', `Estado: ${etiquetaEstadoRefugio(p.estado)}`),
    crearElemento('p', textoOcupacion(p)),
    crearElemento('p', `Fuente: ${p.fuente ?? 'sin dato'}`),
    crearElemento('p', `Actualizado: ${formatearFechaHora(p.actualizadoEn)}`),
  )
  return contenido
}

// Dibuja los refugios como círculos con borde blanco, de color según su estado
function CapaRefugios({ mapa, refugios, visible = true }) {
  function alHacerClic(evento) {
    const refugio = evento.features?.[0]
    if (!refugio) return
    new Popup({ maxWidth: '280px' })
      .setLngLat(refugio.geometry.coordinates)
      .setDOMContent(crearContenidoPopup(refugio))
      .addTo(mapa)
  }

  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: refugios ?? COLECCION_VACIA }) }],
    capas: [
      {
        id: ID_CAPA,
        type: 'circle',
        source: ID_FUENTE,
        paint: {
          'circle-color': expresionColorRefugio(),
          'circle-radius': 9,
          'circle-stroke-color': '#ffffff',
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
    if (!mapa || !refugios) return
    mapa.getSource(ID_FUENTE)?.setData(refugios)
  }, [mapa, refugios])

  return null
}

export default CapaRefugios
