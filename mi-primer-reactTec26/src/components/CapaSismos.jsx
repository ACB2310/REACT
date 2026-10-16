import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { expresionColorMagnitud, etiquetaMagnitud } from '../utils/sismos.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { crearElemento, crearEnlaceSeguro } from '../utils/popup.js'

const ID_FUENTE = 'sismos'
const ID_CAPA = 'sismos-circulos'
// Capa invisible con círculos más grandes: hace fácil tocar un sismo con el dedo
const ID_CAPA_TOQUE = 'sismos-toque'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Arma el contenido del popup de un sismo
function crearContenidoPopup(sismo) {
  // La profundidad viene en properties (ver agregarProfundidad en utils/sismos.js)
  const { mag, place, time, url, profundidadKm } = sismo.properties

  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(
    crearElemento('strong', etiquetaMagnitud(mag)),
    crearElemento('p', place ?? 'Lugar desconocido'),
    crearElemento('p', formatearFechaHora(time)),
    crearElemento(
      'p',
      typeof profundidadKm === 'number'
        ? `Profundidad: ${Math.round(profundidadKm)} km`
        : 'Profundidad: desconocida',
    ),
  )
  const enlace = crearEnlaceSeguro('Ver en USGS', url)
  if (enlace) contenido.append(enlace)
  return contenido
}

// Dibuja los sismos como círculos sobre el mapa.
// No muestra nada en React (devuelve null): todo se dibuja dentro de MapLibre.
function CapaSismos({ mapa, sismos, visible = true }) {
  // Al tocar un círculo se abre el detalle del sismo
  function alHacerClic(evento) {
    const sismo = evento.features?.[0]
    if (!sismo) return
    // MapLibre entrega [longitud, latitud], en ese orden
    const [longitud, latitud] = sismo.geometry.coordinates
    new Popup({ maxWidth: '280px' })
      .setLngLat([longitud, latitud])
      .setDOMContent(crearContenidoPopup(sismo))
      .addTo(mapa)
  }

  // useCapasMapa agrega la fuente y las capas, las vuelve a poner si cambia
  // el estilo del mapa y las quita al salir de la pantalla
  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: sismos ?? COLECCION_VACIA }) }],
    capas: [
      {
        id: ID_CAPA,
        type: 'circle',
        source: ID_FUENTE,
        paint: {
          'circle-color': expresionColorMagnitud(),
          // Más magnitud, círculo más grande: 4 px en M 2.5 hasta 18 px en M 7
          'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'mag'], 0], 2.5, 4, 7, 18],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-opacity': 0.85,
        },
      },
      {
        id: ID_CAPA_TOQUE,
        type: 'circle',
        source: ID_FUENTE,
        paint: { 'circle-radius': 16, 'circle-opacity': 0 },
      },
    ],
    clics: { [ID_CAPA_TOQUE]: alHacerClic },
    visible,
  })

  // Cuando llegan sismos nuevos, se actualizan los datos de la fuente
  useEffect(() => {
    if (!mapa || !sismos) return
    mapa.getSource(ID_FUENTE)?.setData(sismos)
  }, [mapa, sismos])

  return null
}

export default CapaSismos
