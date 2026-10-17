import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { crearElemento } from '../utils/popup.js'
import { COLORES_SEVERIDAD, TEXTOS_SEVERIDAD } from '../utils/zonas.js'

const ID_FUENTE = 'zonas-peligro'
const ID_CAPA_RELLENO = 'zonas-peligro-relleno'
const ID_CAPA_BORDE = 'zonas-peligro-borde'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

function crearContenidoPopup(zona) {
  const p = zona.properties
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(crearElemento('strong', TEXTOS_SEVERIDAD[p.severidad] ?? 'Zona de peligro'))
  // textContent: lo que escribe el coordinador nunca se interpreta como HTML
  if (p.descripcion) contenido.append(crearElemento('p', p.descripcion))
  contenido.append(crearElemento('p', `Marcada por coordinación · ${formatearFechaHora(p.creadoEn)}`))
  if (p.expiraEn) contenido.append(crearElemento('p', `Vigente hasta ${formatearFechaHora(p.expiraEn)}`))
  return contenido
}

// Zonas de peligro marcadas por el coordinador: relleno rojo (evitar) o ámbar
// (precaución) semitransparente, con borde punteado. Van debajo de refugios y bloqueos.
function CapaZonasPeligro({ mapa, zonas, visible = true }) {
  function alHacerClic(evento) {
    const zona = evento.features?.[0]
    if (!zona) return
    new Popup({ maxWidth: '280px' })
      .setLngLat(evento.lngLat)
      .setDOMContent(crearContenidoPopup(zona))
      .addTo(mapa)
  }

  const color = ['match', ['get', 'severidad'], 2, COLORES_SEVERIDAD[2], COLORES_SEVERIDAD[1]]
  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: zonas ?? COLECCION_VACIA }) }],
    capas: [
      {
        id: ID_CAPA_RELLENO,
        type: 'fill',
        source: ID_FUENTE,
        paint: { 'fill-color': color, 'fill-opacity': 0.2 },
      },
      {
        id: ID_CAPA_BORDE,
        type: 'line',
        source: ID_FUENTE,
        paint: { 'line-color': color, 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
      },
    ],
    clics: { [ID_CAPA_RELLENO]: alHacerClic },
    visible,
  })

  useEffect(() => {
    if (!mapa || !zonas) return
    mapa.getSource(ID_FUENTE)?.setData(zonas)
  }, [mapa, zonas])

  return null
}

export default CapaZonasPeligro
