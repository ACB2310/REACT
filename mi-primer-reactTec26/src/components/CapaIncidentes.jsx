import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import {
  ESTADOS_INCIDENTE,
  etiquetaPrioridad,
  etiquetaTipoIncidente,
  expresionColorPrioridad,
  textoAntiguedad,
} from '../utils/incidentes.js'
import { crearElemento } from '../utils/popup.js'

const ID_FUENTE = 'incidentes'
const ID_CAPA = 'incidentes-puntos'
const ID_CAPA_NUMERO = 'incidentes-prioridad'
// Capa invisible más grande para tocar con el dedo
const ID_CAPA_TOQUE = 'incidentes-toque'
const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }

// Popup de un incidente. Todo con textContent: la descripción nunca se interpreta como HTML.
function crearContenidoPopup(incidente) {
  const p = incidente.properties
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(
    crearElemento('strong', etiquetaTipoIncidente(p.tipo)),
    crearElemento('p', `Prioridad ${etiquetaPrioridad(p.prioridad)}`),
    crearElemento('p', ESTADOS_INCIDENTE[p.estado] ?? p.estado),
  )
  if (p.descripcion) contenido.append(crearElemento('p', `“${p.descripcion}”`))
  if (p.brigadaNombre) contenido.append(crearElemento('p', `Brigada: ${p.brigadaNombre}`))
  contenido.append(crearElemento('p', `Creado ${textoAntiguedad(p.creadoEn)}`))
  return contenido
}

// Incidentes abiertos: círculo del color de su prioridad con el número adentro.
// Solo la ven brigadistas y coordinadores (el servidor no da estos datos a nadie más).
function CapaIncidentes({ mapa, incidentes, visible = true }) {
  function alHacerClic(evento) {
    const incidente = evento.features?.[0]
    if (!incidente) return
    new Popup({ maxWidth: '300px' })
      .setLngLat(incidente.geometry.coordinates)
      .setDOMContent(crearContenidoPopup(incidente))
      .addTo(mapa)
  }

  useCapasMapa(mapa, {
    fuentes: [{ id: ID_FUENTE, definicion: () => ({ type: 'geojson', data: incidentes ?? COLECCION_VACIA }) }],
    capas: [
      {
        id: ID_CAPA,
        type: 'circle',
        source: ID_FUENTE,
        paint: {
          'circle-color': expresionColorPrioridad(),
          'circle-radius': 13,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      },
      {
        id: ID_CAPA_NUMERO,
        type: 'symbol',
        source: ID_FUENTE,
        layout: {
          'text-field': ['to-string', ['get', 'prioridad']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 14,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      },
      {
        id: ID_CAPA_TOQUE,
        type: 'circle',
        source: ID_FUENTE,
        paint: { 'circle-radius': 24, 'circle-opacity': 0 },
      },
    ],
    clics: { [ID_CAPA_TOQUE]: alHacerClic },
    visible,
  })

  useEffect(() => {
    if (!mapa || !incidentes) return
    mapa.getSource(ID_FUENTE)?.setData(incidentes)
  }, [mapa, incidentes])

  return null
}

export default CapaIncidentes
