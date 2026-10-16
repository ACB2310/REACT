import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { expresionColorMagnitud, etiquetaMagnitud } from '../utils/sismos.js'
import { formatearFechaHora } from '../utils/fechas.js'

const ID_FUENTE = 'sismos'
const ID_CAPA = 'sismos-circulos'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Crea un elemento con texto. Se usa `textContent` (no innerHTML) para que
// ningún texto que venga de la API se interprete como HTML.
function crearElemento(etiqueta, texto) {
  const elemento = document.createElement(etiqueta)
  elemento.textContent = texto
  return elemento
}

// Arma el contenido del popup de un sismo
function crearContenidoPopup(sismo) {
  const { mag, place, time, url } = sismo.properties
  const profundidad = sismo.geometry.coordinates[2]

  const contenido = document.createElement('div')
  contenido.className = 'popup-sismo'
  contenido.append(
    crearElemento('strong', etiquetaMagnitud(mag)),
    crearElemento('p', place ?? 'Lugar desconocido'),
    crearElemento('p', formatearFechaHora(time)),
    crearElemento(
      'p',
      typeof profundidad === 'number'
        ? `Profundidad: ${Math.round(profundidad)} km`
        : 'Profundidad: desconocida',
    ),
  )
  if (url) {
    const enlace = crearElemento('a', 'Ver en USGS')
    enlace.href = url
    enlace.target = '_blank'
    enlace.rel = 'noopener noreferrer'
    contenido.append(enlace)
  }
  return contenido
}

// Dibuja los sismos como círculos sobre el mapa.
// No muestra nada en React (devuelve null): todo se dibuja dentro de MapLibre.
function CapaSismos({ mapa, sismos }) {
  // Agrega la fuente y la capa cuando el mapa está listo, y las quita al salir
  useEffect(() => {
    if (!mapa) return

    mapa.addSource(ID_FUENTE, { type: 'geojson', data: sismos ?? COLECCION_VACIA })
    mapa.addLayer({
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
    })

    // Al tocar un círculo se abre el detalle del sismo
    function alHacerClic(evento) {
      const sismo = evento.features?.[0]
      if (!sismo) return
      // GeoJSON: [longitud, latitud, profundidad]; el popup solo usa las dos primeras
      const [longitud, latitud] = sismo.geometry.coordinates
      new Popup({ maxWidth: '280px' })
        .setLngLat([longitud, latitud])
        .setDOMContent(crearContenidoPopup(sismo))
        .addTo(mapa)
    }
    mapa.on('click', ID_CAPA, alHacerClic)

    return () => {
      mapa.off('click', ID_CAPA, alHacerClic)
      try {
        if (mapa.getLayer(ID_CAPA)) mapa.removeLayer(ID_CAPA)
        if (mapa.getSource(ID_FUENTE)) mapa.removeSource(ID_FUENTE)
      } catch {
        // Si MapaBase ya eliminó el mapa, no queda nada que limpiar
      }
    }
    // `sismos` solo se usa como dato inicial; los cambios los maneja el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa])

  // Cuando llegan sismos nuevos, se actualizan los datos de la fuente
  useEffect(() => {
    if (!mapa || !sismos) return
    mapa.getSource(ID_FUENTE)?.setData(sismos)
  }, [mapa, sismos])

  return null
}

export default CapaSismos
