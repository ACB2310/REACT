import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import MapaBase from './MapaBase.jsx'

// MapLibre necesita WebGL, que jsdom no tiene: se reemplaza por un mapa falso
const { instancias, setWorkerUrl } = vi.hoisted(() => ({ instancias: [], setWorkerUrl: vi.fn() }))
vi.mock('maplibre-gl', () => {
  class Map {
    constructor(opciones) {
      this.opciones = opciones
      this.manejadores = {}
      this.controles = []
      this.remove = vi.fn()
      this.setStyle = vi.fn()
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
  return { Map, NavigationControl, setWorkerUrl }
})

// Guarda la consulta de tema para poder simular que el sistema cambia de claro a oscuro
let consultaTema
function simularModoOscuro(activo) {
  window.matchMedia = vi.fn().mockImplementation((consulta) => {
    consultaTema = {
      matches: activo && consulta === '(prefers-color-scheme: dark)',
      media: consulta,
      oyentes: [],
      addEventListener: vi.fn((evento, oyente) => consultaTema.oyentes.push(oyente)),
      removeEventListener: vi.fn(),
    }
    return consultaTema
  })
}

describe('MapaBase', () => {
  beforeEach(() => {
    instancias.length = 0
    setWorkerUrl.mockReset()
    simularModoOscuro(false)
  })
  afterEach(() => {
    delete window.matchMedia
  })

  // Sin esto, Vite deja a MapLibre sin su worker: no se dibujan calles ni sismos
  it('le indica a MapLibre dónde está su worker antes de crear el mapa', () => {
    setWorkerUrl.mockImplementation(() => {
      expect(instancias).toHaveLength(0)
    })
    render(<MapaBase alCargar={() => {}} />)

    expect(setWorkerUrl).toHaveBeenCalled()
    expect(setWorkerUrl.mock.calls[0][0]).toMatch(/maplibre-gl-worker.mjs/)
    expect(instancias).toHaveLength(1)
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
  it('cambia al estilo oscuro si el sistema cambia de tema con la app abierta', () => {
    render(<MapaBase alCargar={() => {}} />)

    consultaTema.oyentes.forEach((oyente) => oyente({ matches: true }))
    expect(instancias[0].setStyle).toHaveBeenLastCalledWith(
      'https://tiles.openfreemap.org/styles/dark',
      { diff: false },
    )

    consultaTema.oyentes.forEach((oyente) => oyente({ matches: false }))
    expect(instancias[0].setStyle).toHaveBeenLastCalledWith(
      'https://tiles.openfreemap.org/styles/liberty',
      { diff: false },
    )
  })

  it('deja de escuchar el tema del sistema al desmontar', () => {
    const { unmount } = render(<MapaBase alCargar={() => {}} />)
    const [oyente] = consultaTema.oyentes

    unmount()
    expect(consultaTema.removeEventListener).toHaveBeenCalledWith('change', oyente)
  })

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
