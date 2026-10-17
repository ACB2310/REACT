import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CapaIncidentes from './CapaIncidentes.jsx'
import CapaBasesBrigadas from './CapaBasesBrigadas.jsx'
import { popups } from '../test/maplibreFalso.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))

function incidente(propiedades) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-103.36, 20.68] },
    properties: { id: 1, tipo: 'rescate', prioridad: 1, estado: 'asignado', creadoEn: Date.now() - 5 * 60000, ...propiedades },
  }
}
const COLECCION = { type: 'FeatureCollection', features: [incidente()] }

describe('CapaIncidentes', () => {
  beforeEach(() => {
    popups.length = 0
  })

  it('agrega el círculo por prioridad, el número y la capa para tocar', () => {
    const mapa = crearMapaFalso()
    render(<CapaIncidentes mapa={mapa} incidentes={COLECCION} />)

    expect(mapa.fuentes.incidentes.definicion).toEqual({ type: 'geojson', data: COLECCION })
    expect(mapa.orden).toEqual(['incidentes-puntos', 'incidentes-prioridad', 'incidentes-toque'])
    expect(mapa.capas['incidentes-puntos'].paint['circle-color'][1]).toEqual(['get', 'prioridad'])
    expect(mapa.capas['incidentes-prioridad'].layout['text-field']).toEqual(['to-string', ['get', 'prioridad']])
  })

  it('el popup dice tipo, prioridad, estado, brigada y antigüedad', () => {
    const mapa = crearMapaFalso()
    render(<CapaIncidentes mapa={mapa} incidentes={COLECCION} />)

    mapa.manejadores['click:incidentes-toque']({ features: [incidente({ brigadaNombre: 'Alfa' })] })
    const popup = popups.at(-1)

    expect(popup.lngLat).toEqual([-103.36, 20.68])
    const texto = popup.contenido.textContent
    expect(texto).toContain('Rescate')
    expect(texto).toContain('Prioridad 1 · Crítica')
    expect(texto).toContain('Brigada asignada')
    expect(texto).toContain('Brigada: Alfa')
    expect(texto).toContain('Creado hace 5 min')
  })

  it('la descripción no se interpreta como HTML', () => {
    const mapa = crearMapaFalso()
    render(<CapaIncidentes mapa={mapa} incidentes={COLECCION} />)

    mapa.manejadores['click:incidentes-toque']({ features: [incidente({ descripcion: '<img src=x onerror=alert(1)>' })] })

    expect(popups.at(-1).contenido.querySelector('img')).toBeNull()
  })

  it('se oculta con visible false', () => {
    const mapa = crearMapaFalso()
    render(<CapaIncidentes mapa={mapa} incidentes={COLECCION} visible={false} />)
    expect(mapa.capas['incidentes-puntos'].layout.visibility).toBe('none')
  })
})

describe('CapaBasesBrigadas', () => {
  beforeEach(() => {
    popups.length = 0
  })

  it('el popup dice nombre, estado, vehículo y miembros', () => {
    const mapa = crearMapaFalso()
    render(<CapaBasesBrigadas mapa={mapa} brigadas={{ type: 'FeatureCollection', features: [] }} />)

    mapa.manejadores['click:brigadas-toque']({
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-103.41, 20.72] },
          properties: { nombre: 'Alfa', estado: 'en_camino', vehiculo: 'Pickup', miembros: 1 },
        },
      ],
    })
    const texto = popups.at(-1).contenido.textContent

    expect(texto).toContain('Alfa')
    expect(texto).toContain('Base · En camino')
    expect(texto).toContain('Vehículo: Pickup')
    expect(texto).toContain('1 brigadista')
  })
})
