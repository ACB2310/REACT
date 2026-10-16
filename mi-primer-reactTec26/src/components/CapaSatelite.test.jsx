import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import CapaSatelite from './CapaSatelite.jsx'
import { crearMapaFalso } from '../test/mapaFalso.js'

const HORA = '2026-10-16T21:30:00Z'
const URL_TESELAS = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/${HORA}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`

// Mapa base con calles abajo y nombres de ciudades encima
function mapaConEstilo() {
  return crearMapaFalso({
    capasEstilo: [
      { id: 'agua', type: 'fill' },
      { id: 'calles', type: 'line' },
      { id: 'nombres-ciudades', type: 'symbol' },
      { id: 'nombres-calles', type: 'symbol' },
    ],
  })
}

describe('CapaSatelite', () => {
  it('no agrega nada sin hora', () => {
    const mapa = mapaConEstilo()
    render(<CapaSatelite mapa={mapa} hora={null} visible />)

    expect(mapa.addSource).not.toHaveBeenCalled()
    expect(mapa.addLayer).not.toHaveBeenCalled()
  })

  it('agrega el satélite debajo de la primera capa de nombres', () => {
    const mapa = mapaConEstilo()
    render(<CapaSatelite mapa={mapa} hora={HORA} visible />)

    expect(mapa.fuentes.satelite.definicion).toEqual({
      type: 'raster',
      tiles: [URL_TESELAS],
      tileSize: 256,
      maxzoom: 7,
      attribution: 'Imágenes: NASA GIBS / NOAA GOES-East',
    })
    expect(mapa.orden).toEqual(['agua', 'calles', 'satelite', 'nombres-ciudades', 'nombres-calles'])
    expect(mapa.capas.satelite.paint['raster-opacity']).toBe(0.8)
  })

  it('cambia las teselas cuando llega una hora nueva', () => {
    const mapa = mapaConEstilo()
    const { rerender } = render(<CapaSatelite mapa={mapa} hora={HORA} visible />)

    rerender(<CapaSatelite mapa={mapa} hora="2026-10-16T21:40:00Z" visible />)

    expect(mapa.fuentes.satelite.setTiles).toHaveBeenLastCalledWith([
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/2026-10-16T21:40:00Z/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    ])
  })

  it('se oculta con visible false', () => {
    const mapa = mapaConEstilo()
    const { rerender } = render(<CapaSatelite mapa={mapa} hora={HORA} visible />)

    rerender(<CapaSatelite mapa={mapa} hora={HORA} visible={false} />)
    expect(mapa.capas.satelite.layout.visibility).toBe('none')
  })

  it('se quita al desmontar', () => {
    const mapa = mapaConEstilo()
    const { unmount } = render(<CapaSatelite mapa={mapa} hora={HORA} visible />)

    unmount()
    expect(mapa.capas.satelite).toBeUndefined()
    expect(mapa.fuentes.satelite).toBeUndefined()
  })
})
