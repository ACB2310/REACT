import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useEffect } from 'react'
import Mapa from './Mapa.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'

// Prueba la conexión real entre la página y CapaSismos: el mapa que entrega
// MapaBase debe llegar a CapaSismos y ahí se agregan los sismos.
const { mapaFalso } = vi.hoisted(() => ({
  mapaFalso: {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    // Como un mapa recién cargado: todavía no existe la fuente "sismos"
    getSource: vi.fn(),
    getLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}))
vi.mock('maplibre-gl', () => ({ Popup: class {} }))
vi.mock('../hooks/useSismos.js', () => ({ useSismos: vi.fn() }))
vi.mock('../components/MapaBase.jsx', () => ({
  default: function MapaBaseFalso({ alCargar }) {
    useEffect(() => {
      alCargar(mapaFalso)
    }, [alCargar])
    return null
  },
}))

describe('Página Mapa con CapaSismos real', () => {
  it('agrega los sismos al mapa que entrega MapaBase', () => {
    useSismos.mockReturnValue({
      sismos: sismosEjemplo,
      estado: 'listo',
      error: null,
      actualizadoEn: 1700000000000,
      sinConexion: false,
      recargar: vi.fn(),
    })
    render(<Mapa />)

    expect(mapaFalso.addSource).toHaveBeenCalledWith('sismos', { type: 'geojson', data: sismosEjemplo })
    expect(mapaFalso.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'sismos-circulos' }))
  })
})
