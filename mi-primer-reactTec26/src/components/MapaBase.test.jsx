import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import MapaBase from './MapaBase.jsx'

// MapLibre necesita WebGL, que jsdom no tiene: se reemplaza por un mapa falso
const { instancias } = vi.hoisted(() => ({ instancias: [] }))
vi.mock('maplibre-gl', () => {
  class Map {
    constructor(opciones) {
      this.opciones = opciones
      this.manejadores = {}
      this.controles = []
      this.remove = vi.fn()
      instancias.push(this)
    }
    on(evento, manejador) {
      this.manejadores[evento] = manejador
    }
    addControl(control, posicion) {
      this.controles.push({ control, posicion })
    }
  }
  class NavigationControl {}
  return { Map, NavigationControl }
})

function simularModoOscuro(activo) {
  window.matchMedia = vi.fn().mockImplementation((consulta) => ({
    matches: activo && consulta === '(prefers-color-scheme: dark)',
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

describe('MapaBase', () => {
  beforeEach(() => {
    instancias.length = 0
    simularModoOscuro(false)
  })
  afterEach(() => {
    delete window.matchMedia
  })

  it('crea el mapa centrado en México con [lon, lat] dentro de su contenedor', () => {
    const { container } = render(<MapaBase alCargar={() => {}} />)
    const { opciones } = instancias[0]

    expect(opciones.center).toEqual([-102.5, 23.6])
    expect(opciones.zoom).toBe(4)
    expect(opciones.container).toBe(container.firstChild)
    expect(opciones.style).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('usa el estilo oscuro cuando el sistema está en modo oscuro', () => {
    simularModoOscuro(true)
    render(<MapaBase alCargar={() => {}} />)
    expect(instancias[0].opciones.style).toBe('https://tiles.openfreemap.org/styles/dark')
  })

  // 'load' espera a que bajen todas las teselas del mapa base; con mala señal
  // eso tarda mucho. Con 'style.load' los sismos se pueden dibujar antes.
  it('llama alCargar en cuanto carga el estilo, sin esperar todas las teselas', () => {
    const alCargar = vi.fn()
    render(<MapaBase alCargar={alCargar} />)
    expect(alCargar).not.toHaveBeenCalled()

    instancias[0].manejadores['style.load']()
    expect(alCargar).toHaveBeenCalledWith(instancias[0])
  })

  it('avisa con alFallar si el estilo del mapa base no carga', () => {
    const alFallar = vi.fn()
    render(<MapaBase alCargar={() => {}} alFallar={alFallar} />)

    instancias[0].manejadores.error({ error: new Error('Failed to fetch') })
    expect(alFallar).toHaveBeenCalledTimes(1)
  })

  it('no avisa por errores de teselas sueltas una vez cargado el estilo', () => {
    const alFallar = vi.fn()
    render(<MapaBase alCargar={() => {}} alFallar={alFallar} />)

    instancias[0].manejadores['style.load']()
    instancias[0].manejadores.error({ error: new Error('tesela 404') })
    expect(alFallar).not.toHaveBeenCalled()
  })

  it('usa la versión más reciente de alCargar sin crear otro mapa', () => {
    const primera = vi.fn()
    const segunda = vi.fn()
    const { rerender } = render(<MapaBase alCargar={primera} />)
    rerender(<MapaBase alCargar={segunda} />)

    instancias[0].manejadores['style.load']()
    expect(instancias).toHaveLength(1)
    expect(primera).not.toHaveBeenCalled()
    expect(segunda).toHaveBeenCalledWith(instancias[0])
  })

  it('elimina el mapa al desmontar', () => {
    const { unmount } = render(<MapaBase alCargar={() => {}} />)
    unmount()
    expect(instancias[0].remove).toHaveBeenCalledTimes(1)
  })
})
