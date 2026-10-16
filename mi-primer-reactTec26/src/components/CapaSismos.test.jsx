import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CapaSismos from './CapaSismos.jsx'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

// Se captura cada Popup que crea el componente
const { popups } = vi.hoisted(() => ({ popups: [] }))
vi.mock('maplibre-gl', () => {
  class Popup {
    constructor(opciones) {
      this.opciones = opciones
      popups.push(this)
    }
    setLngLat(coordenadas) {
      this.lngLat = coordenadas
      return this
    }
    setDOMContent(elemento) {
      this.contenido = elemento
      return this
    }
    addTo(mapa) {
      this.mapa = mapa
      return this
    }
  }
  return { Popup }
})

// Mapa falso que guarda fuentes, capas y manejadores como lo haría MapLibre
function crearMapaFalso() {
  const fuentes = {}
  const capas = {}
  const manejadores = {}
  return {
    fuentes,
    capas,
    manejadores,
    addSource: vi.fn((id, definicion) => {
      fuentes[id] = { definicion, setData: vi.fn() }
    }),
    getSource: vi.fn((id) => fuentes[id]),
    removeSource: vi.fn((id) => {
      delete fuentes[id]
    }),
    addLayer: vi.fn((capa) => {
      capas[capa.id] = capa
    }),
    getLayer: vi.fn((id) => capas[id]),
    removeLayer: vi.fn((id) => {
      delete capas[id]
    }),
    on: vi.fn((evento, capa, manejador) => {
      manejadores[`${evento}:${capa}`] = manejador
    }),
    off: vi.fn((evento, capa) => {
      delete manejadores[`${evento}:${capa}`]
    }),
  }
}

const sismoGuerrero = sismosEjemplo.features[1]
const sismoSinMagnitud = sismosEjemplo.features[3]

function hacerClic(mapa, sismo) {
  mapa.manejadores['click:sismos-circulos']({ features: [sismo] })
  return popups.at(-1)
}

describe('CapaSismos', () => {
  beforeEach(() => {
    popups.length = 0
  })

  it('no hace nada si mapa es null', () => {
    expect(() => render(<CapaSismos mapa={null} sismos={sismosEjemplo} />)).not.toThrow()
  })

  it('agrega la fuente y la capa con el color por magnitud', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)

    expect(mapa.fuentes.sismos.definicion).toEqual({ type: 'geojson', data: sismosEjemplo })
    const capa = mapa.capas['sismos-circulos']
    expect(capa.type).toBe('circle')
    expect(capa.source).toBe('sismos')
    expect(capa.paint['circle-color']).toEqual([
      'step', ['coalesce', ['get', 'mag'], 0], '#eab308', 4, '#f97316', 6, '#dc2626',
    ])
    expect(capa.paint['circle-radius']).toEqual([
      'interpolate', ['linear'], ['coalesce', ['get', 'mag'], 0], 2.5, 4, 7, 18,
    ])
  })

  it('actualiza con setData cuando la fuente ya existe', () => {
    const mapa = crearMapaFalso()
    const { rerender } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const nuevos = { ...sismosEjemplo, features: [sismoGuerrero] }

    rerender(<CapaSismos mapa={mapa} sismos={nuevos} />)

    expect(mapa.addSource).toHaveBeenCalledTimes(1)
    expect(mapa.fuentes.sismos.setData).toHaveBeenLastCalledWith(nuevos)
  })

  it('abre el popup en [lon, lat] del sismo', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)

    const popup = hacerClic(mapa, sismoGuerrero)

    expect(popup.lngLat).toEqual([-99.9, 17.0])
    expect(popup.mapa).toBe(mapa)
    const texto = popup.contenido.textContent
    expect(texto).toContain('M 6.3')
    expect(texto).toContain('15 km SO de Acapulco, Guerrero')
    expect(texto).toContain('Profundidad: 20 km')
    const enlace = popup.contenido.querySelector('a')
    expect(enlace.href).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/gro1')
    expect(enlace.target).toBe('_blank')
    expect(enlace.rel).toBe('noopener noreferrer')
    expect(enlace.textContent).toBe('Ver en USGS')
  })

  it('muestra el texto de place sin interpretarlo como HTML', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const peligroso = {
      ...sismoGuerrero,
      properties: { ...sismoGuerrero.properties, place: '<img src=x onerror=alert(1)>' },
    }

    const popup = hacerClic(mapa, peligroso)

    expect(popup.contenido.querySelector('img')).toBeNull()
    expect(popup.contenido.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('muestra "M ?" cuando mag es null', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)

    const popup = hacerClic(mapa, sismoSinMagnitud)

    expect(popup.contenido.textContent).toContain('M ?')
  })

  it('limpia capa, fuente y listener al desmontar', () => {
    const mapa = crearMapaFalso()
    const { unmount } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const manejador = mapa.manejadores['click:sismos-circulos']

    unmount()

    expect(mapa.off).toHaveBeenCalledWith('click', 'sismos-circulos', manejador)
    expect(mapa.capas['sismos-circulos']).toBeUndefined()
    expect(mapa.fuentes.sismos).toBeUndefined()
  })

  it('no falla al desmontar si MapaBase ya eliminó el mapa', () => {
    const mapa = crearMapaFalso()
    const { unmount } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    // Tras map.remove(), MapLibre lanza error al consultar capas o fuentes
    const errorMapaEliminado = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'getLayer')")
    }
    mapa.getLayer.mockImplementation(errorMapaEliminado)
    mapa.removeLayer.mockImplementation(errorMapaEliminado)

    expect(() => unmount()).not.toThrow()
  })
})
