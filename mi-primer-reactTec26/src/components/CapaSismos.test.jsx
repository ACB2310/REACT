import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import CapaSismos from './CapaSismos.jsx'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'
import { agregarProfundidad } from '../utils/sismos.js'
import { popups } from '../test/maplibreFalso.js'
import { crearMapaFalso, comoLoDevuelveMapLibre } from '../test/mapaFalso.js'

vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))

const sismosPreparados = agregarProfundidad(sismosEjemplo)

const sismoGuerrero = comoLoDevuelveMapLibre(sismosPreparados.features[1])
const sismoSinMagnitud = comoLoDevuelveMapLibre(sismosPreparados.features[3])

function hacerClic(mapa, sismo) {
  mapa.manejadores['click:sismos-toque']({ features: [sismo] })
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

  it('agrega una capa invisible más grande para tocar con el dedo', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)

    const capaToque = mapa.capas['sismos-toque']
    expect(capaToque.type).toBe('circle')
    expect(capaToque.source).toBe('sismos')
    expect(capaToque.paint['circle-radius']).toBe(16)
    expect(capaToque.paint['circle-opacity']).toBe(0)
    expect(mapa.manejadores['click:sismos-toque']).toBeTypeOf('function')
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

  it('no pone el enlace si la url no es https', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const conUrlPeligrosa = {
      ...sismoGuerrero,
      properties: { ...sismoGuerrero.properties, url: 'javascript:alert(1)' },
    }

    const popup = hacerClic(mapa, conUrlPeligrosa)

    expect(popup.contenido.querySelector('a')).toBeNull()
    expect(popup.contenido.textContent).toContain('M 6.3')
  })

  it('muestra "M ?" cuando mag es null', () => {
    const mapa = crearMapaFalso()
    render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)

    const popup = hacerClic(mapa, sismoSinMagnitud)

    expect(popup.contenido.textContent).toContain('M ?')
  })

  // Al cambiar a modo oscuro MapLibre carga otro estilo y borra las capas propias
  it('vuelve a agregar fuente y capas con los sismos actuales cuando cambia el estilo', () => {
    const mapa = crearMapaFalso()
    const { rerender } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const nuevos = { ...sismosEjemplo, features: [sismoGuerrero] }
    rerender(<CapaSismos mapa={mapa} sismos={nuevos} />)

    // Simula el cambio de estilo: MapLibre quita todo y luego avisa con 'style.load'
    delete mapa.fuentes.sismos
    delete mapa.capas['sismos-circulos']
    delete mapa.capas['sismos-toque']
    mapa.manejadores['style.load']()

    expect(mapa.fuentes.sismos.definicion.data).toBe(nuevos)
    expect(mapa.capas['sismos-circulos']).toBeDefined()
    expect(mapa.capas['sismos-toque']).toBeDefined()
  })

  it('deja de escuchar los cambios de estilo al desmontar', () => {
    const mapa = crearMapaFalso()
    const { unmount } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const manejador = mapa.manejadores['style.load']

    unmount()

    expect(mapa.off).toHaveBeenCalledWith('style.load', manejador)
  })

  it('oculta los sismos con visible false', () => {
    const mapa = crearMapaFalso()
    const { rerender } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    expect(mapa.capas['sismos-circulos'].layout.visibility).toBe('visible')

    rerender(<CapaSismos mapa={mapa} sismos={sismosEjemplo} visible={false} />)
    expect(mapa.capas['sismos-circulos'].layout.visibility).toBe('none')
    expect(mapa.capas['sismos-toque'].layout.visibility).toBe('none')
  })

  it('limpia capa, fuente y listener al desmontar', () => {
    const mapa = crearMapaFalso()
    const { unmount } = render(<CapaSismos mapa={mapa} sismos={sismosEjemplo} />)
    const manejador = mapa.manejadores['click:sismos-toque']

    unmount()

    expect(mapa.off).toHaveBeenCalledWith('click', 'sismos-toque', manejador)
    expect(mapa.capas['sismos-circulos']).toBeUndefined()
    expect(mapa.capas['sismos-toque']).toBeUndefined()
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
