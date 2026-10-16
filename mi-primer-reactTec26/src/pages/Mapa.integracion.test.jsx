import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useEffect } from 'react'
import Mapa from './Mapa.jsx'
import { useSismos } from '../hooks/useSismos.js'
import { useCiclones } from '../hooks/useCiclones.js'
import { useSatelite } from '../hooks/useSatelite.js'
import { sismosEjemplo } from '../mocks/sismosEjemplo.js'
import { nhcEjemplo } from '../mocks/ciclonesEjemplo.js'
import { crearMapaFalso } from '../test/mapaFalso.js'

// Prueba la conexión real entre la página y las capas: el mapa que entrega
// MapaBase debe llegar a CapaSismos y CapaCiclones, y ahí se agregan los datos.
// Los hooks se simulan para que la prueba no salga a internet.
const { mapaFalso } = vi.hoisted(() => ({ mapaFalso: { actual: null } }))
vi.mock('maplibre-gl', () => import('../test/maplibreFalso.js'))
vi.mock('../hooks/useSismos.js', () => ({ useSismos: vi.fn() }))
vi.mock('../hooks/useCiclones.js', () => ({ useCiclones: vi.fn() }))
vi.mock('../hooks/useSatelite.js', () => ({ useSatelite: vi.fn() }))
vi.mock('../components/MapaBase.jsx', () => ({
  default: function MapaBaseFalso({ alCargar }) {
    useEffect(() => {
      alCargar(mapaFalso.actual)
    }, [alCargar])
    return null
  },
}))

const VACIA = { type: 'FeatureCollection', features: [] }

function estadoListo(datos, actualizadoEn) {
  return { datos, estado: 'listo', error: null, actualizadoEn, sinConexion: false, recargar: vi.fn() }
}

describe('Página Mapa con las capas reales', () => {
  it('agrega sismos y ciclones al mapa que entrega MapaBase, con los ciclones debajo', () => {
    mapaFalso.actual = crearMapaFalso()
    useSismos.mockReturnValue({
      sismos: sismosEjemplo,
      estado: 'listo',
      error: null,
      actualizadoEn: 1700000000000,
      sinConexion: false,
      recargar: vi.fn(),
    })
    useCiclones.mockReturnValue({
      nhc: estadoListo(nhcEjemplo, 1792184930000),
      gdacs: estadoListo(VACIA, null),
      ciclones: [],
      eventosGdacsSinNhc: VACIA,
    })
    useSatelite.mockReturnValue(estadoListo(null, null))

    render(<Mapa />)

    const mapa = mapaFalso.actual
    expect(mapa.fuentes.sismos.definicion).toEqual({ type: 'geojson', data: sismosEjemplo })
    expect(mapa.fuentes['ciclones-conos'].definicion).toEqual({ type: 'geojson', data: nhcEjemplo.conos })
    // Los ciclones se agregan después pero quedan debajo de los sismos
    expect(mapa.orden.indexOf('ciclones-conos-relleno')).toBeLessThan(mapa.orden.indexOf('sismos-circulos'))
    // Sin hora todavía, el satélite no se agrega
    expect(mapa.fuentes.satelite).toBeUndefined()
  })
})
