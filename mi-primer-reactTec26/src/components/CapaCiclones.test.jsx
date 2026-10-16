import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CapaCiclones from './CapaCiclones.jsx'
import { nhcEjemplo, eventosGdacsEjemplo } from '../mocks/ciclonesEjemplo.js'
import { popups } from '../test/maplibreFalso.js'
import { crearMapaFalso, comoLoDevuelveMapLibre } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))

const IDS_CAPAS = [
  'ciclones-conos-relleno',
  'ciclones-conos-borde',
  'ciclones-avisos',
  'ciclones-trayectorias',
  'ciclones-puntos',
  'ciclones-nombres',
  'ciclones-gdacs',
  'ciclones-puntos-toque',
  'ciclones-gdacs-toque',
]

function mapaConSismos() {
  return crearMapaFalso({ capasEstilo: [{ id: 'sismos-circulos', type: 'circle' }] })
}

const trudyActual = comoLoDevuelveMapLibre(nhcEjemplo.puntos.features[0])
const trudyPronostico = comoLoDevuelveMapLibre(nhcEjemplo.puntos.features[1])
const simon = comoLoDevuelveMapLibre(eventosGdacsEjemplo.features[0])

function tocar(mapa, capa, feature) {
  mapa.manejadores[`click:${capa}`]({ features: [feature] })
  return popups.at(-1)
}

describe('CapaCiclones', () => {
  beforeEach(() => {
    popups.length = 0
  })

  it('agrega las capas de ciclones debajo de los sismos', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={eventosGdacsEjemplo} />)

    expect(mapa.orden).toEqual([...IDS_CAPAS, 'sismos-circulos'])
    expect(mapa.fuentes['ciclones-conos'].definicion).toEqual({ type: 'geojson', data: nhcEjemplo.conos })
    expect(mapa.fuentes['ciclones-gdacs'].definicion).toEqual({ type: 'geojson', data: eventosGdacsEjemplo })
  })

  it('pinta los avisos con los colores del NHC', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)

    expect(mapa.capas['ciclones-avisos'].paint['line-color']).toEqual([
      'match', ['get', 'tcww'],
      'HWR', '#dc2626',
      'HWA', '#f472b6',
      'TWR', '#2563eb',
      'TWA', '#facc15',
      '#6b7280',
    ])
  })

  it('la etiqueta del mapa usa el nombre en español', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)

    expect(mapa.capas['ciclones-nombres'].layout['text-field']).toEqual(['get', 'nombreEtiqueta'])
  })

  it('pinta los puntos de GDACS según su alerta actual', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={null} eventosGdacs={eventosGdacsEjemplo} />)

    expect(mapa.capas['ciclones-gdacs'].paint['circle-color']).toEqual([
      'match', ['get', 'episodealertlevel'],
      'Green', '#16a34a',
      'Orange', '#f97316',
      'Red', '#dc2626',
      '#6b7280',
    ])
  })

  it('popup de NHC en español con km/h', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)

    const popup = tocar(mapa, 'ciclones-puntos-toque', trudyActual)

    expect(popup.lngLat).toEqual([-102, 15])
    const texto = popup.contenido.textContent
    expect(texto).toContain('Huracán Trudy')
    expect(texto).toContain('Posición actual')
    expect(texto).toContain('Viento: 139 km/h (ráfagas 167 km/h)')
    expect(texto).toContain('Presión: 982 hPa')
    expect(texto).toContain('Aviso NHC 14')
    const enlace = popup.contenido.querySelector('a')
    expect(enlace.textContent).toBe('Ver avisos del NHC')
    expect(enlace.href).toBe('https://www.nhc.noaa.gov/?epac')
  })

  it('el popup de un punto futuro dice a cuántas horas es el pronóstico', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)

    const popup = tocar(mapa, 'ciclones-puntos-toque', trudyPronostico)
    expect(popup.contenido.textContent).toContain('Pronóstico a 12 h')
  })

  it('no muestra la presión 9999 que NOAA usa como "sin dato"', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)

    const popup = tocar(mapa, 'ciclones-puntos-toque', trudyPronostico)
    expect(popup.contenido.textContent).not.toContain('9999')
    expect(popup.contenido.textContent).not.toContain('Presión')
  })

  it('sin dato de viento no escribe "null"', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)
    const original = nhcEjemplo.puntos.features[0]
    const sinViento = comoLoDevuelveMapLibre({
      ...original,
      properties: { ...original.properties, maxwind: null, gust: null },
    })

    const popup = tocar(mapa, 'ciclones-puntos-toque', sinViento)
    expect(popup.contenido.textContent).not.toContain('null')
    expect(popup.contenido.textContent).toContain('Viento: sin dato')
  })

  it('no muestra presión si NHC la manda en 0', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)
    const sinPresion = { ...trudyActual, properties: { ...trudyActual.properties, mslp: 0 } }

    const popup = tocar(mapa, 'ciclones-puntos-toque', sinPresion)
    expect(popup.contenido.textContent).not.toContain('Presión')
  })

  it('popup de GDACS con la alerta en español', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={null} eventosGdacs={eventosGdacsEjemplo} />)

    const popup = tocar(mapa, 'ciclones-gdacs-toque', simon)

    expect(popup.lngLat).toEqual([-110.3, 21.5])
    const texto = popup.contenido.textContent
    expect(texto).toContain('Ciclón tropical Simon')
    expect(texto).toContain('Alerta GDACS: verde')
    expect(texto).toMatch(/Actualizado: 16 oct\.? 2026, 14:53/)
    expect(popup.contenido.querySelector('a').href).toBe(
      'https://www.gdacs.org/report.aspx?eventid=1001335&episodeid=38&eventtype=TC',
    )
  })

  it('no pone enlace de GDACS si no hay urlReporte', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={null} eventosGdacs={eventosGdacsEjemplo} />)
    const original = eventosGdacsEjemplo.features[0]
    const sinUrl = comoLoDevuelveMapLibre({ ...original, properties: { ...original.properties, urlReporte: null } })

    const popup = tocar(mapa, 'ciclones-gdacs-toque', sinUrl)
    expect(popup.contenido.querySelector('a')).toBeNull()
  })

  it('el texto de NOAA no se interpreta como HTML', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} />)
    const peligroso = { ...trudyActual, properties: { ...trudyActual.properties, stormname: '<img src=x onerror=alert(1)>' } }

    const popup = tocar(mapa, 'ciclones-puntos-toque', peligroso)
    expect(popup.contenido.querySelector('img')).toBeNull()
  })

  it('actualiza los datos con setData', () => {
    const mapa = mapaConSismos()
    const { rerender } = render(<CapaCiclones mapa={mapa} nhc={null} eventosGdacs={null} />)

    rerender(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={eventosGdacsEjemplo} />)

    expect(mapa.fuentes['ciclones-conos'].setData).toHaveBeenLastCalledWith(nhcEjemplo.conos)
    expect(mapa.fuentes['ciclones-puntos'].setData).toHaveBeenLastCalledWith(nhcEjemplo.puntos)
    expect(mapa.fuentes['ciclones-gdacs'].setData).toHaveBeenLastCalledWith(eventosGdacsEjemplo)
  })

  it('se oculta con visible false', () => {
    const mapa = mapaConSismos()
    render(<CapaCiclones mapa={mapa} nhc={nhcEjemplo} eventosGdacs={null} visible={false} />)

    for (const id of IDS_CAPAS) expect(mapa.capas[id].layout.visibility).toBe('none')
  })
})
