import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CapaZonasPeligro from './CapaZonasPeligro.jsx'
import CapaRutasEvacuacion from './CapaRutasEvacuacion.jsx'
import { popups } from '../test/maplibreFalso.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))

const ZONAS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-103.35, 20.67], [-103.34, 20.67], [-103.34, 20.68], [-103.35, 20.67]]] },
      properties: { id: 1, severidad: 1, descripcion: '<b>Fuga</b> de gas', creadoEn: Date.UTC(2026, 9, 17, 18) },
    },
  ],
}

describe('CapaZonasPeligro', () => {
  beforeEach(() => {
    popups.length = 0
  })

  it('agrega relleno y borde punteado con color por severidad', () => {
    const mapa = crearMapaFalso()
    render(<CapaZonasPeligro mapa={mapa} zonas={ZONAS} />)

    expect(mapa.orden).toEqual(['zonas-peligro-relleno', 'zonas-peligro-borde'])
    expect(mapa.capas['zonas-peligro-relleno'].paint['fill-color']).toEqual(['match', ['get', 'severidad'], 2, '#f59e0b', '#dc2626'])
    expect(mapa.capas['zonas-peligro-borde'].paint['line-dasharray']).toEqual([2, 1.5])
  })

  it('el popup explica la zona y no interpreta HTML', () => {
    const mapa = crearMapaFalso()
    render(<CapaZonasPeligro mapa={mapa} zonas={ZONAS} />)

    mapa.manejadores['click:zonas-peligro-relleno']({ features: ZONAS.features, lngLat: { lng: -103.345, lat: 20.672 } })
    const popup = popups.at(-1)

    expect(popup.contenido.textContent).toContain('Zona de peligro: las rutas la evitan')
    expect(popup.contenido.textContent).toContain('<b>Fuga</b> de gas')
    expect(popup.contenido.querySelector('b')).toBeNull()
  })

  it('se oculta con visible false', () => {
    const mapa = crearMapaFalso()
    render(<CapaZonasPeligro mapa={mapa} zonas={ZONAS} visible={false} />)
    expect(mapa.capas['zonas-peligro-relleno'].layout.visibility).toBe('none')
  })
})

describe('CapaRutasEvacuacion con una ruta en línea', () => {
  it('la ruta de OpenRouteService se colorea por modo (azul a pie, morada en carro)', () => {
    const mapa = { ...crearMapaFalso(), fitBounds: vi.fn() }
    const ruta = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-103.35, 20.67], [-103.34, 20.67]] }, properties: { modo: 'carro' } }
    render(<CapaRutasEvacuacion mapa={mapa} ruta={ruta} origen={[-103.35, 20.67]} destino={[-103.34, 20.67]} />)

    const color = mapa.capas['evacuacion-ruta'].paint['line-color']
    expect(color[0]).toBe('case')
    expect(color[2]).toEqual(['match', ['get', 'modo'], 'carro', '#7c3aed', '#1d4ed8'])
    expect(mapa.fuentes['evacuacion-ruta'].definicion.data).toBe(ruta)
  })
})
