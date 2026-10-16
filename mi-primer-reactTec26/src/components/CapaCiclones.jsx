import { useEffect } from 'react'
import { Popup } from 'maplibre-gl'
import { useCapasMapa } from '../hooks/useCapasMapa.js'
import {
  AVISOS_COSTA,
  COLORES_ALERTA_GDACS,
  COLOR_DESCONOCIDO,
  nombreAlertaGdacs,
  nombreCorto,
  nombreTipoCiclon,
  nudosAKmh,
} from '../utils/ciclones.js'
import { formatearFechaHora } from '../utils/fechas.js'
import { crearElemento, crearEnlaceSeguro } from '../utils/popup.js'

const COLECCION_VACIA = { type: 'FeatureCollection', features: [] }
// Las capas de ciclones van debajo de los sismos para no taparlos
const DEBAJO_DE_SISMOS = 'sismos-circulos'

// Expresión de MapLibre que elige un color según una propiedad
function colorSegun(propiedad, opciones, clave) {
  return ['match', ['get', propiedad], ...opciones.flatMap((o) => [o[clave], o.color]), COLOR_DESCONOCIDO]
}

// Contenido del popup al tocar un punto del NHC (posición actual o pronóstico)
function crearPopupNhc(punto) {
  const p = punto.properties
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(
    crearElemento('strong', `${nombreTipoCiclon(p.stormtype)} ${nombreCorto(p.stormname)}`),
    crearElemento('p', p.tau === 0 ? 'Posición actual' : `Pronóstico a ${p.tau} h`),
    crearElemento('p', `Viento: ${nudosAKmh(p.maxwind)} km/h (ráfagas ${nudosAKmh(p.gust)} km/h)`),
  )
  if (p.mslp > 0) contenido.append(crearElemento('p', `Presión: ${p.mslp} hPa`))
  contenido.append(crearElemento('p', `Aviso NHC ${p.advisnum}`))
  const pagina = p.basin === 'EP' ? 'https://www.nhc.noaa.gov/?epac' : 'https://www.nhc.noaa.gov/?atlc'
  contenido.append(crearEnlaceSeguro('Ver avisos del NHC', pagina))
  return contenido
}

// Contenido del popup al tocar un ciclón que solo reporta GDACS
function crearPopupGdacs(evento) {
  const p = evento.properties
  const contenido = document.createElement('div')
  contenido.className = 'popup-mapa'
  contenido.append(
    crearElemento('strong', `Ciclón tropical ${nombreCorto(p.eventname)}`),
    crearElemento('p', `Alerta GDACS: ${nombreAlertaGdacs(p.episodealertlevel) ?? 'sin dato'}`),
    crearElemento('p', `Actualizado: ${formatearFechaHora(p.fechaModificacion)}`),
  )
  const enlace = crearEnlaceSeguro('Ver reporte de GDACS', p.urlReporte)
  if (enlace) contenido.append(enlace)
  return contenido
}

function fuenteGeojson(id, datos) {
  return { id, definicion: () => ({ type: 'geojson', data: datos ?? COLECCION_VACIA }) }
}

// Dibuja los ciclones: cono de pronóstico, trayectoria, avisos en la costa,
// puntos de pronóstico del NHC y ciclones que solo reporta GDACS.
// No muestra nada en React (devuelve null): todo se dibuja dentro de MapLibre.
function CapaCiclones({ mapa, nhc, eventosGdacs, visible = true }) {
  function abrirPopup(evento, crearContenido) {
    const feature = evento.features?.[0]
    if (!feature) return
    // MapLibre entrega [longitud, latitud], en ese orden
    const [longitud, latitud] = feature.geometry.coordinates
    new Popup({ maxWidth: '280px' })
      .setLngLat([longitud, latitud])
      .setDOMContent(crearContenido(feature))
      .addTo(mapa)
  }

  useCapasMapa(mapa, {
    fuentes: [
      fuenteGeojson('ciclones-conos', nhc?.conos),
      fuenteGeojson('ciclones-trayectorias', nhc?.trayectorias),
      fuenteGeojson('ciclones-avisos', nhc?.avisos),
      fuenteGeojson('ciclones-puntos', nhc?.puntos),
      fuenteGeojson('ciclones-gdacs', eventosGdacs),
    ],
    capas: [
      {
        id: 'ciclones-conos-relleno',
        type: 'fill',
        source: 'ciclones-conos',
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.25 },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-conos-borde',
        type: 'line',
        source: 'ciclones-conos',
        paint: { 'line-color': '#374151', 'line-width': 1.5 },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-avisos',
        type: 'line',
        source: 'ciclones-avisos',
        paint: { 'line-color': colorSegun('tcww', AVISOS_COSTA, 'codigo'), 'line-width': 4 },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-trayectorias',
        type: 'line',
        source: 'ciclones-trayectorias',
        paint: { 'line-color': '#111827', 'line-width': 2, 'line-dasharray': [2, 2] },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-puntos',
        type: 'circle',
        source: 'ciclones-puntos',
        paint: {
          'circle-color': '#7c3aed',
          // La posición actual (tau 0) se ve más grande que los puntos de pronóstico
          'circle-radius': ['case', ['==', ['get', 'tau'], 0], 9, 5],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-nombres',
        type: 'symbol',
        source: 'ciclones-puntos',
        filter: ['==', ['get', 'tau'], 0],
        layout: {
          // Nombre en español que agrega services/nhc.js ("Huracán Trudy")
          'text-field': ['get', 'nombreEtiqueta'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 14,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-gdacs',
        type: 'circle',
        source: 'ciclones-gdacs',
        paint: {
          'circle-color': colorSegun('episodealertlevel', COLORES_ALERTA_GDACS, 'nivel'),
          'circle-radius': 9,
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 2,
        },
        antesDe: DEBAJO_DE_SISMOS,
      },
      // Capas invisibles más grandes para tocar con el dedo
      {
        id: 'ciclones-puntos-toque',
        type: 'circle',
        source: 'ciclones-puntos',
        paint: { 'circle-radius': 18, 'circle-opacity': 0 },
        antesDe: DEBAJO_DE_SISMOS,
      },
      {
        id: 'ciclones-gdacs-toque',
        type: 'circle',
        source: 'ciclones-gdacs',
        paint: { 'circle-radius': 18, 'circle-opacity': 0 },
        antesDe: DEBAJO_DE_SISMOS,
      },
    ],
    clics: {
      'ciclones-puntos-toque': (evento) => abrirPopup(evento, crearPopupNhc),
      'ciclones-gdacs-toque': (evento) => abrirPopup(evento, crearPopupGdacs),
    },
    visible,
  })

  // Cuando llegan datos nuevos, se actualizan las fuentes
  useEffect(() => {
    if (!mapa || !nhc) return
    mapa.getSource('ciclones-conos')?.setData(nhc.conos)
    mapa.getSource('ciclones-trayectorias')?.setData(nhc.trayectorias)
    mapa.getSource('ciclones-avisos')?.setData(nhc.avisos)
    mapa.getSource('ciclones-puntos')?.setData(nhc.puntos)
  }, [mapa, nhc])

  useEffect(() => {
    if (!mapa || !eventosGdacs) return
    mapa.getSource('ciclones-gdacs')?.setData(eventosGdacs)
  }, [mapa, eventosGdacs])

  return null
}

export default CapaCiclones
